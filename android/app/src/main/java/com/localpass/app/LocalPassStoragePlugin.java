package com.localpass.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * LocalPass - Android storage bridge.
 *
 * Mirrors the Electron preload contract, so the renderer keeps using
 * `window.localpass` on every platform and the domain code stays untouched.
 *
 * Two different stores live behind the same plugin:
 *   - the vault in the app-private directory, written atomically (temporary
 *     file + fsync + rename), with the chosen sync folder kept in
 *     SharedPreferences (excluded from backup);
 *   - the device change logs in a folder the user picks with the Storage
 *     Access Framework, which is the only portable way to share a directory
 *     with another app (Syncthing) without broad storage permissions.
 */
@CapacitorPlugin(name = "LocalPassStorage")
public class LocalPassStoragePlugin extends Plugin {

    private static final String VAULT_FILE = "vault.enc.json";
    private static final String PREFS = "localpass";
    private static final String SYNC_TREE_KEY = "syncTreeUri";

    /** A vault with 5,000 accounts stays well under this. */
    private static final int MAX_STORED_BYTES = 5 * 1024 * 1024;

    private static final Pattern DEVICE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    private static final Pattern CHANGE_LOG = Pattern.compile("^changes-([A-Za-z0-9_-]{1,64})\\.enc\\.json$");

    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private final Handler main = new Handler(Looper.getMainLooper());

    // ---------------------------------------------------------------- helpers

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String storedTree() {
        return prefs().getString(SYNC_TREE_KEY, null);
    }

    private DocumentFile tree() {
        String stored = storedTree();
        if (stored == null) return null;
        try {
            return DocumentFile.fromTreeUri(getContext(), Uri.parse(stored));
        } catch (Exception error) {
            return null;
        }
    }

    /** The renderer only ever sends a serialized envelope. */
    private String assertPayload(String payload) {
        if (payload == null) throw new IllegalArgumentException("invalid_argument");
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_STORED_BYTES) throw new IllegalArgumentException("payload_too_large");

        try {
            Object parsed = new JSONObject(payload);
            if (!(parsed instanceof JSONObject)) throw new IllegalArgumentException("invalid_argument");
        } catch (Exception error) {
            throw new IllegalArgumentException("invalid_argument");
        }

        return payload;
    }

    private String assertDeviceId(String deviceId) {
        if (deviceId == null || !DEVICE_ID.matcher(deviceId).matches()) {
            throw new IllegalArgumentException("invalid_argument");
        }
        return deviceId;
    }

    private File vaultFile() {
        return new File(getContext().getFilesDir(), VAULT_FILE);
    }

    private static void restrictToOwner(File file) {
        // 0600: owner read/write only. Android runs each app in its own uid,
        // so this is belt and braces on top of the sandbox.
        file.setReadable(false, false);
        file.setReadable(true, true);
        file.setWritable(false, false);
        file.setWritable(true, true);
    }

    private void writeFileAtomic(File target, String contents) throws Exception {
        File directory = target.getParentFile();
        if (directory != null && !directory.exists() && !directory.mkdirs()) {
            throw new java.io.IOException("mkdir_failed");
        }

        File temporary = new File(directory, "." + target.getName() + "." + System.nanoTime() + ".tmp");

        try (FileOutputStream stream = new FileOutputStream(temporary, false)) {
            stream.write(contents.getBytes(StandardCharsets.UTF_8));
            stream.flush();
            stream.getFD().sync();
        } catch (Exception error) {
            temporary.delete();
            throw error;
        }

        restrictToOwner(temporary);

        // POSIX rename() replaces the target atomically, so the old vault is
        // never missing. Some exotic providers refuse to overwrite; only then
        // fall back to delete + rename.
        if (!temporary.renameTo(target)) {
            if (target.exists() && !target.delete()) {
                temporary.delete();
                throw new java.io.IOException("replace_failed");
            }
            if (!temporary.renameTo(target)) {
                temporary.delete();
                throw new java.io.IOException("rename_failed");
            }
        }

        restrictToOwner(target);
    }

    private String readText(File file) throws Exception {
        if (!file.exists()) return null;
        try (FileInputStream stream = new FileInputStream(file)) {
            return new String(readAll(stream), StandardCharsets.UTF_8);
        }
    }

    private static byte[] readAll(InputStream stream) throws Exception {
        java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        while ((read = stream.read(chunk)) != -1) {
            buffer.write(chunk, 0, read);
        }
        return buffer.toByteArray();
    }

    private DocumentFile child(String fileName) {
        DocumentFile directory = tree();
        if (directory == null) return null;
        return directory.findFile(fileName);
    }

    /**
     * The Storage Access Framework has no atomic rename across providers, so the
     * write goes to a sibling first and the final name is only created once the
     * bytes are on disk. Providers that refuse the rename fall back to an
     * in-place truncate, which is what every file manager does anyway.
     */
    private void writeTreeFile(String fileName, String contents) throws Exception {
        DocumentFile directory = tree();
        if (directory == null) throw new IllegalStateException("folder_not_chosen");

        String temporaryName = fileName + ".tmp";
        DocumentFile temporary = directory.findFile(temporaryName);
        if (temporary != null) temporary.delete();
        temporary = directory.createFile("application/json", temporaryName);
        if (temporary == null) throw new IllegalStateException("write_failed");

        ContentResolver resolver = getContext().getContentResolver();
        try (OutputStream stream = resolver.openOutputStream(temporary.getUri(), "wt")) {
            if (stream == null) throw new IllegalStateException("write_failed");
            stream.write(contents.getBytes(StandardCharsets.UTF_8));
            stream.flush();
        } catch (Exception error) {
            temporary.delete();
            throw error;
        }

        DocumentFile previous = directory.findFile(fileName);
        if (previous != null) previous.delete();

        if (!temporary.renameTo(fileName)) {
            // Fallback: keep the bytes, give up on the atomic swap.
            DocumentFile target = directory.createFile("application/json", fileName);
            if (target == null) {
                temporary.delete();
                throw new IllegalStateException("write_failed");
            }
            try (OutputStream stream = resolver.openOutputStream(target.getUri(), "wt")) {
                if (stream == null) throw new IllegalStateException("write_failed");
                stream.write(contents.getBytes(StandardCharsets.UTF_8));
                stream.flush();
            }
            temporary.delete();
        }
    }

    private String readTreeFile(String fileName) throws Exception {
        DocumentFile file = child(fileName);
        if (file == null || !file.exists()) return null;

        try (InputStream stream = getContext().getContentResolver().openInputStream(file.getUri())) {
            if (stream == null) return null;
            return new String(readAll(stream), StandardCharsets.UTF_8);
        }
    }

    // ------------------------------------------------------------------- app

    @PluginMethod
    public void appInfo(PluginCall call) {
        IO.execute(() -> {
            try {
                Context context = getContext();
                PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
                JSObject result = new JSObject();
                result.put("version", info.versionName == null ? "0" : info.versionName);
                result.put("platform", "android");
                result.put("dataDir", context.getFilesDir().getAbsolutePath());
                call.resolve(result);
            } catch (Exception error) {
                call.reject("app_info_failed", "app_info_failed");
            }
        });
    }

    // ----------------------------------------------------------------- vault

    @PluginMethod
    public void vaultRead(PluginCall call) {
        IO.execute(() -> {
            try {
                String contents = readText(vaultFile());
                JSObject result = new JSObject();
                // JSONObject.put(key, null) drops the key, which would reach the
                // renderer as `undefined` instead of `null` and break the
                // "no vault yet" branch.
                result.put("value", contents == null ? JSONObject.NULL : contents);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("read_failed", "read_failed");
            }
        });
    }

    @PluginMethod
    public void vaultWrite(PluginCall call) {
        final String payload;
        try {
            payload = assertPayload(call.getString("payload"));
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), error.getMessage());
            return;
        }

        IO.execute(() -> {
            try {
                writeFileAtomic(vaultFile(), payload);
                call.resolve(new JSObject());
            } catch (Exception error) {
                call.reject("write_failed", "write_failed");
            }
        });
    }

    @PluginMethod
    public void vaultRemove(PluginCall call) {
        IO.execute(() -> {
            try {
                File file = vaultFile();
                if (file.exists() && !file.delete()) throw new java.io.IOException("write_failed");
                call.resolve(new JSObject());
            } catch (Exception error) {
                call.reject("write_failed", "write_failed");
            }
        });
    }

    // ------------------------------------------------------------------ sync

    @PluginMethod
    public void syncStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("folder", storedTree());
        call.resolve(result);
    }

    @PluginMethod
    public void syncChooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled", "cancelled");
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("cancelled", "cancelled");
            return;
        }

        try {
            getContext().getContentResolver().takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        } catch (SecurityException error) {
            call.reject("folder_permission_failed", "folder_permission_failed");
            return;
        }

        prefs().edit().putString(SYNC_TREE_KEY, uri.toString()).apply();

        JSObject response = new JSObject();
        response.put("folder", uri.toString());
        call.resolve(response);
    }

    @PluginMethod
    public void syncList(PluginCall call) {
        IO.execute(() -> {
            try {
                DocumentFile directory = tree();
                JSArray logs = new JSArray();

                if (directory != null && directory.canRead()) {
                    for (DocumentFile file : directory.listFiles()) {
                        String name = file.getName();
                        if (name == null) continue;
                        Matcher match = CHANGE_LOG.matcher(name);
                        if (!match.matches()) continue;

                        JSObject entry = new JSObject();
                        entry.put("deviceId", match.group(1));
                        entry.put("fileName", name);
                        logs.put(entry);
                    }
                }

                JSObject result = new JSObject();
                result.put("logs", logs);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("read_failed", "read_failed");
            }
        });
    }

    @PluginMethod
    public void syncRead(PluginCall call) {
        final String deviceId;
        try {
            deviceId = assertDeviceId(call.getString("deviceId"));
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), error.getMessage());
            return;
        }

        IO.execute(() -> {
            try {
                String contents = readTreeFile("changes-" + deviceId + ".enc.json");
                JSObject result = new JSObject();
                result.put("value", contents == null ? JSONObject.NULL : contents);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("read_failed", "read_failed");
            }
        });
    }

    @PluginMethod
    public void syncWrite(PluginCall call) {
        final String deviceId;
        final String payload;

        try {
            deviceId = assertDeviceId(call.getString("deviceId"));
            payload = assertPayload(call.getString("payload"));
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), error.getMessage());
            return;
        }

        IO.execute(() -> {
            try {
                writeTreeFile("changes-" + deviceId + ".enc.json", payload);
                call.resolve(new JSObject());
            } catch (Exception error) {
                call.reject("write_failed", "write_failed");
            }
        });
    }

    @PluginMethod
    public void syncRemove(PluginCall call) {
        final String deviceId;
        try {
            deviceId = assertDeviceId(call.getString("deviceId"));
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), error.getMessage());
            return;
        }

        IO.execute(() -> {
            try {
                DocumentFile file = child("changes-" + deviceId + ".enc.json");
                if (file != null && file.exists() && !file.delete()) {
                    throw new java.io.IOException("write_failed");
                }
                call.resolve(new JSObject());
            } catch (Exception error) {
                call.reject("write_failed", "write_failed");
            }
        });
    }

    // ------------------------------------------------------------- clipboard

    /**
     * Android refuses clipboard access to background apps, so the wipe is best
     * effort: it runs while the process is alive. The value is still never sent
     * anywhere, and the user can clear the clipboard from the system UI.
     */
    @PluginMethod
    public void clipboardCopyTemp(PluginCall call) {
        final String text = call.getString("text");
        Integer requested = call.getInt("ttlMs", 30000);
        if (text == null || text.isEmpty()) {
            call.reject("invalid_argument", "invalid_argument");
            return;
        }

        int ttl = requested == null ? 30000 : requested;
        ttl = Math.max(5000, Math.min(120000, ttl));

        ClipboardManager manager =
            (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (manager == null) {
            call.reject("clipboard_failed", "clipboard_failed");
            return;
        }

        manager.setPrimaryClip(ClipData.newPlainText("LocalPass", text));

        final int delay = ttl;
        main.postDelayed(() -> {
            try {
                manager.clearPrimaryClip();
            } catch (Exception ignored) {
                // Some OEM builds refuse this; nothing else we can do.
            }
        }, delay);

        JSObject result = new JSObject();
        result.put("clearedInMs", ttl);
        call.resolve(result);
    }
}

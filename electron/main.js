const {
  app,
  BrowserWindow,
  protocol,
  Menu,
  nativeImage,
  session,
  ipcMain,
  dialog,
  clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');

let mainWindow = null;

const DEV_URL = 'http://localhost:9002';
const isDev = !app.isPackaged;

// Origen fijo (app://.) para que localStorage persista entre ejecuciones en portable e instalador
const APP_PROTOCOL = 'app';
const APP_ORIGIN = 'app://.';

/**
 * The renderer is a local, static bundle: it never needs to reach the network.
 * connect-src 'none' is the enforcement point behind the "100% offline" claim,
 * and default-src 'self' blocks remote images, fonts, frames and objects.
 *
 * 'unsafe-inline' for scripts is required by the Next.js static export
 * bootstrap, which emits inline hydration payloads. Static export cannot use
 * nonces, so the alternative would be shipping no CSP at all.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

// Clipboard writes are the only capability the UI actually uses.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write', 'clipboard-write']);

function getOutPath() {
  if (isDev) {
    return path.join(app.getAppPath(), 'out');
  }
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'out'),
    path.join(__dirname, '..', 'out'),
    path.join(process.resourcesPath, 'app.asar', 'out'),
    path.join(app.getAppPath(), 'out'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return path.join(__dirname, '..', 'out');
}

// Registrar esquema "app" como privilegiado (localStorage, etc.) antes de app.ready
protocol.registerSchemesAsPrivileged([
  { scheme: APP_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

function secureResponse(body, contentType) {
  return new Response(body, {
    headers: { 'Content-Type': contentType, ...SECURITY_HEADERS },
  });
}

function getIcon() {
  const dirs = isDev
    ? [path.join(__dirname, '..', 'public')]
    : [getOutPath(), path.join(__dirname, '..')];

  // nativeImage only decodes raster formats, so the window icon must be a PNG.
  // In a packaged build the executable already carries the icon; this keeps the
  // dev window from showing the default Electron logo in the taskbar.
  for (const dir of dirs) {
    const pngPath = path.join(dir, 'icon.png');
    if (fs.existsSync(pngPath)) {
      return nativeImage.createFromPath(pngPath).resize({ width: 256, height: 256 });
    }
  }
  return null;
}

function hardenSession() {
  const defaultSession = session.defaultSession;

  // Nothing in this app needs camera, microphone, geolocation, notifications
  // or clipboard reads. Denying by default removes that surface entirely.
  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });
}

function hardenWebContents(contents) {
  // No window and no external navigation may be opened from the renderer.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Navigation is limited to the application origin (or the dev server).
  contents.on('will-navigate', (event, targetUrl) => {
    const allowed = isDev ? targetUrl.startsWith(DEV_URL) : targetUrl.startsWith(APP_ORIGIN);
    if (!allowed) event.preventDefault();
  });

  contents.on('will-attach-webview', (event) => event.preventDefault());
}

const CLIPBOARD_MIN_TTL_MS = 5_000;
const CLIPBOARD_MAX_TTL_MS = 120_000;
const CLIPBOARD_DEFAULT_TTL_MS = 30_000;
const MAX_CLIPBOARD_BYTES = 64 * 1024;
const MAX_DIALOG_TITLE = 120;

/** Every handler answers with an explicit envelope, never a raw stack. */
function ok(value) {
  return { ok: true, value };
}

function fail(code) {
  return { ok: false, code };
}

function failure(error, fallback) {
  return fail(error && typeof error.code === 'string' ? error.code : fallback);
}

function dataDir() {
  return app.getPath('userData');
}

function currentSyncFolder() {
  return storage.readSettings(dataDir()).syncFolder;
}

let clipboardTimer = null;

/**
 * Copies a secret and clears it after a delay, but only while it is still
 * ours: if the user copied something else in the meantime, wiping the
 * clipboard would destroy their data.
 */
function copyTemporarily(text, requestedTtl) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new storage.StorageError('invalid_argument');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_CLIPBOARD_BYTES) {
    throw new storage.StorageError('invalid_argument');
  }

  const ttl = Number.isFinite(requestedTtl)
    ? Math.min(Math.max(Math.trunc(requestedTtl), CLIPBOARD_MIN_TTL_MS), CLIPBOARD_MAX_TTL_MS)
    : CLIPBOARD_DEFAULT_TTL_MS;

  clipboard.writeText(text);

  if (clipboardTimer) clearTimeout(clipboardTimer);
  clipboardTimer = setTimeout(() => {
    clipboardTimer = null;
    if (clipboard.readText() === text) clipboard.clear();
  }, ttl);
  if (typeof clipboardTimer.unref === 'function') clipboardTimer.unref();

  return { clearedInMs: ttl };
}

/**
 * Paths live only here. The renderer sends a payload and, at most, a device
 * id that must match the fixed file-name pattern.
 */
function registerIpc() {
  ipcMain.handle('app:info', () =>
    ok({ version: app.getVersion(), platform: process.platform, dataDir: dataDir() })
  );

  ipcMain.handle('vault:read', () => {
    try {
      return ok(storage.readFileIfExists(storage.vaultPath(dataDir())));
    } catch (error) {
      return failure(error, 'read_failed');
    }
  });

  ipcMain.handle('vault:write', (_event, payload) => {
    try {
      storage.writeFileAtomic(storage.vaultPath(dataDir()), storage.assertPayload(payload));
      return ok(true);
    } catch (error) {
      return failure(error, 'write_failed');
    }
  });

  ipcMain.handle('vault:remove', () => {
    try {
      storage.removeFile(storage.vaultPath(dataDir()));
      return ok(true);
    } catch (error) {
      return failure(error, 'write_failed');
    }
  });

  ipcMain.handle('sync:status', () => {
    try {
      return ok({ folder: currentSyncFolder() });
    } catch (error) {
      return failure(error, 'read_failed');
    }
  });

  ipcMain.handle('sync:choose-folder', async (event, requestedTitle) => {
    try {
      const folder = currentSyncFolder();
      const options = {
        title:
          typeof requestedTitle === 'string' && requestedTitle.length <= MAX_DIALOG_TITLE
            ? requestedTitle
            : 'LocalPass',
        properties: ['openDirectory', 'createDirectory'],
      };
      if (folder) options.defaultPath = folder;

      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled || result.filePaths.length === 0) return ok({ folder });

      const chosen = result.filePaths[0];
      storage.writeSettings(dataDir(), { syncFolder: chosen });
      return ok({ folder: chosen });
    } catch (error) {
      return failure(error, 'write_failed');
    }
  });

  ipcMain.handle('sync:list', () => {
    try {
      const folder = currentSyncFolder();
      return ok(folder ? storage.listChangeLogs(folder) : []);
    } catch (error) {
      return failure(error, 'read_failed');
    }
  });

  ipcMain.handle('sync:read', (_event, deviceId) => {
    try {
      const folder = currentSyncFolder();
      if (!folder) return fail('no_sync_folder');
      return ok(storage.readFileIfExists(storage.syncLogPath(folder, deviceId)));
    } catch (error) {
      return failure(error, 'read_failed');
    }
  });

  ipcMain.handle('sync:write', (_event, deviceId, payload) => {
    try {
      const folder = currentSyncFolder();
      if (!folder) return fail('no_sync_folder');
      storage.writeFileAtomic(storage.syncLogPath(folder, deviceId), storage.assertPayload(payload));
      return ok(true);
    } catch (error) {
      return failure(error, 'write_failed');
    }
  });

  ipcMain.handle('sync:remove', (_event, deviceId) => {
    try {
      const folder = currentSyncFolder();
      if (!folder) return fail('no_sync_folder');
      storage.removeFile(storage.syncLogPath(folder, deviceId));
      return ok(true);
    } catch (error) {
      return failure(error, 'write_failed');
    }
  });

  ipcMain.handle('clipboard:copy-temp', (_event, text, ttlMs) => {
    try {
      return ok(copyTemporarily(text, ttlMs));
    } catch (error) {
      return failure(error, 'write_failed');
    }
  });
}

function createWindow() {
  const windowIcon = getIcon();

  const windowConfig = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'LocalPass',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: isDev,
    },
    show: false,
    autoHideMenuBar: true,
  };

  if (windowIcon) {
    windowConfig.icon = windowIcon;
  }

  mainWindow = new BrowserWindow(windowConfig);
  hardenWebContents(mainWindow.webContents);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    const outPath = getOutPath();
    if (!fs.existsSync(outPath)) {
      mainWindow.loadURL(
        'data:text/html,<h1>Error</h1><p>No se pudo iniciar la aplicaci%C3%B3n. Carpeta "out" no encontrada.</p>'
      );
      mainWindow.show();
      return;
    }

    protocol.handle(APP_PROTOCOL, (request) => {
      let url = request.url.slice(APP_ORIGIN.length) || '/';
      const pathname = url.split('?')[0].replace(/^\/+/, '') || 'index.html';
      const filePath = path.join(outPath, path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, ''));

      if (!path.resolve(filePath).startsWith(path.resolve(outPath) + path.sep)) {
        return new Response('Forbidden', { status: 403, headers: SECURITY_HEADERS });
      }

      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const mime = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
          return secureResponse(fs.readFileSync(filePath), mime);
        }
        if (stat.isDirectory()) {
          const index = path.join(filePath, 'index.html');
          if (fs.existsSync(index)) {
            return secureResponse(fs.readFileSync(index), 'text/html');
          }
        }
      } catch (_) {}

      const indexHtml = path.join(outPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        return secureResponse(fs.readFileSync(indexHtml), 'text/html');
      }
      return new Response('Not Found', { status: 404, headers: SECURITY_HEADERS });
    });

    mainWindow.loadURL(APP_ORIGIN + '/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // The packaged app has no menu; keeping it only enables reload/devtools
  // accelerators that a local-only application does not need.
  if (!isDev) Menu.setApplicationMenu(null);
  hardenSession();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

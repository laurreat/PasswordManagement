package com.localpass.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate so the bridge can see the plugin.
        registerPlugin(LocalPassStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

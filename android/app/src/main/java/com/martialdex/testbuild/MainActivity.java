package com.martialdex.testbuild;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom (non-npm) plugins — must be registered manually before
        // super.onCreate() so the Bridge picks it up. See
        // SparringCameraPlugin.java / BackgroundRecordingService.java /
        // InAppBrowserPlugin.java.
        registerPlugin(SparringCameraPlugin.class);
        registerPlugin(InAppBrowserPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

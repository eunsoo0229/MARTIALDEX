package com.martialdex.testbuild;

import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS-facing bridge for InAppBrowserActivity — see that class for why a real
 * WebView-based Activity (not @capacitor/browser's Chrome Custom Tabs, which
 * needs a separate browser app installed) is what actually makes "링크가
 * 브라우저 앱 없이도 앱 안에서 열림" true on every device, not just ones with
 * Chrome/Firefox/etc. installed.
 */
@CapacitorPlugin(name = "InAppBrowser")
public class InAppBrowserPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || (!url.startsWith("http://") && !url.startsWith("https://"))) {
            call.reject("Invalid url");
            return;
        }
        Intent intent = new Intent(getContext(), InAppBrowserActivity.class);
        intent.putExtra(InAppBrowserActivity.EXTRA_URL, url);
        getActivity().startActivity(intent);
        call.resolve();
    }
}

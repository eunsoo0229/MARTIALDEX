import { registerPlugin, Capacitor } from '@capacitor/core';

// TS-side mirror of android/app/src/main/java/com/martialdex/testbuild/
// InAppBrowserPlugin.java — a native WebView-based screen, deliberately NOT
// @capacitor/browser (Chrome Custom Tabs), which only works when a separate
// browser app like Chrome is actually installed on the device. Only
// registered/used on native Android — see openInApp() in externalLink.ts.
export interface InAppBrowserPlugin {
  open(options: { url: string }): Promise<void>;
}

const InAppBrowser = registerPlugin<InAppBrowserPlugin>('InAppBrowser');

export function isNativeInAppBrowserAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function openInNativeInAppBrowser(url: string): Promise<void> {
  await InAppBrowser.open({ url });
}

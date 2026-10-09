// The device a backup was made on, as a short friendly name. Never the
// computer's hostname or any account info: Electron reports the hardware
// model ("MacBook Pro", "iMac", "Windows PC" — electron/deviceInfo.cjs),
// Android/iOS/web are derived from the user agent. Anything unknown is
// "이 기기"; this never throws.

export interface DeviceInfo {
  deviceName: string;
  platform: string;
  appVersion: string;
}

export const FALLBACK_DEVICE_NAME = '이 기기';

function appVersion(): string {
  try {
    return __APP_VERSION__;
  } catch {
    return '';
  }
}

/** UA → friendly name. Android keeps a real model token when the UA still has one (e.g. "Pixel 7"), never a build id. */
export function deviceNameFromUserAgent(ua: string): { deviceName: string; platform: string } {
  if (/iPad/i.test(ua)) return { deviceName: 'iPad', platform: 'iPadOS' };
  if (/iPhone/i.test(ua)) return { deviceName: 'iPhone', platform: 'iOS' };
  if (/Android/i.test(ua)) {
    const model = ua.match(/Android [\d.]+;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/i)?.[1]?.trim();
    const usable = model && model.length >= 2 && !/^(K|wv|Linux|Mobile)$/i.test(model);
    return { deviceName: usable ? `Android (${model})` : 'Android 기기', platform: 'Android' };
  }
  if (/Macintosh|Mac OS X/i.test(ua)) return { deviceName: 'Mac', platform: 'macOS' };
  if (/Windows/i.test(ua)) return { deviceName: 'Windows PC', platform: 'Windows' };
  if (/Linux/i.test(ua)) return { deviceName: 'Linux PC', platform: 'Linux' };
  return { deviceName: FALLBACK_DEVICE_NAME, platform: '' };
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  try {
    const electronInfo = await window.martialdex?.getDeviceInfo?.();
    if (electronInfo?.deviceName) return { deviceName: electronInfo.deviceName, platform: electronInfo.platform, appVersion: electronInfo.appVersion || appVersion() };
  } catch {
    // fall through to the user-agent path
  }
  try {
    const { deviceName, platform } = deviceNameFromUserAgent(navigator.userAgent ?? '');
    return { deviceName, platform, appVersion: appVersion() };
  } catch {
    return { deviceName: FALLBACK_DEVICE_NAME, platform: '', appVersion: appVersion() };
  }
}

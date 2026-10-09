// Friendly, non-identifying device name for backup metadata ("MacBook Pro",
// "iMac", "Windows PC"). Deliberately NOT os.hostname()/computer name —
// those usually contain the owner's real name ("철수의 MacBook Pro").
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const MAC_MODELS = [
  [/^MacBookPro/i, 'MacBook Pro'],
  [/^MacBookAir/i, 'MacBook Air'],
  [/^MacBook/i, 'MacBook'],
  [/^iMacPro/i, 'iMac Pro'],
  [/^iMac/i, 'iMac'],
  [/^Macmini/i, 'Mac mini'],
  [/^MacPro/i, 'Mac Pro'],
  [/^Mac\d/i, 'Mac'],
];

function macModelName() {
  try {
    const model = execFileSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8', timeout: 2000 }).trim();
    return MAC_MODELS.find(([re]) => re.test(model))?.[1] ?? 'Mac';
  } catch {
    return 'Mac';
  }
}

function getDeviceInfo(appVersion) {
  const platform = process.platform;
  const deviceName = platform === 'darwin' ? macModelName() : platform === 'win32' ? 'Windows PC' : platform === 'linux' ? 'Linux PC' : '이 기기';
  return { deviceName, platform: platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : platform === 'linux' ? 'Linux' : os.type(), appVersion };
}

module.exports = { getDeviceInfo };

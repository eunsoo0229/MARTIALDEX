// Test-build packaging config only — not used by `npm run dev`/`npm run
// build` (those are untouched). No code signing/notarization is configured
// (fine for local test builds; a real release would need a Developer ID
// cert for mac and eventually a code-signing cert for Windows to avoid
// Gatekeeper/SmartScreen warnings).
//
// asar is disabled on purpose: electron/main.cjs resolves `.env` as
// `path.join(__dirname, '..', '.env')` (a real file one directory above
// electron/) — with asar packing that path would point inside the
// immutable app.asar archive instead of a real writable location, breaking
// the existing "drop a .env next to the app" convenience for anyone
// testing this build with their own local-only API keys. No source files
// were changed to make this work.
const path = require('path');

module.exports = {
  appId: 'com.martialdex.testbuild',
  productName: 'MARTIALDEX',
  // electron-builder resolves a relative `icon` against directories.
  // buildResources (default: 'build/'), which this project doesn't have —
  // an absolute path sidesteps that and always points at the real file.
  icon: path.join(__dirname, 'LOGO.png'),
  directories: {
    output: 'release',
  },
  asar: false,
  files: [
    'electron/**/*',
    'dist/renderer/**/*',
    'package.json',
    '!**/.env',
    '!**/.env.*',
    '!data/**/*',
    '!src/**/*',
    '!docs/**/*',
    '!.devtools/**/*',
    '!supabase/**/*',
    '!scripts/**/*',
  ],
  mac: {
    target: [
      { target: 'dmg', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
    category: 'public.app-category.sports',
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
};

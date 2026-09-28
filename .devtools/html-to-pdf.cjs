// One-off utility: renders each docs/stage-reports/*.html into a matching
// .pdf next to it, using Electron's own Chromium (webContents.printToPDF) —
// no extra browser download needed since this project already ships
// Electron. Run with: electron .devtools/html-to-pdf.cjs
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DIR = path.join(__dirname, '..', 'docs', 'stage-reports');

async function renderOne(win, htmlPath) {
  await win.loadFile(htmlPath);
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const outPath = htmlPath.replace(/\.html$/, '.pdf');
  fs.writeFileSync(outPath, pdf);
  console.log('wrote', outPath, `(${(pdf.length / 1024).toFixed(0)} KB)`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.html'))
    .sort();
  for (const f of files) {
    await renderOne(win, path.join(DIR, f));
  }
  app.quit();
});

// Verify actual Chromium canvas/CORS sampling with a public cover, no account.
const { app, BrowserWindow } = require('electron');
const { mkdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const directory = join(__dirname, '../build/.cover-smoke');
mkdirSync(directory, { recursive: true });
app.setPath('userData', directory);
app.setPath('sessionData', directory);
const timer = setTimeout(() => app.exit(1), 15000);
app.whenReady().then(async () => {
  let window;
  try {
    const source = readFileSync(join(__dirname, '../src/renderer/src/player/cover-colors.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    await window.loadURL('data:text/html,<title>Cover palette check</title>');
    const colors = await window.webContents.executeJavaScript(`(() => { const exports = {}; ${code}; return exports.readCoverColors('https://p1.music.126.net/OwciRWB2U8yzKXYepUZnMA==/109951171972049001.jpg'); })()`);
    assert.match(colors.glow, /^rgb\(/);
    console.log('PASS: public CDN cover loads anonymously and canvas returns palette:', JSON.stringify(colors));
    window.destroy(); clearTimeout(timer); app.exit(0);
  } catch (reason) { console.error(reason.message); window?.destroy(); clearTimeout(timer); app.exit(1); }
});

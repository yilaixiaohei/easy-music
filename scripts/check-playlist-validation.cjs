// Read-only SDK validation check; never reads account data or modifies playlists.
const { join } = require('node:path');
const { mkdirSync } = require('node:fs');
const directory = join(__dirname, '../build/.api-diagnostics');
mkdirSync(directory, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = directory;
if (process.parentPort) {
  console.log = console.warn = console.error = () => {};
  const started = Date.now();
  require('@neteasecloudmusicapienhanced/api/module/register_checktoken_v2').getToken()
    .then(token => process.parentPort.postMessage({ tokenAvailable: typeof token === 'string' && token.length > 0, elapsedMs: Date.now() - started }))
    .catch(() => process.parentPort.postMessage({ tokenAvailable: false }));
} else {
  const { app, utilityProcess } = require('electron');
  app.setPath('userData', directory);
  app.setPath('sessionData', directory);
  let child;
  const timer = setTimeout(() => { child?.kill(); app.exit(1); }, 45000);
  app.whenReady().then(() => {
    child = utilityProcess.fork(__filename, [], { stdio: 'ignore' });
    child.on('message', result => {
      console.log(JSON.stringify(result));
      clearTimeout(timer);
      child.kill();
      app.exit(result.tokenAvailable ? 0 : 1);
    });
  });
}

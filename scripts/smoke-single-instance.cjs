// Real Electron processes with disposable profiles. Never launches an installed
// copy or reads account data. The same instance/restore helpers are used by main.
const { mkdirSync, mkdtempSync, readFileSync, symlinkSync } = require('node:fs');
const { join, resolve } = require('node:path');
const assert = require('node:assert/strict');

function loadHelper(name) {
  const Module = require('node:module');
  const ts = require('typescript');
  const filename = resolve(__dirname, '../src/main/' + name + '.ts');
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fixtureModule = new Module(filename, module);
  fixtureModule.filename = filename; fixtureModule.paths = module.paths;
  fixtureModule._compile(code, filename);
  return fixtureModule.exports;
}

async function fixture() {
  const { app, BrowserWindow, Tray } = require('electron');
  const profile = process.argv[process.argv.indexOf('--fixture-profile') + 1];
  const delay = Number(process.argv[process.argv.indexOf('--fixture-delay') + 1]) || 0;
  for (const path of [profile, join(profile, 'session'), join(profile, 'temp'), join(profile, 'logs'), join(profile, 'crashes')]) mkdirSync(path, { recursive: true });
  app.setPath('userData', profile); app.setPath('sessionData', join(profile, 'session'));
  app.setPath('temp', join(profile, 'temp')); app.setPath('crashDumps', join(profile, 'crashes'));
  app.setAppLogsPath(join(profile, 'logs'));
  app.commandLine.appendSwitch('user-data-dir', profile);
  const { acquireDataInstance } = loadHelper('single-instance');
  const { CloseToTrayController } = loadHelper('desktop-settings');
  let window, tray, windowsCreated = 0, traysCreated = 0, activations = 0;
  const policy = new CloseToTrayController(() => true, () => !!tray && !tray.isDestroyed());
  const guard = acquireDataInstance(app, () => { activations++; policy.show(window); });
  if (!guard.primary) return;
  process.send({ kind: 'locked', pid: process.pid });
  const timeout = setTimeout(() => app.exit(2), 45000);
  app.on('before-quit', () => policy.beforeQuit());
  app.on('will-quit', () => { clearTimeout(timeout); tray?.destroy(); });
  await app.whenReady();
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  tray = new Tray(resolve(__dirname, '../build/icon.ico')); traysCreated++;
  window = new BrowserWindow({ show: false, width: 320, height: 180, skipTaskbar: true,
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  windowsCreated++;
  window.on('close', event => policy.close(event, window));
  await window.loadURL('data:text/html,<title>Easy Music instance test</title>');
  const wave = Buffer.alloc(44 + 16000);
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
  wave.write('data', 36); wave.writeUInt32LE(16000, 40);
  await window.webContents.executeJavaScript(`window.audio = new Audio(${JSON.stringify('data:audio/wav;base64,' + wave.toString('base64'))}); audio.loop = true; audio.muted = true; window.originalAudio = audio; window.fixtureQueue = [1, 2, 3]; audio.play();`);
  guard.ready();
  async function status() {
    return { pid: process.pid, windowsCreated, traysCreated, activations,
      webContents: window.webContents.id, visible: window.isVisible(), minimized: window.isMinimized(),
      playback: await window.webContents.executeJavaScript('({paused: audio.paused, unchanged: audio === originalAudio, queue: fixtureQueue})') };
  }
  process.on('message', async message => {
    try {
      if (message.action === 'quit') { app.quit(); return; }
      if (message.action === 'hide') window.close();
      if (message.action === 'minimize') {
        policy.show(window);
        await new Promise(resolve => { window.once('minimize', resolve); window.minimize(); setTimeout(resolve, 1000); });
      }
      process.send({ request: message.id, value: await status() });
    } catch (reason) { process.send({ request: message.id, error: reason.message }); }
  });
  process.send({ kind: 'ready', value: await status() });
}

async function orchestrate() {
  const { spawn } = require('node:child_process');
  const executable = require('electron');
  const base = resolve(__dirname, '../build/.single-instance-smoke');
  mkdirSync(base, { recursive: true });
  const run = mkdtempSync(join(base, 'run-'));
  const children = [];
  let sequence = 0;
  function launch(profile, delay = 0) {
    const process = spawn(executable, [__filename, '--fixture-profile', profile, '--fixture-delay', String(delay)], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: false, env: { ...global.process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
    const messages = [], waiters = new Set();
    let errors = '';
    process.stderr.on('data', data => { errors = (errors + data).slice(-2000); });
    process.stdout.on('data', () => {});
    process.on('message', message => { messages.push(message); for (const check of [...waiters]) check(); });
    const exited = new Promise(resolve => process.once('exit', code => resolve(code)));
    function wait(predicate) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(check); reject(new Error('Fixture message timed out: ' + errors)); }, 15000);
        function check() {
          const index = messages.findIndex(predicate);
          if (index < 0) return;
          const message = messages.splice(index, 1)[0]; clearTimeout(timer); waiters.delete(check);
          if (message.error) reject(new Error(message.error)); else resolve(message.value ?? message);
        }
        waiters.add(check); check();
      });
    }
    const child = { process, messages, exited, wait,
      async request(action) { const id = ++sequence; process.send({ id, action }); return wait(message => message.request === id); },
    };
    children.push(child); return child;
  }
  async function secondary(profile) {
    const child = launch(profile);
    const code = await Promise.race([child.exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Secondary did not exit')), 10000))]);
    assert.equal(code, 0);
    assert.equal(child.messages.length, 0, 'Secondary must exit before creating a window or tray');
  }
  async function activated(child, count) {
    for (let i = 0; i < 20; i++) {
      const state = await child.request('status');
      if (state.activations >= count && state.visible && !state.minimized) {
        assert.equal(state.windowsCreated, 1); assert.equal(state.traysCreated, 1);
        assert.equal(state.visible, true); assert.equal(state.minimized, false);
        assert.equal(state.playback.paused, false); assert.equal(state.playback.unchanged, true);
        assert.deepEqual(state.playback.queue, [1, 2, 3]);
        return state;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Primary window was not restored');
  }
  try {
    const installed = join(run, 'installed/data');
    const portable = join(run, 'portable/data');
    const development = join(run, 'development');
    const first = launch(installed, 1500);
    await first.wait(message => message.kind === 'locked');
    await secondary(installed);
    const ready = await first.wait(message => message.kind === 'ready');
    assert.equal(ready.activations, 1, 'A launch during initialization must not be lost');
    const initial = await activated(first, 1);
    assert.equal((await first.request('hide')).visible, false);
    await secondary(installed);
    assert.equal((await activated(first, 2)).webContents, initial.webContents);
    assert.equal((await first.request('minimize')).minimized, true);
    await secondary(installed);
    await activated(first, 3);
    const alias = join(run, 'same-data-alias');
    symlinkSync(installed, alias, global.process.platform === 'win32' ? 'junction' : 'dir');
    await secondary(alias);
    await activated(first, 4);
    console.log('PASS: repeated/early launches exit; hidden/minimized primary restored; one tray/window, same audio and queue; directory alias shares lock');
    const other = launch(portable);
    const otherReady = await other.wait(message => message.kind === 'ready');
    const dev = launch(development);
    const devReady = await dev.wait(message => message.kind === 'ready');
    assert.notEqual(otherReady.pid, initial.pid); assert.notEqual(devReady.pid, initial.pid);
    assert.equal(otherReady.activations, 0); assert.equal(devReady.activations, 0);
    await secondary(portable);
    await activated(other, 1);
    assert.equal((await first.request('status')).activations, 4);
    console.log('PASS: separate portable/data and development profiles remain independent');
    first.process.send({ action: 'quit' });
    await first.exited;
    const restarted = launch(installed);
    const restartReady = await restarted.wait(message => message.kind === 'ready');
    assert.equal(restartReady.activations, 0);
    assert.notEqual(restartReady.pid, initial.pid);
    console.log('PASS: quitting releases the lock and allows a fresh launch');
  } finally {
    for (const child of children) {
      if (child.process.exitCode !== null) continue;
      if (child.process.connected) child.process.send({ action: 'quit' });
      await Promise.race([child.exited, new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.process.exitCode === null) child.process.kill();
    }
  }
}
if (process.versions.electron) fixture().catch(error => { console.error(error.message); require('electron').app.exit(1); });
else orchestrate().catch(error => { console.error(error.stack); process.exitCode = 1; });

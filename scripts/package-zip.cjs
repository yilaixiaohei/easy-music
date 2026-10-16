// Windows ZIPs from electron-builder normally omit the enclosing directory.
// Stage a named folder so every extraction method keeps the program together.
const { spawnSync } = require('node:child_process');
const { cp, mkdir, mkdtemp, readdir, rm } = require('node:fs/promises');
const { resolve, join, dirname, basename } = require('node:path');
const { archive } = require('app-builder-lib/out/targets/archive');
const { version } = require('../package.json');

async function packageZip() {
  const root = resolve(__dirname, '..');
  const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--dir', '--win', '--x64', '--publish', 'never'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, EASY_MUSIC_PACKAGE_KIND: 'zip' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Packaging failed: ' + result.status);
  const output = join(root, 'dist');
  const source = join(output, 'win-unpacked');
  const dataFiles = await readdir(join(source, 'data'));
  if (dataFiles.length !== 1 || dataFiles[0] !== 'README.txt') throw new Error('Refusing to package unexpected personal data');
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(join(output, '.zip-stage-'));
  try {
    const folder = join(stage, 'EasyMusic');
    await cp(source, folder, { recursive: true });
    const file = join(output, `EasyMusic-${version}-win-x64.zip`);
    await archive('zip', file, folder, { compression: 'normal', withoutDir: false });
    console.log('ZIP created with EasyMusic/ root:', file);
  } finally {
    if (dirname(resolve(stage)) !== output || !basename(stage).startsWith('.zip-stage-')) throw new Error('Unexpected staging cleanup path');
    await rm(stage, { recursive: true, force: true });
  }
}
packageZip().catch(error => { console.error(error.message); process.exitCode = 1; });

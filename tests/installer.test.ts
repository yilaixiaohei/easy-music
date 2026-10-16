import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { removalManifest } = require('../scripts/installer-manifest.cjs');
const entry = (name: string, directory = false, link = false) => ({ name, isDirectory: () => directory, isFile: () => !directory, isSymbolicLink: () => link });

test('安装包卸载清单只包含应用文件，保留 data 和未打包的文件，支持中文说明', () => {
  const manifest = removalManifest([entry('EasyMusic.exe'), entry('使用说明.txt'), entry('resources', true), entry('data', true)]);
  assert.match(manifest, /Delete "\$INSTDIR\\EasyMusic.exe"/);
  assert.match(manifest, /Delete "\$INSTDIR\\使用说明.txt"/);
  assert.match(manifest, /Call un.EasyMusicRemoveTree/);
  assert.doesNotMatch(manifest, /\$INSTDIR\\data|RMDir \/r/);
  for (const name of ['..', '../outside', 'bad"file', '$INSTDIR', 'a\nb']) assert.throws(() => removalManifest([entry(name)]));
  assert.throws(() => removalManifest([entry('resources', true, true)]));
});

test('卸载仅显式勾选时清理个人数据，升级禁止清理，目录链接不递归遍历', () => {
  const script = readFileSync(new URL('../build/installer.nsh', import.meta.url), 'utf8');
  assert.match(script, /Section \/o "un\.删除个人数据/);
  assert.match(script, /\$\{IfNot\} \$\{isUpdated\}[\s\S]*?Push "\$INSTDIR\\data"/);
  assert.match(script, /GetFileAttributesW/);
  assert.match(script, /0x400/);
  assert.match(script, /EasyMusicInstallRootVerified == "1"/);
  assert.doesNotMatch(script, /^\s*RMDir \/r/m);
});

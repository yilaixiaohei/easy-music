// Run the real NSIS normalization function against disposable fixtures.
// No installed app, registry entries or shortcuts are touched.
const { mkdirSync, mkdtempSync, writeFileSync, readFileSync } = require('node:fs');
const { resolve, join, win32 } = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const base = resolve(__dirname, '../build/.installer-smoke');
mkdirSync(base, { recursive: true });
const run = mkdtempSync(join(base, 'directory-'));
const legacy = join(run, 'Old custom folder');
mkdirSync(join(legacy, 'resources'), { recursive: true });
writeFileSync(join(legacy, 'EasyMusic.exe'), 'fixture');
writeFileSync(join(legacy, 'resources/app.asar'), 'fixture');
const cases = [
  ['D:\\Apps', 'D:\\Apps\\EasyMusic'],
  ['D:\\', 'D:\\EasyMusic'],
  ['D:\\Apps\\', 'D:\\Apps\\EasyMusic'],
  ['D:\\Apps\\EasyMusic', 'D:\\Apps\\EasyMusic'],
  ['D:\\Apps\\EasyMusic\\', 'D:\\Apps\\EasyMusic'],
  ['D:\\Apps\\easymusic', 'D:\\Apps\\easymusic'],
  ['D:\\EasyMusicDownloads', 'D:\\EasyMusicDownloads\\EasyMusic'],
  ['D:\\我的软件', 'D:\\我的软件\\EasyMusic'],
  [legacy, legacy],
];
const quote = value => value.replace(/\$/g, '$$');
const output = join(run, 'results.txt');
const source = `Unicode true
Name "Easy Music directory fixture"
OutFile "${quote(join(run, 'fixture.exe'))}"
RequestExecutionLevel user
SilentInstall silent
!include "${quote(resolve(__dirname, '../build/installer.nsh'))}"
LoadLanguageFile "\$\{NSISDIR\}\\Contrib\\Language files\\English.nlf"
Function instFilesPre
  StrCpy $INSTDIR "$INSTDIR\\builder-default"
FunctionEnd
Section
FileOpen $1 "${quote(output)}" w
${cases.map(([input]) => `StrCpy $INSTDIR "${quote(input)}"
Call EasyMusicNormalizeInstallDir
Call EasyMusicInstFilesPre
FileWriteUTF16LE $1 "$INSTDIR$\\r$\\n"`).join('\n')}
FileClose $1
SectionEnd
`;
const script = join(run, 'fixture.nsi');
writeFileSync(script, '\uFEFF' + source);
const compiler = process.argv[2];
if (!compiler) throw new Error('Pass the path to makensis.exe');
execFileSync(compiler, ['/V2', script], { timeout: 30000, stdio: 'pipe' });
execFileSync(join(run, 'fixture.exe'), ['/S'], { timeout: 15000, stdio: 'pipe' });
const actual = readFileSync(output, 'utf16le').trim().split(/\r?\n/);
assert.deepEqual(actual.map(p => win32.normalize(p)), cases.map(([, expected]) => win32.normalize(expected)));
console.log('PASS: NSIS directory normalization: parent, drive root, trailing slash, case, substring, Chinese, legacy upgrade; repeated calls do not nest folders');

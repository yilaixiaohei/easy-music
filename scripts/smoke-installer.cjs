// Compile the actual uninstall macros against disposable fixtures. No registry,
// shortcuts, installed application or real user data is touched.
const { mkdirSync, mkdtempSync, writeFileSync, readdirSync, existsSync, readFileSync, symlinkSync } = require('node:fs');
const { resolve, join, relative, isAbsolute } = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { removalManifest } = require('./installer-manifest.cjs');
const base = resolve(__dirname, '../build/.installer-smoke');
mkdirSync(base, { recursive: true });
const compiler = process.argv[2];
if (!compiler) throw new Error('Pass the path to makensis.exe');
const run = mkdtempSync(join(base, 'run-'));
function nsisPath(value) { return value.replace(/\$/g, '$$'); }
for (const scenario of ['keep', 'delete', 'upgrade', 'junction']) {
  const directory = join(run, scenario);
  const install = join(directory, 'EasyMusic');
  const pathPart = relative(base, install);
  if (!pathPart || pathPart.startsWith('..') || isAbsolute(pathPart)) throw new Error('Unexpected fixture path');
  mkdirSync(join(install, 'resources'), { recursive: true });
  const outside = join(directory, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'keep.txt'), 'outside');
  if (scenario === 'junction') symlinkSync(outside, join(install, 'data'), 'junction');
  else {
    mkdirSync(join(install, 'data'));
    writeFileSync(join(install, 'data/account.enc'), 'fixture-account');
    symlinkSync(outside, join(install, 'data/linked'), 'junction');
  }
  writeFileSync(join(install, 'EasyMusic.exe'), 'fixture-app');
  writeFileSync(join(install, 'resources/app.asar'), 'fixture-resources');
  const appEntries = readdirSync(install, { withFileTypes: true });
  // A user-created file is deliberately not part of the packaged manifest.
  writeFileSync(join(install, 'unrelated.txt'), 'keep');
  writeFileSync(join(directory, '.installer-files.nsh'), removalManifest(appEntries));
  const generator = join(directory, 'generator.exe');
  const source = `Unicode true
Name "Easy Music uninstall fixture"
OutFile "${nsisPath(generator)}"
InstallDir "${nsisPath(install)}"
RequestExecutionLevel user
SilentInstall silent
SilentUnInstall silent
!define BUILD_UNINSTALLER
!define BUILD_RESOURCES_DIR "${nsisPath(directory)}"
!define UNINSTALL_FILENAME "fixture-uninstall.exe"
!define isUpdated '"${scenario === 'upgrade'}" == "true"'
!include "${nsisPath(resolve(__dirname, '../build/installer.nsh'))}"
Section
  WriteUninstaller "$INSTDIR\\fixture-uninstall.exe"
SectionEnd
Section "un.Application"
  !insertmacro customRemoveFiles
SectionEnd
!insertmacro customUnInstallSection
Function un.onInit
  ${scenario !== 'keep' ? 'SectionSetFlags ${em_delete_data} 1' : ''}
FunctionEnd
`;
  const script = join(directory, 'fixture.nsi');
  writeFileSync(script, '\uFEFF' + source);
  execFileSync(compiler, ['/V2', script], { timeout: 30000, stdio: 'pipe' });
  execFileSync(generator, ['/S'], { timeout: 15000, stdio: 'pipe' });
  execFileSync(join(install, 'fixture-uninstall.exe'), ['/S', `_?=${install}`], { timeout: 20000, stdio: 'pipe' });
  assert.equal(existsSync(join(install, 'EasyMusic.exe')), false, scenario);
  assert.equal(existsSync(join(install, 'resources')), false, scenario);
  assert.equal(readFileSync(join(install, 'unrelated.txt'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'outside');
  if (scenario === 'keep' || scenario === 'upgrade') assert.equal(readFileSync(join(install, 'data/account.enc'), 'utf8'), 'fixture-account');
  else assert.equal(existsSync(join(install, 'data')), false, scenario);
  console.log('PASS uninstall fixture:', scenario);
}

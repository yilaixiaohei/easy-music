const { readdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

function removalManifest(entries) {
  const lines = ['; Generated from the packaged application. Personal data is never included.'];
  for (const entry of entries) {
    if (entry.name.toLowerCase() === 'data') continue;
    if (!/^[\p{L}\p{N}_. ()-]+$/u.test(entry.name) || entry.name === '.' || entry.name === '..') throw new Error('Unexpected packaged filename: ' + entry.name);
    if (entry.isSymbolicLink()) throw new Error('Packaged links are not supported');
    if (entry.isDirectory()) lines.push(`Push "$INSTDIR\\${entry.name}"`, 'Call un.EasyMusicRemoveTree');
    else if (entry.isFile()) lines.push(`Delete "$INSTDIR\\${entry.name}"`);
  }
  return lines.join('\r\n') + '\r\n';
}
async function writeRemovalManifest(appOutDir, directory) {
  const entries = await readdir(appOutDir, { withFileTypes: true });
  await writeFile(join(directory, '.installer-files.nsh'), removalManifest(entries), 'utf8');
}
module.exports = { removalManifest, writeRemovalManifest };

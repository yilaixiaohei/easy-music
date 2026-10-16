const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', 'nsis', '--x64', '--publish', 'never'], {
  stdio: 'inherit', env: { ...process.env, EASY_MUSIC_PACKAGE_KIND: 'installer' },
});
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);

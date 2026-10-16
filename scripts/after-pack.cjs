const { mkdir, writeFile, copyFile } = require('node:fs/promises');
const { join } = require('node:path');
const { writeRemovalManifest } = require('./installer-manifest.cjs');

module.exports = async ({ appOutDir }) => {
  const installer = process.env.EASY_MUSIC_PACKAGE_KIND === 'installer';
  await copyFile(join(__dirname, '../LICENSE'), join(appOutDir, 'LICENSE.txt'));
  await copyFile(join(__dirname, '../THIRD_PARTY_NOTICES.md'), join(appOutDir, 'THIRD_PARTY_NOTICES.md'));
  await mkdir(join(appOutDir, 'data'), { recursive: true });
  await writeFile(join(appOutDir, 'data', 'README.txt'),
    'Easy Music 数据目录\r\n\r\n' +
    '登录状态、设置、播放记录、缓存和服务临时文件都保存在本目录内。\r\n' +
    '移动软件时请移动整个文件夹。升级时请保留原有 data 文件夹。\r\n' +
    (installer ? '安装版请使用 Windows 卸载程序；默认保留个人数据，可在卸载向导中勾选删除个人数据。\r\n' : '退出软件后，删除整个软件文件夹即可移除程序和它的本地数据。\r\n') +
    '登录凭证经 Windows 加密，换电脑或系统账号后需要重新扫码。\r\n', 'utf8');
  await writeFile(join(appOutDir, '使用说明.txt'),
    (installer ? 'Easy Music · Windows 安装版\r\n\r\n' : 'Easy Music · Windows 解压版\r\n\r\n') +
    (installer ? '1. 使用安装向导选择当前用户可写的位置，例如 D:\\Apps\\EasyMusic。请勿安装到 Program Files 等受保护目录。\r\n' : '1. 将全部内容解压到同一个可写文件夹，例如 D:\\Apps\\EasyMusic。\r\n') +
    '2. 双击 EasyMusic.exe 运行，无需安装 Node.js 或另开 API 服务。\r\n' +
    '3. 首次使用请扫码登录。不同目录中的程序各自保存数据。\r\n' +
    '4. 所有由应用管理的数据保存在程序旁的 data 文件夹。\r\n' +
    (installer ? '5. 安装版请使用 Windows 卸载程序；默认保留 data，勾选删除个人数据后才删除登录状态、设置和缓存。\r\n' : '5. 退出程序后可移动整个文件夹，或删除整个文件夹移除软件。\r\n') +
    (installer ? '6. 升级前先从托盘完整退出，再运行新安装程序。覆盖安装会保留 data 文件夹。\r\n\r\n' : '6. 升级前先退出，替换程序文件时请保留原有 data 文件夹。\r\n\r\n') +
    '未登录时最近播放显示本地记录，保存在 data/local-history.json；登录后显示网易云账号的最近播放。\r\n' +
    '切回窗口或进入相关页面时会自动刷新收藏数据，短时间内的重复刷新会合并。\r\n\r\n' +
    '设置 → 歌词页面样式，可在经典歌词与沉浸歌词（Apple Music 风格）之间选择，默认使用沉浸样式，已有选择会保留。\r\n' +
    '沉浸歌词使用封面氛围背景，隐藏底栏；封面下可控制播放、进度、音量和喜欢，点击歌手或专辑可进入对应页面。\r\n' +
    '点击歌词页左上角 × 或按 Esc 返回原页面，底栏随之恢复；鼠标移入歌词区域可切换译文与调整字号。\r\n\r\n' +
    '启动后会显示系统托盘图标（可能位于任务栏隐藏图标中）。点击图标或右键选择显示主窗口可恢复窗口。\r\n' +
    '设置中可开启关闭窗口时最小化到托盘，开启后点击 × 隐藏窗口并继续播放；默认点击 × 退出。\r\n' +
    '完整退出请右键托盘图标，选择退出 Easy Music。关闭行为保存在 data/desktop-settings.json。\r\n\r\n' +
    '设置 → 缓存与数据管理，可查看数据目录、网络缓存及诊断日志占用，分别清理缓存和日志，或打开数据目录。\r\n' +
    '网络缓存上限默认 512 MB，可选 256 MB、512 MB、1 GB 或无限制；修改后需完全退出再启动，最小化到托盘不会生效。该上限不包含账号数据、代码缓存、日志等。\r\n' +
    '清理保留登录状态、设置、播放记录和播放队列；服务临时文件可能含接口凭证，不作为垃圾删除。\r\n\r\n' +
    (installer ? '安装版会创建快捷方式和卸载信息。不要手动移动安装目录，以免快捷方式失效。\r\n' : '请先完整解压再运行，不要从压缩包内直接打开 EXE。\r\n') +
    'Windows 自身的系统运行记录不属于应用可完全控制的数据。\r\n', 'utf8');
  if (installer) await writeRemovalManifest(appOutDir, join(__dirname, '../build'));
};

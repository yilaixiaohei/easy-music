<img src="build/icon.svg" width="72" height="72" alt="Easy Music 图标" />

# Easy Music

基于 Electron、Vue 3 和 TypeScript 的 Windows 桌面音乐客户端，连接网易云音乐账号，提供简洁的音乐库和播放体验。

## 功能

- 扫码登录、登录状态恢复，以及喜欢 / 取消喜欢歌曲。
- 每日推荐、私人雷达、私人漫游、推荐歌单和排行榜。
- 歌曲、歌单、专辑和歌手搜索；歌手主页及专辑详情。
- 创建与收藏的歌单分组、展开 / 收起、创建与编辑歌单、收藏 / 取消收藏、删除歌单及批量歌曲操作。
- 收藏 / 取消收藏专辑；切回窗口或进入相关页面时同步账号数据。
- 播放队列、上一首 / 下一首、进度、音量，以及顺序、列表循环、单曲循环和随机播放。
- 标准、较高、极高和无损音质；可用音质取决于歌曲和账号权益，界面显示实际返回音质。
- 经典歌词与默认的沉浸歌词页面；逐行歌词、译文开关、字号调整和点击歌词跳转。
- 未登录时显示本地最近播放，登录后显示账号最近播放；重启后恢复队列与进度，保持暂停。
- 系统托盘、可选的关闭窗口后继续播放、缓存占用查看与清理。
- 网络缓存上限可选 256 MB、512 MB（默认）、1 GB 和无限制，完全退出并重新启动后生效。

## 下载和使用

发行文件放在 [Releases](https://github.com/yilaixiaohei/easy-music/releases)，源码仓库不包含编译产物。

| 版本 | 文件名示例 | 使用方式 |
| --- | --- | --- |
| ZIP 解压版 | `EasyMusic-0.1.0-win-x64.zip` | 完整解压，运行 `EasyMusic.exe` |
| 安装版 | `EasyMusic-Setup-0.1.0-x64.exe` | 按安装向导选择目录，创建快捷方式 |

请使用当前用户可写的独立目录，例如 `D:\Apps\EasyMusic`。程序将数据保存在 EXE 同级的 `data` 中，请勿安装到 `Program Files` 等受保护目录。无需安装 Node.js，也无需另开 API 服务。

安装包暂未进行数字签名。

### 数据、升级与卸载

```text
EasyMusic/
├─ EasyMusic.exe
├─ resources/              应用资源与依赖
├─ locales/、其他运行文件
├─ 使用说明.txt
└─ data/
   ├─ account.enc          加密的登录状态
   ├─ desktop-settings.json
   ├─ local-history.json
   ├─ session/             本地设置、队列等浏览器存储
   ├─ cache/               网络缓存
   ├─ temp/                接口运行所需临时文件
   ├─ logs/
   └─ crashes/
```

- 发行包不携带个人数据。凭证使用 Windows 加密，换电脑或系统账号后可能需要重新扫码。
- 升级前从托盘完整退出。ZIP 版替换程序文件时保留 `data`；安装版运行新安装程序并选择原目录，升级会保留 `data`。
- ZIP 版退出后可移动整个文件夹，或删除整个文件夹移除程序与数据。
- 安装版请通过 Windows“已安装的应用”卸载。默认保留个人数据，勾选“删除个人数据”才会删除；不要手动移动安装目录，以免快捷方式失效。
- 缓存管理保留账号、设置、播放历史和队列。缓存上限仅限制网络缓存，不是整个数据目录的上限。
- Windows 自身的运行记录不属于应用能够完全控制的数据。

## 本地开发

环境要求：Node.js 24 或更高版本、npm、Git。Windows x64 为当前打包目标。

```sh
git clone https://github.com/yilaixiaohei/easy-music.git
cd easy-music
npm ci
npm run dev
```

扫码登录、真实播放、托盘等能力请在 `npm run dev` 打开的 Electron 窗口中使用。浏览器预览不提供桌面接口。

```sh
npm run dev:web           # 浏览器预览界面
npm run typecheck         # Vue / TypeScript 类型检查
npm test                  # 不使用真实账号的自动化测试
npm run build             # 构建主进程、preload 和界面
npm run package:zip       # Windows x64 ZIP 解压版
npm run package:installer # Windows x64 NSIS 安装版
```

构建输出在 `out/` 和 `dist/`。`dist/win-unpacked` 会在打包时重建，请勿作为日常使用目录或在其中保存重要数据。

开发窗口使用 Electron 的开发数据目录，与发行版的 `data` 分开。在设置的“缓存与数据管理”中可以查看实际路径。

### 可选检查

以下命令需要先运行 `npm run build`，部分会访问真实服务；它们使用独立测试数据，不读取日常账号凭证。

```sh
npm run check:auth       # 二维码服务与系统加密检查，需要网络
npm run check:music      # 搜索和静音音频播放，需要网络
npm run check:tray       # 托盘、隐藏窗口及退出行为
npm run check:cover      # 公开封面加载与取色，需要网络
```

首次打包安装版时，electron-builder 需要下载 NSIS 工具。如网络无法访问官方下载，可临时指定工具镜像后重试；下载仍由打包工具执行校验和验证：

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run package:installer
```

## 项目结构

```text
src/main/               Electron 主进程、账号、音乐服务与存储管理
src/preload/            类型化 IPC 桥接
src/renderer/src/       Vue 页面、组件、状态与播放器
src/shared/             主进程与界面共享的数据契约
tests/                  自动化测试
scripts/                打包钩子、图标生成和隔离检查
build/                  图标与 NSIS 安装脚本
```

音乐接口使用 npm 包 `@neteasecloudmusicapienhanced/api`，在本机独立工具进程中运行。客户端不依赖开发者代为转发请求，也不向外开放本地 API HTTP 服务。登录凭证由主进程管理，界面不直接获取 Cookie。

## 已知限制

- 歌单收藏等写操作可能被上游接口以“操作频繁”等原因拒绝；失败时保留原状态，不自动循环提交写请求。
- 歌曲是否可播、是否提供完整歌词及实际音质由服务端和账号权益决定。
- 当前只提供浅色主界面；尚无桌面悬浮歌词、自动更新或 macOS / Linux 发行包。

本项目为独立客户端，未隶属于网易云音乐。歌曲、封面及歌词由服务端提供，不随源码或安装包分发。

## 许可证与致谢

项目采用 [MIT License](LICENSE)。第三方代码保留各自许可，详见 [第三方许可声明](THIRD_PARTY_NOTICES.md)。

感谢 [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)、[Electron](https://www.electronjs.org/)、[Vue](https://vuejs.org/)、[Pinia](https://pinia.vuejs.org/)、[Vue Router](https://router.vuejs.org/) 和 [Lucide](https://lucide.dev/)。

import { app, BrowserWindow, dialog, ipcMain, Menu, Tray, session, shell } from "electron";
import { join } from "node:path";
import { MusicService } from "./music-service";
import { AuthController } from "./auth-controller";
import { EncryptedSessionStore } from "./session-store";
import type { Result } from "../shared/contracts";
import { MusicController } from "./music-controller";
import { controlWindow, windowState } from "./window-controls";
import { configurePortableStorage } from "./portable";
import { LocalHistoryStore } from "./local-history";
import { DesktopSettingsStore, CloseToTrayController, configureCacheLimit } from "./desktop-settings";
import { StorageManager } from './storage-manager';

if (app.isPackaged) {
  try {
    configurePortableStorage(app);
  } catch {
    dialog.showErrorBox("Easy Music 无法保存数据", "无法写入程序旁的 data 文件夹。请将整个 Easy Music 文件夹解压到可写位置后重新运行。程序不会改用 C 盘保存数据。");
    app.exit(1);
  }
}

const music = new MusicService();
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const desktopSettings = new DesktopSettingsStore(app.getPath('userData'));
const activeCacheLimitMB = desktopSettings.read().cacheLimitMB;
// Chromium reads the disk cache capacity during initialization, before app.ready.
configureCacheLimit(app.commandLine, activeCacheLimitMB);
const closeToTray = new CloseToTrayController(
  () => desktopSettings?.read().closeToTray ?? false,
  () => !!tray && !tray.isDestroyed(),
);

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow) closeToTray.show(mainWindow);
}

function createTray(): void {
  // Pass the multi-resolution ICO directly so Windows chooses the proper DPI.
  const iconPath = app.isPackaged ? join(process.resourcesPath, "icon.ico") : join(app.getAppPath(), "build/icon.ico");
  try {
    tray = new Tray(iconPath);
    tray.setToolTip("Easy Music");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "显示主窗口", click: showMainWindow },
      { type: "separator" },
      { label: "退出 Easy Music", click: () => app.quit() },
    ]));
    tray.on("click", showMainWindow);
    tray.on("double-click", showMainWindow);
  } catch { tray = null; }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#f7f8fa",
    title: "Easy Music",
    icon: app.isPackaged ? join(process.resourcesPath, "icon.png") : join(app.getAppPath(), "build/icon.png"),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  mainWindow = window;
  window.on("close", event => closeToTray.close(event, window));
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
  const notifyState = () => {
    if (!window.isDestroyed())
      window.webContents.send("window:state-changed", windowState(window));
  };
  window.on("maximize", notifyState);
  window.on("unmaximize", notifyState);
  window.on("focus", notifyState);
  window.on("blur", notifyState);
  window.webContents.on("did-finish-load", notifyState);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.easymusic.desktop");
  const auth = new AuthController(
    (method, params) => music.call(method, params),
    new EncryptedSessionStore(app.getPath("userData")),
  );
  const library = new MusicController(
    (method, params) => music.call(method, params),
    () => auth.musicCookie(),
    () => auth.userId(),
  );
  for (const channel of ["window:state", "window:control"]) {
    ipcMain.handle(
      channel,
      (event, action): Result<ReturnType<typeof windowState>> => {
        const target = BrowserWindow.fromWebContents(event.sender);
        if (!target || event.senderFrame !== target.webContents.mainFrame)
          return { ok: false, error: "无法操作当前窗口。" };
        try {
          return {
            ok: true,
            data:
              channel === "window:state"
                ? windowState(target)
                : controlWindow(target, action),
          };
        } catch {
          return { ok: false, error: "窗口操作失败，请重试。" };
        }
      },
    );
  }
  function handle<T>(
    channel: string,
    action: (...args: any[]) => T | Promise<T>,
  ): void {
    ipcMain.handle(channel, async (event, ...args): Promise<Result<T>> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || event.senderFrame !== window.webContents.mainFrame) {
        return { ok: false, error: "无法从当前页面执行此操作。" };
      }
      try {
        return { ok: true, data: await action(...args) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "操作失败，请重试。",
        };
      }
    });
  }
  handle("window:get-settings", () => desktopSettings.read());
  const storage = new StorageManager({
    data: app.getPath('userData'), logs: app.getPath('logs'), crashes: app.getPath('crashDumps'),
    temporary: app.isPackaged ? app.getPath('temp') : undefined,
  }, session.defaultSession, () => ({ cacheLimitMB: desktopSettings.read().cacheLimitMB, activeCacheLimitMB }));
  handle('storage:info', () => storage.info());
  handle('storage:set-cache-limit', async (value: unknown) => {
    desktopSettings.setCacheLimit(value);
    return storage.info();
  });
  handle('storage:clear', (kind: unknown) => storage.clear(kind));
  handle('storage:open-directory', async () => {
    const error = await shell.openPath(app.getPath('userData'));
    if (error) throw new Error('无法打开数据目录，请稍后再试。');
  });
  handle("window:set-close-to-tray", (value: unknown) => {
    if (value === true && (!tray || tray.isDestroyed())) throw new Error("系统托盘暂不可用，无法开启此设置。");
    return desktopSettings.setCloseToTray(value);
  });
  handle("auth:session", () => auth.session());
  handle("auth:create-qr", () => auth.createQr());
  handle("auth:check-qr", () => auth.checkQr());
  handle("auth:cancel-qr", () => auth.cancelQr());
  handle("auth:logout", () => auth.logout());
  handle("music:search", (keywords: unknown, page: unknown) =>
    library.search(keywords, page),
  );
  handle("music:source", (id: unknown, quality: unknown) =>
    library.source(id, quality),
  );
  handle("music:playlists", (page: unknown) => library.playlists(page));
  handle("music:playlist", (id: unknown, refresh: unknown) =>
    library.playlist(id, refresh),
  );
  handle("music:recommendations", () => library.recommendations());
  handle("music:create-playlist", (name: unknown, privatePlaylist: unknown) => library.createPlaylist(name, privatePlaylist));
  handle("music:update-playlist", (id: unknown, value: unknown) => library.updatePlaylist(id, value));
  handle("music:delete-playlist", (id: unknown) => library.deletePlaylist(id));
  const localHistory = new LocalHistoryStore(app.getPath("userData"));
  handle("music:refresh-account-data", () => library.refreshAccountData());
  handle("music:recent-songs", () => library.recentSongs());
  handle("music:record-playback", (id: unknown) => library.recordPlayback(id));
  handle("music:local-history", () => localHistory.read());
  handle("music:save-local-history", (songs: unknown) => localHistory.write(songs));
  handle("music:set-playlist-saved", (id: unknown, saved: unknown) => library.setPlaylistSaved(id, saved));
  handle("music:playlist-tags", () => library.playlistTags());
  handle("music:change-playlist-songs", (id: unknown, ids: unknown, operation: unknown) => library.changePlaylistSongs(id, ids, operation));
  handle("music:search-catalog", (keywords: unknown, page: unknown, kind: unknown) => library.searchCatalog(keywords, page, kind));
  handle("music:artist", (id: unknown) => library.artist(id));
  handle("music:artist-songs", (id: unknown) => library.artistSongs(id));
  handle("music:artist-albums", (id: unknown) => library.artistAlbums(id));
  handle("music:artist-description", (id: unknown) => library.artistDescription(id));
  handle("music:album", (id: unknown) => library.album(id));
  handle("music:saved-albums", () => library.savedAlbums());
  handle("music:set-album-saved", (id: unknown, saved: unknown) => library.setAlbumSaved(id, saved));
  handle("music:charts", () => library.charts());
  handle("music:daily-songs", () => library.dailySongs());
  handle("music:radar", () => library.radar());
  handle("music:liked-ids", () => library.likedIds());
  handle("music:liked-songs", () => library.likedSongs());
  handle("music:set-liked", (id: unknown, liked: unknown) =>
    library.setLiked(id, liked),
  );
  handle("music:lyric", (id: unknown) => library.lyric(id));
  handle("music:roaming", (mode: unknown) => library.roaming(mode));
  handle("music:reduce-recommendation", (id: unknown) =>
    library.reduceRecommendation(id),
  );
  ipcMain.handle("app:version", () => app.getVersion());
  createTray();
  createWindow();
  app.on("activate", () => {
    showMainWindow();
  });
});

app.on("before-quit", () => { closeToTray.beforeQuit(); music.dispose(); });
app.on("will-quit", () => { tray?.destroy(); tray = null; });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

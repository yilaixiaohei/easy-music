import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/contracts";

contextBridge.exposeInMainWorld("desktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  storage: {
    info: () => ipcRenderer.invoke('storage:info'),
    setCacheLimit: value => ipcRenderer.invoke('storage:set-cache-limit', value),
    clear: kind => ipcRenderer.invoke('storage:clear', kind),
    openDirectory: () => ipcRenderer.invoke('storage:open-directory'),
  },
  window: {
    getSettings: () => ipcRenderer.invoke("window:get-settings"),
    setCloseToTray: (value) => ipcRenderer.invoke("window:set-close-to-tray", value),
    state: () => ipcRenderer.invoke("window:state"),
    control: (action) => ipcRenderer.invoke("window:control", action),
    onState: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        state: Parameters<typeof callback>[0],
      ) => callback(state);
      ipcRenderer.on("window:state-changed", listener);
      return () => {
        ipcRenderer.removeListener("window:state-changed", listener);
      };
    },
  },
  auth: {
    session: () => ipcRenderer.invoke("auth:session"),
    createQr: () => ipcRenderer.invoke("auth:create-qr"),
    checkQr: () => ipcRenderer.invoke("auth:check-qr"),
    cancelQr: () => ipcRenderer.invoke("auth:cancel-qr"),
    logout: () => ipcRenderer.invoke("auth:logout"),
  },
  music: {
    createPlaylist: (name, privatePlaylist) => ipcRenderer.invoke("music:create-playlist", name, privatePlaylist),
    updatePlaylist: (id, value) => ipcRenderer.invoke("music:update-playlist", id, value),
    deletePlaylist: (id) => ipcRenderer.invoke("music:delete-playlist", id),
    refreshAccountData: () => ipcRenderer.invoke("music:refresh-account-data"),
    recentSongs: () => ipcRenderer.invoke("music:recent-songs"),
    recordPlayback: (id) => ipcRenderer.invoke("music:record-playback", id),
    localHistory: () => ipcRenderer.invoke("music:local-history"),
    saveLocalHistory: (songs) => ipcRenderer.invoke("music:save-local-history", songs),
    setPlaylistSaved: (id, saved) => ipcRenderer.invoke("music:set-playlist-saved", id, saved),
    playlistTags: () => ipcRenderer.invoke("music:playlist-tags"),
    changePlaylistSongs: (id, ids, operation) => ipcRenderer.invoke("music:change-playlist-songs", id, ids, operation),
    searchCatalog: (keywords, page, kind) => ipcRenderer.invoke("music:search-catalog", keywords, page, kind),
    artist: (id) => ipcRenderer.invoke("music:artist", id),
    artistSongs: (id) => ipcRenderer.invoke("music:artist-songs", id),
    artistAlbums: (id) => ipcRenderer.invoke("music:artist-albums", id),
    artistDescription: (id) => ipcRenderer.invoke("music:artist-description", id),
    album: (id) => ipcRenderer.invoke("music:album", id),
    savedAlbums: () => ipcRenderer.invoke("music:saved-albums"),
    setAlbumSaved: (id, saved) => ipcRenderer.invoke("music:set-album-saved", id, saved),
    search: (keywords, page) =>
      ipcRenderer.invoke("music:search", keywords, page),
    source: (id, quality) => ipcRenderer.invoke("music:source", id, quality),
    playlists: (page) => ipcRenderer.invoke("music:playlists", page),
    playlist: (id, refresh) => ipcRenderer.invoke("music:playlist", id, refresh),
    recommendations: () => ipcRenderer.invoke("music:recommendations"),
    charts: () => ipcRenderer.invoke("music:charts"),
    dailySongs: () => ipcRenderer.invoke("music:daily-songs"),
    radar: () => ipcRenderer.invoke("music:radar"),
    likedIds: () => ipcRenderer.invoke("music:liked-ids"),
    likedSongs: () => ipcRenderer.invoke("music:liked-songs"),
    setLiked: (id, liked) => ipcRenderer.invoke("music:set-liked", id, liked),
    lyric: (id) => ipcRenderer.invoke("music:lyric", id),
    roaming: (mode) => ipcRenderer.invoke("music:roaming", mode),
    reduceRecommendation: (id) => ipcRenderer.invoke("music:reduce-recommendation", id),
  },
} satisfies DesktopApi);

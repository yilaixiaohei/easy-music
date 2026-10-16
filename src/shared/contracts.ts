export interface UserProfile {
  userId: number;
  nickname: string;
  avatarUrl: string;
}

export interface AccountSession {
  authenticated: boolean;
  profile: UserProfile | null;
  warning?: string;
}

export interface QrTicket {
  image: string;
  expiresAt: number;
}

export interface QrResult {
  status: "waiting" | "confirming" | "expired" | "success" | "cancelled";
  session?: AccountSession;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Song {
  id: number;
  title: string;
  artists: string;
  album: string;
  cover: string;
  duration: number;
  artistRefs?: { id: number; name: string }[];
  albumId?: number;
}

export interface Artist {
  id: number;
  name: string;
  cover: string;
  brief: string;
  songCount: number;
  albumCount: number;
}
export interface Album {
  id: number;
  name: string;
  cover: string;
  artists: { id: number; name: string }[];
  publishTime: number;
  size: number;
}
export interface ArtistDetail {
  artist: Artist;
  songs: Song[];
}
export interface ArtistDescription {
  brief: string;
  sections: { title: string; text: string }[];
}
export interface AlbumDetail {
  album: Album;
  songs: Song[];
  description: string;
}
export type SearchKind = "songs" | "playlists" | "albums" | "artists";
export interface CatalogSearch {
  songs: Song[];
  playlists: Playlist[];
  albums: Album[];
  artists: Artist[];
  total: number;
  hasMore: boolean;
}

export type AudioQuality = "standard" | "higher" | "exhigh" | "lossless";
export type RoamingMode = "DEFAULT" | "FAMILIAR" | "EXPLORE";
export interface SongSearch {
  songs: Song[];
  total: number;
  hasMore: boolean;
}
export interface LikedMusic {
  ids: number[];
  songs: Song[];
  total: number;
  unavailable: number;
}
export interface PlaybackSource {
  url: string | null;
  level: string;
  trial: boolean;
  trialStart?: number;
  reason?: string;
}

export interface WindowState {
  maximized: boolean;
  focused: boolean;
}
export type CacheLimitMB = 256 | 512 | 1024 | null;
export interface DesktopSettings { closeToTray: boolean; cacheLimitMB: CacheLimitMB }
export interface StorageInfo {
  cacheLimitMB: CacheLimitMB;
  activeCacheLimitMB: CacheLimitMB;
  directory: string;
  totalBytes: number;
  cacheBytes: number;
  diagnosticBytes: number;
  temporaryBytes: number | null;
  approximate: boolean;
}
export interface StorageCleanup { info: StorageInfo; skippedFiles: number }
export type WindowAction = "minimize" | "toggle-maximize" | "close";
export interface Playlist {
  id: number;
  name: string;
  cover: string;
  description: string;
  trackCount: number;
  creator: string;
  creatorId: number;
  subscribed: boolean;
  specialType?: number;
  tags?: string[];
  privacy?: number;
}
export interface PlaylistEdit { name: string; description: string; tags: string[] }
export interface PlaylistTag { name: string; category: string }
export interface PlaylistPage {
  playlists: Playlist[];
  more: boolean;
}
export interface MusicChart extends Playlist {
  updateFrequency: string;
  previews: Pick<Song, "title" | "artists" | "cover">[];
}
export interface PlaylistSongs {
  playlist: Playlist;
  songs: Song[];
  total: number;
  unavailable: number;
}
export interface LyricData {
  original: string;
  translated: string;
  instrumental: boolean;
}

export interface DesktopApi {
  getVersion(): Promise<string>;
  storage: {
    info(): Promise<Result<StorageInfo>>;
    setCacheLimit(value: CacheLimitMB): Promise<Result<StorageInfo>>;
    clear(kind: 'cache' | 'diagnostics'): Promise<Result<StorageCleanup>>;
    openDirectory(): Promise<Result<void>>;
  };
  window: {
    getSettings(): Promise<Result<DesktopSettings>>;
    setCloseToTray(value: boolean): Promise<Result<DesktopSettings>>;
    state(): Promise<Result<WindowState>>;
    control(action: WindowAction): Promise<Result<WindowState>>;
    onState(callback: (state: WindowState) => void): () => void;
  };
  auth: {
    session(): Promise<Result<AccountSession>>;
    createQr(): Promise<Result<QrTicket>>;
    checkQr(): Promise<Result<QrResult>>;
    cancelQr(): Promise<Result<void>>;
    logout(): Promise<Result<AccountSession>>;
  };
  music: {
    createPlaylist(name: string, privatePlaylist: boolean): Promise<Result<Playlist>>;
    updatePlaylist(id: number, value: PlaylistEdit): Promise<Result<void>>;
    deletePlaylist(id: number): Promise<Result<void>>;
    refreshAccountData(): Promise<Result<void>>;
    recentSongs(): Promise<Result<Song[]>>;
    recordPlayback(id: number): Promise<Result<void>>;
    localHistory(): Promise<Result<Song[] | null>>;
    saveLocalHistory(songs: Song[]): Promise<Result<void>>;
    setPlaylistSaved(id: number, saved: boolean): Promise<Result<void>>;
    playlistTags(): Promise<Result<PlaylistTag[]>>;
    changePlaylistSongs(id: number, ids: number[], operation: "add" | "del"): Promise<Result<void>>;
    searchCatalog(keywords: string, page: number, kind: SearchKind): Promise<Result<CatalogSearch>>;
    artist(id: number): Promise<Result<ArtistDetail>>;
    artistSongs(id: number): Promise<Result<Song[]>>;
    artistAlbums(id: number): Promise<Result<Album[]>>;
    artistDescription(id: number): Promise<Result<ArtistDescription>>;
    album(id: number): Promise<Result<AlbumDetail>>;
    savedAlbums(): Promise<Result<Album[]>>;
    setAlbumSaved(id: number, saved: boolean): Promise<Result<void>>;
    search(keywords: string, page: number): Promise<Result<SongSearch>>;
    source(id: number, quality: AudioQuality): Promise<Result<PlaybackSource>>;
    playlists(page: number): Promise<Result<PlaylistPage>>;
    playlist(id: number, refresh?: boolean): Promise<Result<PlaylistSongs>>;
    recommendations(): Promise<Result<Playlist[]>>;
    charts(): Promise<Result<MusicChart[]>>;
    dailySongs(): Promise<Result<Song[]>>;
    radar(): Promise<Result<Playlist>>;
    likedIds(): Promise<Result<number[]>>;
    likedSongs(): Promise<Result<LikedMusic>>;
    setLiked(id: number, liked: boolean): Promise<Result<void>>;
    lyric(id: number): Promise<Result<LyricData>>;
    roaming(mode: RoamingMode): Promise<Result<Song[]>>;
    reduceRecommendation(id: number): Promise<Result<void>>;
  };
}

import type {
  AudioQuality,
  PlaybackSource,
  Song,
  SongSearch,
  Playlist,
  PlaylistPage,
  PlaylistSongs,
  LyricData,
  LikedMusic,
  MusicChart,
  Artist, Album, ArtistDetail, ArtistDescription, AlbumDetail, CatalogSearch, SearchKind,
  PlaylistEdit, PlaylistTag,
} from "../shared/contracts";
import type { CallApi } from "./auth-controller";
import { isAudioQuality } from "../shared/audio-quality";

function secureUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return "";
    url.protocol = "https:";
    return url.href;
  } catch {
    return "";
  }
}

function positiveId(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("音乐资源 ID 无效。");
}
function pageOffset(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 1000
  )
    throw new Error("页码无效。");
  return (value - 1) * 50;
}
export function normalizePlaylist(raw: any): Playlist | null {
  if (
    !raw ||
    !Number.isSafeInteger(raw.id) ||
    raw.id <= 0 ||
    typeof raw.name !== "string"
  )
    return null;
  return {
    id: raw.id,
    name: raw.name,
    cover: secureUrl(raw.coverImgUrl ?? raw.picUrl),
    description: typeof raw.description === "string" ? raw.description : "",
    trackCount: Number.isSafeInteger(raw.trackCount)
      ? Math.max(0, raw.trackCount)
      : 0,
    creator:
      typeof raw.creator?.nickname === "string"
        ? raw.creator.nickname
        : "网易云音乐",
    creatorId: Number.isSafeInteger(raw.creator?.userId ?? raw.userId)
      ? (raw.creator?.userId ?? raw.userId)
      : 0,
    subscribed: raw.subscribed === true,
    ...(Number.isSafeInteger(raw.specialType) ? { specialType: raw.specialType } : {}),
    ...(Array.isArray(raw.tags) ? { tags: raw.tags.filter((tag: unknown) => typeof tag === "string") } : {}),
    ...(Number.isSafeInteger(raw.privacy) ? { privacy: raw.privacy } : {}),
  };
}

export function normalizeSong(raw: any): Song | null {
  if (
    !raw ||
    !Number.isSafeInteger(raw.id) ||
    raw.id <= 0 ||
    typeof raw.name !== "string"
  )
    return null;
  const album = raw.al ?? raw.album;
  const artists = raw.ar ?? raw.artists;
  return {
    id: raw.id,
    title: raw.name,
    artists: Array.isArray(artists)
      ? artists
          .map((artist: any) =>
            typeof artist?.name === "string" ? artist.name : "",
          )
          .filter(Boolean)
          .join(" / ") || "未知歌手"
      : "未知歌手",
    album: typeof album?.name === "string" ? album.name : "未知专辑",
    ...(Number.isSafeInteger(album?.id) && album.id > 0 ? { albumId: album.id } : {}),
    ...(Array.isArray(artists) ? { artistRefs: artists.filter((a: any) => Number.isSafeInteger(a?.id) && a.id > 0 && typeof a.name === "string").map((a: any) => ({ id: a.id, name: a.name })) } : {}),
    cover: secureUrl(album?.picUrl),
    duration:
      typeof (raw.dt ?? raw.duration) === "number" &&
      Number.isFinite(raw.dt ?? raw.duration)
        ? Math.max(0, (raw.dt ?? raw.duration) / 1000)
        : 0,
  };
}

function artistRefs(raw: any): { id: number; name: string }[] {
  return (Array.isArray(raw) ? raw : []).filter((a: any) => Number.isSafeInteger(a?.id) && a.id > 0 && typeof a.name === "string").map((a: any) => ({ id: a.id, name: a.name }));
}
export function normalizeArtist(raw: any): Artist | null {
  if (!Number.isSafeInteger(raw?.id) || raw.id <= 0 || typeof raw.name !== "string") return null;
  return { id: raw.id, name: raw.name, cover: secureUrl(raw.picUrl || raw.img1v1Url || raw.cover), brief: typeof raw.briefDesc === "string" ? raw.briefDesc : "", songCount: Number.isSafeInteger(raw.musicSize) ? Math.max(0, raw.musicSize) : 0, albumCount: Number.isSafeInteger(raw.albumSize) ? Math.max(0, raw.albumSize) : 0 };
}
export function normalizeAlbum(raw: any): Album | null {
  if (!Number.isSafeInteger(raw?.id) || raw.id <= 0 || typeof raw.name !== "string") return null;
  return { id: raw.id, name: raw.name, cover: secureUrl(raw.picUrl), artists: artistRefs(raw.artists?.length ? raw.artists : raw.artist ? [raw.artist] : []), publishTime: Number.isFinite(raw.publishTime) ? raw.publishTime : 0, size: Number.isSafeInteger(raw.size) ? Math.max(0, raw.size) : 0 };
}

export class MusicController {
  private cacheCookie = "";
  private details = new Map<number, { body: any; time: number }>();
  private likes: { ids: number[]; time: number } | null = null;
  private likesRequest: Promise<number[]> | null = null;
  private likesVersion = 0;
  private chartCache: { charts: MusicChart[]; time: number } | null = null;
  private detailsVersion = 0;
  constructor(
    private call: CallApi,
    private cookie: () => string,
    private uid: () => number | null = () => null,
  ) {}

  private context(required = false): { cookie: string; uid: number | null } {
    const cookie = this.cookie();
    const uid = this.uid();
    if (this.cacheCookie !== cookie) {
      this.details.clear();
      this.likes = null;
      this.likesRequest = null;
      this.likesVersion++;
      this.chartCache = null;
      this.cacheCookie = cookie;
    }
    if (required && (!cookie || !uid))
      throw new Error("请先扫码登录，或在设置中重新检查账号状态。");
    return { cookie, uid };
  }
  private async request(
    method: string,
    params: Record<string, unknown>,
    cookie: string,
  ): Promise<Record<string, any>> {
    if (this.cookie() !== cookie) throw new Error("账号状态已变化，请重新加载。");
    const body = await this.call(method, { ...params, cookie });
    if (this.cookie() !== cookie)
      throw new Error("账号状态已变化，请重新加载。");
    if (body.code !== 200)
      throw new Error(
        body.code === 301
          ? "登录已失效，请重新扫码。"
          : "音乐内容暂时不可用，请稍后重试。",
      );
    return body;
  }

  async playlists(page: unknown): Promise<PlaylistPage> {
    const offset = pageOffset(page);
    const { cookie, uid } = this.context(true);
    const body = await this.request(
      "user_playlist",
      { uid, limit: 50, offset },
      cookie,
    );
    const playlists = Array.isArray(body.playlist)
      ? body.playlist
          .map(normalizePlaylist)
          .filter((value: Playlist | null): value is Playlist => Boolean(value))
      : [];
    return { playlists, more: playlists.length > 0 && body.more === true };
  }

  refreshAccountData(): void {
    this.context(true);
    this.details.clear(); this.detailsVersion++;
    this.likes = null; this.likesVersion++;
  }
  async recentSongs(): Promise<Song[]> {
    const { cookie } = this.context(true);
    const body = await this.request("record_recent_song", { limit: 100 }, cookie);
    if (!Array.isArray(body.data?.list)) throw new Error("暂时无法读取账号最近播放，请稍后重试。");
    const seen = new Set<number>();
    return body.data.list.flatMap((entry: any) => {
      const song = normalizeSong(entry?.data);
      if (!song || seen.has(song.id)) return [];
      seen.add(song.id); return [song];
    });
  }
  async recordPlayback(id: unknown): Promise<void> {
    positiveId(id);
    const { cookie } = this.context(true);
    await this.request("record_playback_start", { id }, cookie);
  }

  async recommendations(): Promise<Playlist[]> {
    const { cookie } = this.context();
    // Fetch a full recommendation batch so removing the separate radar card still leaves ten entries.
    const body = await this.request("personalized", { limit: 30 }, cookie);
    return Array.isArray(body.result)
      ? body.result
          .map(normalizePlaylist)
          .filter((value: Playlist | null): value is Playlist => Boolean(value))
      : [];
  }

  async createPlaylist(name: unknown, privatePlaylist: unknown): Promise<Playlist> {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 40 || typeof privatePlaylist !== "boolean") throw new Error("请输入 1 到 40 个字符的歌单名称。");
    const { cookie, uid } = this.context(true);
    const body = await this.request("playlist_create", { name: name.trim(), privacy: privatePlaylist ? 10 : 0, type: "NORMAL" }, cookie);
    const playlist = normalizePlaylist({ ...body.playlist, userId: uid });
    if (!playlist) throw new Error("歌单可能已创建，请刷新侧栏确认。");
    return playlist;
  }

  private async ownedPlaylist(id: number, cookie: string, uid: number | null): Promise<Playlist> {
    // Never authorize a write from renderer metadata or a cached public detail.
    const body = await this.request("playlist_detail", { id }, cookie);
    const playlist = normalizePlaylist(body.playlist);
    if (!playlist || playlist.creatorId !== uid) throw new Error("只能修改自己创建的歌单。");
    return playlist;
  }

  async playlistTags(): Promise<PlaylistTag[]> {
    const { cookie } = this.context();
    const body = await this.request("playlist_catlist", {}, cookie);
    return (Array.isArray(body.sub) ? body.sub : []).filter((tag: any) => typeof tag?.name === "string" && typeof body.categories?.[tag.category] === "string").map((tag: any) => ({ name: tag.name, category: body.categories[tag.category] }));
  }

  async updatePlaylist(id: unknown, value: unknown): Promise<void> {
    positiveId(id);
    const input = value as PlaylistEdit | null;
    if (!input || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 40 || typeof input.description !== "string" || input.description.length > 1000 || !Array.isArray(input.tags) || input.tags.length > 3 || input.tags.some(tag => typeof tag !== "string" || tag.length > 30 || tag.includes(";"))) throw new Error("请检查歌单名称、简介和标签（最多 3 个）。");
    const { cookie, uid } = this.context(true);
    const playlist = await this.ownedPlaylist(id, cookie, uid);
    if (playlist.specialType === 5) throw new Error("喜欢歌单的信息由网易云音乐管理。");
    if (input.tags.length) {
      const catalog = await this.playlistTags();
      if (input.tags.some(tag => !catalog.some(item => item.name === tag))) throw new Error("请选择有效的歌单标签。");
    }
    // Upstream playlist_update interpolates these values into JSON strings.
    const escape = (text: string) => JSON.stringify(text).slice(1, -1);
    try {
      const body = await this.request("playlist_update", { id, name: escape(input.name.trim()), desc: escape(input.description), tags: escape([...new Set(input.tags)].join(";")) }, cookie);
      const paths = ["/api/playlist/desc/update", "/api/playlist/tags/update", "/api/playlist/update/name"];
      if (paths.some(path => body[path] && body[path].code !== 200)) throw new Error("部分歌单信息未能保存，请刷新后重试。");
    } finally { this.details.delete(id); this.detailsVersion++; }
  }

  async deletePlaylist(id: unknown): Promise<void> {
    positiveId(id);
    const { cookie, uid } = this.context(true);
    const playlist = await this.ownedPlaylist(id, cookie, uid);
    if (playlist.specialType === 5) throw new Error("我喜欢的音乐不能删除。");
    try {
      await this.request("playlist_delete", { id }, cookie);
    } finally { this.details.delete(id); this.detailsVersion++; }
  }

  async setPlaylistSaved(id: unknown, saved: unknown): Promise<void> {
    positiveId(id);
    if (typeof saved !== "boolean") throw new Error("歌单收藏状态无效。");
    const { cookie, uid } = this.context(true);
    const body = await this.request("playlist_detail", { id }, cookie);
    const playlist = normalizePlaylist(body.playlist);
    if (!playlist) throw new Error("这个歌单暂时无法查看。");
    if (playlist.creatorId === uid) throw new Error("自己创建的歌单无需收藏。");
    try {
      // The UI may be behind changes made by another client. Do not submit an
      // already satisfied operation; require the explicit server boolean.
      if (body.playlist.subscribed === saved) return;
      try {
        await this.request("playlist_subscribe", { id, t: saved ? 1 : 2 }, cookie);
      } catch (reason) {
        // An ambiguous rejection/connection failure is not proof that a write
        // did not commit. Read once, never retry the write automatically.
        try {
          const verification = await this.request("playlist_detail", { id, verifySavedState: saved }, cookie);
          if (verification.playlist?.id === id && verification.playlist.subscribed === saved) return;
        } catch { /* Preserve the original error if verification is unavailable. */ }
        throw reason;
      }
    } finally { this.details.delete(id); this.detailsVersion++; }
  }

  async changePlaylistSongs(id: unknown, ids: unknown, operation: unknown): Promise<void> {
    positiveId(id);
    if (!Array.isArray(ids) || !ids.length || ids.length > 100000 || ids.some(songId => typeof songId !== "number" || !Number.isSafeInteger(songId) || songId <= 0) || (operation !== "add" && operation !== "del")) throw new Error("歌曲列表或操作无效。");
    const { cookie, uid } = this.context(true);
    const playlist = await this.ownedPlaylist(id, cookie, uid);
    const unique = [...new Set<number>(ids)];
    let completed = 0;
    try {
      if (playlist.specialType === 5) {
        for (const songId of unique) {
          await this.request("like", { id: songId, like: String(operation === "add") }, cookie);
          completed++;
        }
      } else {
        for (let start = 0; start < unique.length; start += 500) {
          let body = await this.call("playlist_tracks", { pid: id, tracks: unique.slice(start, start + 500).join(","), op: operation, cookie });
          if (this.cookie() !== cookie) throw new Error("账号状态已变化，请重新加载。");
          // This module wraps successful responses in a second body envelope.
          if (body.code === undefined && body.body) body = body.body;
          if (body.code !== 200) throw new Error(body.code === 502 ? "这些歌曲可能已在歌单中，请刷新确认。" : "修改歌单失败，请稍后重试。");
          completed += Math.min(500, unique.length - start);
        }
      }
    } catch (reason) {
      if (completed) throw new Error(`已处理 ${completed} 首歌曲，其余未完成，请刷新后重试。`);
      throw reason;
    } finally {
      this.details.delete(id);
      this.detailsVersion++;
      if (playlist.specialType === 5) { this.likes = null; this.likesVersion++; }
    }
  }

  async searchCatalog(keywords: unknown, page: unknown, kind: unknown): Promise<CatalogSearch> {
    if (typeof keywords !== "string" || !keywords.trim() || keywords.trim().length > 100) throw new Error("请输入 1 到 100 个字符的搜索关键词。");
    pageOffset(page);
    const types = { songs: 1, playlists: 1000, albums: 10, artists: 100 };
    if (typeof kind !== "string" || !Object.hasOwn(types, kind)) throw new Error("搜索类型无效。");
    const { cookie } = this.context();
    const body = await this.request("cloudsearch", { keywords: keywords.trim(), type: types[kind as SearchKind], limit: 30, offset: ((page as number) - 1) * 30 }, cookie);
    const raw = body.result ?? {};
    const result: CatalogSearch = { songs: [], playlists: [], albums: [], artists: [], total: 0, hasMore: false };
    if (kind === "songs") result.songs = (Array.isArray(raw.songs) ? raw.songs : []).map(normalizeSong).filter(Boolean);
    if (kind === "playlists") result.playlists = (Array.isArray(raw.playlists) ? raw.playlists : []).map(normalizePlaylist).filter(Boolean);
    if (kind === "albums") result.albums = (Array.isArray(raw.albums) ? raw.albums : []).map(normalizeAlbum).filter(Boolean);
    if (kind === "artists") result.artists = (Array.isArray(raw.artists) ? raw.artists : []).map(normalizeArtist).filter(Boolean);
    const count = raw[({ songs: "songCount", playlists: "playlistCount", albums: "albumCount", artists: "artistCount" } as const)[kind as SearchKind]];
    result.total = Number.isSafeInteger(count) ? Math.max(0, count) : result[kind as SearchKind].length;
    result.hasMore = result[kind as SearchKind].length > 0 && (page as number) * 30 < result.total;
    return result;
  }

  async artist(id: unknown): Promise<ArtistDetail> {
    positiveId(id);
    const { cookie } = this.context();
    const body = await this.request("artists", { id }, cookie);
    const artist = normalizeArtist(body.artist);
    if (!artist) throw new Error("无法读取歌手资料。");
    return { artist, songs: (Array.isArray(body.hotSongs) ? body.hotSongs : []).slice(0, 50).map(normalizeSong).filter((song: Song | null): song is Song => Boolean(song)) };
  }

  async artistDescription(id: unknown): Promise<ArtistDescription> {
    positiveId(id);
    const { cookie } = this.context();
    const body = await this.request("artist_desc", { id }, cookie);
    return { brief: typeof body.briefDesc === "string" ? body.briefDesc : "", sections: (Array.isArray(body.introduction) ? body.introduction : []).filter((item: any) => typeof item?.ti === "string" && typeof item.txt === "string").map((item: any) => ({ title: item.ti, text: item.txt })) };
  }

  // Gather upstream pages without exposing pagination in full catalog views.
  private async collect(method: string, params: Record<string, unknown>, key: string, cookie: string): Promise<any[]> {
    const items = new Map<number, any>();
    for (let offset = 0; offset < 100000; offset += 100) {
      const body = await this.request(method, { ...params, offset, limit: 100 }, cookie);
      if (!Array.isArray(body[key])) throw new Error("列表数据暂时不可用，请重试。");
      const batch = body[key];
      const before = items.size;
      for (const item of batch) if (Number.isSafeInteger(item?.id) && item.id > 0) items.set(item.id, item);
      const total = Number.isSafeInteger(body.total) ? body.total : Number.isSafeInteger(body.count) ? body.count : null;
      if (body.more === false || (total !== null && offset + batch.length >= total) || (batch.length < 100 && body.more !== true && total === null)) return [...items.values()];
      if (!batch.length || items.size === before) throw new Error("列表未能完整加载，请重试。");
    }
    throw new Error("列表过大，无法完整加载。");
  }

  async artistSongs(id: unknown): Promise<Song[]> {
    positiveId(id);
    const { cookie } = this.context();
    return (await this.collect("artist_songs", { id, order: "hot" }, "songs", cookie)).map(normalizeSong).filter((s): s is Song => Boolean(s));
  }

  async artistAlbums(id: unknown): Promise<Album[]> {
    positiveId(id);
    const { cookie } = this.context();
    return (await this.collect("artist_album", { id }, "hotAlbums", cookie)).map(normalizeAlbum).filter((a): a is Album => Boolean(a));
  }

  async album(id: unknown): Promise<AlbumDetail> {
    positiveId(id);
    const { cookie } = this.context();
    const body = await this.request("album", { id }, cookie);
    const album = normalizeAlbum(body.album);
    if (!album || !Array.isArray(body.songs)) throw new Error("无法读取专辑内容。");
    const songs = body.songs.map((raw: any) => normalizeSong({ ...raw, al: { ...body.album, ...(raw.al || raw.album), id: album.id, name: album.name, picUrl: album.cover }, ar: raw.ar || raw.artists || body.album.artists })).filter((song: Song | null): song is Song => Boolean(song));
    return { album, songs, description: typeof body.album.description === "string" ? body.album.description : "" };
  }

  async savedAlbums(): Promise<Album[]> {
    const { cookie } = this.context(true);
    return (await this.collect("album_sublist", {}, "data", cookie)).map(normalizeAlbum).filter((a): a is Album => Boolean(a));
  }

  async setAlbumSaved(id: unknown, saved: unknown): Promise<void> {
    positiveId(id);
    if (typeof saved !== "boolean") throw new Error("收藏状态无效。");
    const { cookie } = this.context(true);
    await this.request("album_sub", { id, t: saved ? 1 : 2 }, cookie);
  }

  async dailySongs(): Promise<Song[]> {
    const { cookie } = this.context(true);
    const body = await this.request("recommend_songs", {}, cookie);
    return Array.isArray(body.data?.dailySongs)
      ? body.data.dailySongs
          .map(normalizeSong)
          .filter((value: Song | null): value is Song => Boolean(value))
      : [];
  }

  async charts(): Promise<MusicChart[]> {
    const { cookie } = this.context();
    if (this.chartCache && Date.now() - this.chartCache.time < 60000)
      return this.chartCache.charts;
    const body = await this.request("toplist_detail", {}, cookie);
    if (!Array.isArray(body.list)) throw new Error("暂时无法获取排行榜，请稍后重试。");
    const names = ["新歌榜", "热歌榜", "飙升榜", "网易云欧美热歌榜", "网易云日语榜", "网易云韩语榜"];
    const selected = names.map((name) => body.list.find((item: any) => item.name === name))
      .filter((item) => item && normalizePlaylist(item));
    const charts: MusicChart[] = await Promise.all(selected.map(async (raw) => {
      const playlist = normalizePlaylist(raw)!;
      let previews: MusicChart["previews"] = Array.isArray(raw.tracks) ? raw.tracks
        .filter((track: any) => typeof track.first === "string")
        .slice(0, 3)
        .map((track: any) => ({ title: track.first, artists: typeof track.second === "string" ? track.second : "", cover: "" })) : [];
      try {
        const detail = await this.request("playlist_detail", { id: playlist.id }, cookie);
        if (normalizePlaylist(detail.playlist) && Array.isArray(detail.playlist.trackIds)) {
          if (this.details.size >= 20) this.details.delete(this.details.keys().next().value!);
          this.details.set(playlist.id, { body: detail.playlist, time: Date.now() });
        }
        const tracks: Song[] = Array.isArray(detail.playlist?.tracks)
          ? detail.playlist.tracks.map(normalizeSong).filter((song: Song | null): song is Song => song !== null) : [];
        const known = new Map(tracks.map((song) => [song.id, song]));
        const ordered: Song[] = Array.isArray(detail.playlist?.trackIds)
          ? detail.playlist.trackIds.slice(0, 3).flatMap((item: any) => known.has(item.id) ? [known.get(item.id)!] : [])
          : tracks.slice(0, 3);
        if (ordered.length) previews = ordered.map(({ title, artists, cover }) => ({ title, artists, cover }));
      } catch {
        // Keep the chart link and catalogue summary available when a preview fails.
        if (this.cookie() !== cookie) throw new Error("账号状态已变化，请重新加载。");
      }
      return { ...playlist, updateFrequency: typeof raw.updateFrequency === "string" ? raw.updateFrequency : "", previews };
    }));
    this.chartCache = { charts, time: Date.now() };
    return charts;
  }

  async radar(): Promise<Playlist> {
    const { cookie } = this.context(true);
    // NetEase's shared radar entry resolves to personalized contents with the login cookie.
    const body = await this.request("playlist_detail", { id: 3136952023 }, cookie);
    const playlist = normalizePlaylist(body.playlist);
    if (!playlist || body.playlist.specialType !== 100 || !playlist.name.includes("私人雷达"))
      throw new Error("暂时无法读取你的私人雷达，请稍后重试。");
    if (this.details.size >= 20) this.details.delete(this.details.keys().next().value!);
    this.details.set(playlist.id, { body: body.playlist, time: Date.now() });
    return playlist;
  }

  async playlist(id: unknown, refresh: unknown = false): Promise<PlaylistSongs> {
    positiveId(id);
    if (refresh !== undefined && typeof refresh !== "boolean") throw new Error("歌单刷新参数无效。");
    if (refresh) { this.details.delete(id); this.detailsVersion++; }
    const { cookie } = this.context();
    const version = this.detailsVersion;
    let cached = this.details.get(id);
    if (!cached || Date.now() - cached.time > 60000) {
      const body = await this.request("playlist_detail", { id }, cookie);
      if (version !== this.detailsVersion) return this.playlist(id);
      cached = { body: body.playlist, time: Date.now() };
      if (this.details.size >= 20)
        this.details.delete(this.details.keys().next().value!);
      this.details.set(id, cached);
    }
    const playlist = normalizePlaylist(cached.body);
    if (!playlist) throw new Error("这个歌单暂时无法查看。");
    const tracks: any[] = Array.isArray(cached.body.tracks)
      ? cached.body.tracks
      : [];
    if (!Array.isArray(cached.body.trackIds))
      throw new Error("暂时无法读取完整歌单，请稍后重试。");
    const ids = [
      ...new Set<number>(
        cached.body.trackIds
          .map((item: any) => item.id)
          .filter(
            (value: unknown) =>
              typeof value === "number" &&
              Number.isSafeInteger(value) &&
              value > 0,
          ),
      ),
    ];
    const known = new Map<number, Song | null>(
      tracks.map((track) => [track.id, normalizeSong(track)]),
    );
    const missing = ids.filter((songId) => !known.get(songId));
    for (let start = 0; start < missing.length; start += 500) {
      const batch = await this.songDetails(missing.slice(start, start + 500), cookie);
      for (const song of batch) known.set(song.id, song);
    }
    const songs = ids.flatMap((songId) =>
      known.get(songId) ? [known.get(songId)!] : [],
    );
    if (version !== this.detailsVersion) return this.playlist(id);
    return {
      playlist,
      songs,
      total: ids.length,
      unavailable: ids.length - songs.length,
    };
  }

  private async songDetails(ids: number[], cookie: string): Promise<Song[]> {
    if (!ids.length) return [];
    const body = await this.request(
      "song_detail",
      { ids: ids.join(",") },
      cookie,
    );
    const songs = Array.isArray(body.songs)
      ? body.songs
          .map(normalizeSong)
          .filter((value: Song | null): value is Song => Boolean(value))
      : [];
    const mapped = new Map<number, Song>(
      songs.map((song: Song) => [song.id, song]),
    );
    return ids.flatMap((id) => (mapped.has(id) ? [mapped.get(id)!] : []));
  }

  async likedIds(refresh = false): Promise<number[]> {
    const { cookie, uid } = this.context(true);
    if (!refresh && this.likes && Date.now() - this.likes.time < 60000)
      return [...this.likes.ids];
    if (this.likesRequest) return [...(await this.likesRequest)];
    const task = (async () => {
      let version: number;
      let body: Record<string, any>;
      do {
        version = this.likesVersion;
        body = await this.request("likelist", { uid }, cookie);
      } while (version !== this.likesVersion);
      const ids = Array.isArray(body.ids)
        ? [
            ...new Set<number>(
              body.ids.filter(
                (id: unknown) =>
                  typeof id === "number" && Number.isSafeInteger(id) && id > 0,
              ),
            ),
          ]
        : [];
      this.likes = { ids, time: Date.now() };
      return ids;
    })();
    this.likesRequest = task;
    try {
      return [...(await task)];
    } finally {
      if (this.likesRequest === task) this.likesRequest = null;
    }
  }

  async likedSongs(): Promise<LikedMusic> {
    const { cookie, uid } = this.context(true);
    let playlistId: number | undefined;
    let offset = 0;
    while (!playlistId) {
      const body = await this.request(
        "user_playlist",
        { uid, limit: 1000, offset },
        cookie,
      );
      const playlists: any[] = Array.isArray(body.playlist) ? body.playlist : [];
      const liked = playlists.find(
        (item) =>
          item.specialType === 5 &&
          (item.creator?.userId ?? item.userId) === uid,
      );
      if (liked) {
        positiveId(liked.id);
        playlistId = liked.id;
      } else if (!body.more || !playlists.length) {
        throw new Error("暂时无法找到你的喜欢歌单，请稍后刷新。");
      }
      offset += playlists.length;
    }
    const body = await this.request("playlist_detail", { id: playlistId }, cookie);
    if (!Array.isArray(body.playlist?.trackIds))
      throw new Error("暂时无法读取喜欢歌单的歌曲顺序，请稍后刷新。");
    const ids = [
      ...new Set<number>(
        body.playlist.trackIds
          .map((item: any) => item.id)
          .filter(
            (id: unknown) =>
              typeof id === "number" && Number.isSafeInteger(id) && id > 0,
          ),
      ),
    ];
    const songs: Song[] = [];
    // The upstream song-detail endpoint limits IDs per request. Batch internally;
    // the client receives one complete list and never has to page through favorites.
    for (let start = 0; start < ids.length; start += 500) {
      songs.push(
        ...(await this.songDetails(ids.slice(start, start + 500), cookie)),
      );
    }
    return {
      ids,
      songs,
      total: ids.length,
      unavailable: ids.length - songs.length,
    };
  }

  async setLiked(id: unknown, liked: unknown): Promise<void> {
    positiveId(id);
    if (typeof liked !== "boolean") throw new Error("喜欢状态无效。");
    const { cookie } = this.context(true);
    await this.request("like", { id, like: String(liked) }, cookie);
    this.likesVersion++;
    this.likes = null;
    this.details.clear();
    this.detailsVersion++;
  }

  async lyric(id: unknown): Promise<LyricData> {
    positiveId(id);
    const { cookie } = this.context();
    const body = await this.request("lyric", { id }, cookie);
    return {
      original:
        typeof body.lrc?.lyric === "string"
          ? body.lrc.lyric.slice(0, 300000)
          : "",
      translated:
        typeof body.tlyric?.lyric === "string"
          ? body.tlyric.lyric.slice(0, 300000)
          : "",
      instrumental: body.nolyric === true,
    };
  }

  async roaming(mode: unknown): Promise<Song[]> {
    if (!["DEFAULT", "FAMILIAR", "EXPLORE"].includes(mode as string))
      throw new Error("漫游模式无效。");
    const { cookie } = this.context(true);
    const body = await this.request("personal_fm_mode", { mode, limit: 3 }, cookie);
    if (!Array.isArray(body.data))
      throw new Error("暂时无法获取漫游歌曲，请稍后重试。");
    return body.data
      .map(normalizeSong)
      .filter((song: Song | null): song is Song => song !== null);
  }

  async reduceRecommendation(id: unknown): Promise<void> {
    positiveId(id);
    const { cookie } = this.context(true);
    await this.request("fm_trash", { id }, cookie);
  }

  async search(keywords: unknown, page: unknown): Promise<SongSearch> {
    if (
      typeof keywords !== "string" ||
      !keywords.trim() ||
      keywords.trim().length > 100
    ) {
      throw new Error("请输入 1 到 100 个字符的搜索关键词。");
    }
    if (
      typeof page !== "number" ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1000
    ) {
      throw new Error("搜索页码无效。");
    }
    const body = await this.call("cloudsearch", {
      keywords: keywords.trim(),
      type: 1,
      limit: 30,
      offset: (page - 1) * 30,
      cookie: this.cookie(),
    });
    if (body.code !== 200)
      throw new Error(
        body.code === 301
          ? "搜索需要重新登录，请扫码后重试。"
          : "搜索暂时不可用，请稍后重试。",
      );
    const songs = Array.isArray(body.result?.songs)
      ? body.result.songs
          .map(normalizeSong)
          .filter((song: Song | null): song is Song => song !== null)
      : [];
    const total = Number.isSafeInteger(body.result?.songCount)
      ? Math.max(0, body.result.songCount)
      : songs.length;
    return { songs, total, hasMore: songs.length > 0 && page * 30 < total };
  }

  async source(id: unknown, quality: unknown): Promise<PlaybackSource> {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
      throw new Error("歌曲 ID 无效。");
    if (!isAudioQuality(quality))
      throw new Error("音质选项无效。");
    const body = await this.call("song_url_v1", {
      id: String(id),
      level: quality as AudioQuality,
      unblock: "false",
      cookie: this.cookie(),
    });
    if (body.code !== 200) throw new Error("获取播放地址失败，请稍后重试。");
    const item = Array.isArray(body.data)
      ? body.data.find((entry: any) => Number(entry.id) === id)
      : null;
    const url = secureUrl(item?.url);
    if (!url)
      return {
        url: null,
        level: "",
        trial: false,
        reason: "这首歌曲暂不可播放，可能受账号权限、地区或歌曲可用性限制。",
      };
    return {
      url,
      level: typeof item.level === "string" ? item.level : "",
      trial: Boolean(item.freeTrialInfo && item.freeTrialInfo !== "null"),
      trialStart: Number.isFinite(item.freeTrialInfo?.start)
        ? Math.max(0, item.freeTrialInfo.start)
        : 0,
    };
  }
}

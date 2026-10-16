import { defineStore } from "pinia";
import { computed, onScopeDispose, ref, watch } from "vue";
import type { Playlist, Song } from "../../../shared/contracts";
import { useAccountStore } from "./account";
import { desktop, errorMessage, unwrap } from "../api";

export const useLibraryStore = defineStore("library", () => {
  const account = useAccountStore();
  const playlists = ref<Playlist[]>([]);
  const createdPlaylists = computed(() => playlists.value.filter(item => item.creatorId === account.session.profile?.userId && item.specialType !== 5));
  const savedPlaylists = computed(() => playlists.value.filter(item => item.creatorId !== account.session.profile?.userId));
  const writablePlaylists = computed(() => playlists.value.filter(item => item.creatorId === account.session.profile?.userId));
  const playlistRevision = ref(0);
  const deletedPlaylistId = ref<number | null>(null);
  const playlistPending = ref(new Set<number>());
  const savedOverrides = ref(new Map<number, boolean>());
  const playlistOverrides = new Map<number, Playlist | null>();
  const more = ref(false);
  const loading = ref(false);
  const error = ref("");
  const message = ref("");
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  function showMessage(text: string) {
    clearTimeout(messageTimer);
    message.value = text;
    messageTimer = text ? setTimeout(() => {
      message.value = "";
      messageTimer = undefined;
    }, 2000) : undefined;
  }
  onScopeDispose(() => clearTimeout(messageTimer));
  const likedIds = ref(new Set<number>());
  const pending = ref(new Set<number>());
  const likedSongs = ref<Song[]>([]);
  const likedLoading = ref(false);
  const likedError = ref("");
  const likedTotal = computed(() => likedIds.value.size);
  const likedUnavailable = computed(() =>
    Math.max(0, likedTotal.value - likedSongs.value.length),
  );
  let generation = 0;
  let page = 0;
  let playlistGeneration = 0;
  let playlistMutationVersion = 0;
  let likesLoaded = false;
  let likesVersion = 0;
  let songsLoaded = false;
  let songsRequest: Promise<void> | null = null;

  async function loadPlaylists(reset = false, reconcile = false): Promise<void> {
    if (!account.session.profile || (loading.value && !reset)) return;
    const current = generation;
    const loadGeneration = ++playlistGeneration;
    const mutationVersion = playlistMutationVersion;
    let targetPage = reset ? 1 : page + 1;
    loading.value = true;
    error.value = "";
    try {
      const gathered: Playlist[] = reset ? [] : [...playlists.value];
      let result;
      do {
        result = unwrap(await desktop().music.playlists(targetPage));
        if (current !== generation || loadGeneration !== playlistGeneration) return;
        const before = new Set(gathered.map(item => item.id));
        gathered.push(...result.playlists);
        if (result.more && (!result.playlists.length || result.playlists.every(item => before.has(item.id)))) throw new Error("歌单未能完整加载，请重试。");
        targetPage++;
      } while (result.more && targetPage <= 1000);
      if (result.more) throw new Error("歌单数量过多，暂时无法完整加载。");
      const fetched = [
        ...new Map(
          gathered.map(
            (item) => [item.id, item],
          ),
        ).values(),
      ];
      if (reconcile && mutationVersion === playlistMutationVersion) {
        playlistOverrides.clear();
        savedOverrides.value = new Map();
      }
      playlists.value = fetched.flatMap(item => playlistOverrides.has(item.id) ? (playlistOverrides.get(item.id) ? [{ ...item, subscribed: true }] : []) : [item]);
      for (const [id, item] of playlistOverrides) {
        if (item && !playlists.value.some(value => value.id === id)) playlists.value.push(item);
      }
      more.value = result.more;
      page = targetPage - 1;
    } catch (reason) {
      if (current === generation && loadGeneration === playlistGeneration) error.value = errorMessage(reason);
    } finally {
      if (current === generation && loadGeneration === playlistGeneration) loading.value = false;
    }
  }

  function playlistChanged(id: number, likesChanged = false) {
    playlistMutationVersion++;
    playlistRevision.value++;
    if (likesChanged) {
      likesVersion++;
      songsLoaded = false;
      void loadLikes(generation);
      void loadLikedSongs(true);
    }
    void loadPlaylists(true);
  }
  function upsertPlaylist(playlist: Playlist) {
    playlistMutationVersion++;
    if (playlistOverrides.has(playlist.id)) playlistOverrides.set(playlist.id, playlist);
    const existing = playlists.value.findIndex(item => item.id === playlist.id);
    if (existing < 0) playlists.value = [playlist, ...playlists.value];
    else playlists.value = playlists.value.map(item => item.id === playlist.id ? playlist : item);
  }

  function isPlaylistSaved(playlist: Playlist): boolean {
    return savedOverrides.value.get(playlist.id) ?? (playlists.value.some(item => item.id === playlist.id && item.creatorId !== account.session.profile?.userId) || playlist.subscribed);
  }
  async function mutatePlaylist(playlist: Playlist, saved: boolean | null): Promise<boolean> {
    if (!account.session.authenticated) { showMessage("请先扫码登录，再管理歌单。"); return false; }
    if (playlistPending.value.has(playlist.id)) return false;
    const current = generation;
    playlistPending.value = new Set([...playlistPending.value, playlist.id]);
    playlistMutationVersion++;
    try {
      unwrap(await (saved === null ? desktop().music.deletePlaylist(playlist.id) : desktop().music.setPlaylistSaved(playlist.id, saved)));
      if (current !== generation) return false;
      const updated = saved === true ? { ...playlist, subscribed: true } : null;
      playlistOverrides.set(playlist.id, updated);
      if (updated) upsertPlaylist(updated);
      else playlists.value = playlists.value.filter(item => item.id !== playlist.id);
      if (saved === null) deletedPlaylistId.value = playlist.id;
      else savedOverrides.value = new Map([...savedOverrides.value, [playlist.id, saved]]);
      showMessage(saved === null ? "歌单已删除。" : saved ? "已收藏歌单。" : "已取消收藏歌单。");
      return true;
    } catch (reason) {
      if (current !== generation) return false;
      throw reason;
    } finally {
      if (current === generation) { const next = new Set(playlistPending.value); next.delete(playlist.id); playlistPending.value = next; }
    }
  }
  async function setPlaylistSaved(playlist: Playlist, saved: boolean): Promise<boolean> {
    try { return await mutatePlaylist(playlist, saved); }
    catch (reason) { showMessage(errorMessage(reason)); return false; }
  }
  async function deletePlaylist(playlist: Playlist): Promise<boolean> {
    return mutatePlaylist(playlist, null);
  }

  async function loadLikes(current: number): Promise<boolean> {
    try {
      const version = likesVersion;
      const ids = unwrap(await desktop().music.likedIds());
      if (current !== generation) return false;
      if (version !== likesVersion) return true;
      likedIds.value = new Set(ids);
      likesLoaded = true;
      return true;
    } catch {
      return false;
    }
  }

  function loadLikedSongs(refresh = false): Promise<void> {
    if (songsRequest) { if (refresh) likesVersion++; return songsRequest; }
    if (!account.session.authenticated || (songsLoaded && !refresh))
      return Promise.resolve();
    const current = generation;
    likedLoading.value = true;
    likedError.value = "";
    const task = (async () => {
      try {
        let version: number;
        let result;
        do {
          version = likesVersion;
          result = unwrap(await desktop().music.likedSongs());
          if (current !== generation) return;
        } while (version !== likesVersion);
        if (current !== generation) return;
        likedIds.value = new Set(result.ids);
        likedSongs.value = result.songs;
        likesLoaded = songsLoaded = true;
      } catch (reason) {
        if (current === generation) likedError.value = errorMessage(reason);
      } finally {
        if (current === generation) likedLoading.value = false;
      }
    })();
    songsRequest = task;
    void task.finally(() => {
      if (songsRequest === task) songsRequest = null;
    });
    return task;
  }

  watch(
    () =>
      account.session.authenticated ? account.session.profile?.userId : null,
    (uid) => {
      generation++;
      playlistGeneration++;
      playlists.value = [];
      playlistOverrides.clear();
      savedOverrides.value = new Map();
      playlistPending.value = new Set();
      deletedPlaylistId.value = null;
      likedIds.value = new Set();
      pending.value = new Set();
      loading.value = false;
      more.value = false;
      error.value = "";
      showMessage("");
      page = 0;
      likesLoaded = false;
      likesVersion++;
      likedSongs.value = [];
      likedLoading.value = false;
      likedError.value = "";
      songsLoaded = false;
      songsRequest = null;
      if (uid) {
        void loadPlaylists(true);
        void loadLikes(generation);
      }
    },
    { immediate: true },
  );

  async function toggleLike(song: Song): Promise<void> {
    const id = song.id;
    if (!account.session.authenticated) {
      showMessage("请先扫码登录，再收藏喜欢的音乐。");
      return;
    }
    if (pending.value.has(id)) return;
    const current = generation;
    pending.value = new Set([...pending.value, id]);
    try {
      if (!likesLoaded && !(await loadLikes(current)))
        throw new Error("暂时无法读取收藏状态，请稍后重试。");
      if (current !== generation) return;
      const liked = !likedIds.value.has(id);
      unwrap(await desktop().music.setLiked(id, liked));
      if (current !== generation) return;
      likesVersion++;
      const next = new Set(likedIds.value);
      if (liked) next.add(id);
      else next.delete(id);
      likedIds.value = next;
      const reload = songsLoaded || songsRequest !== null;
      songsLoaded = false;
      showMessage(liked ? "已添加到我喜欢的音乐。" : "已取消喜欢。");
      if (reload) await loadLikedSongs(true);
    } catch (reason) {
      if (current === generation) showMessage(errorMessage(reason));
    } finally {
      if (current === generation) {
        const next = new Set(pending.value);
        next.delete(id);
        pending.value = next;
      }
    }
  }
  return {
    createdPlaylists,
    savedPlaylists,
    writablePlaylists,
    playlistRevision,
    deletedPlaylistId,
    playlistPending,
    isPlaylistSaved,
    setPlaylistSaved,
    deletePlaylist,
    playlistChanged,
    upsertPlaylist,
    showMessage,
    playlists,
    more,
    loading,
    error,
    message,
    likedIds,
    pending,
    likedSongs,
    likedLoading,
    likedError,
    likedTotal,
    likedUnavailable,
    loadLikedSongs,
    loadPlaylists,
    refreshLikes: () => loadLikes(generation),
    toggleLike,
  };
});

import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import type { AudioQuality, RoamingMode, Song } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "./account";
import { useRecentStore } from "./recent";
import { isAudioQuality } from "../../../shared/audio-quality";
import { emptyPlayback, PlaybackEngine } from "../player/engine";
import {
  modes,
  nextIndex,
  uniqueSongs,
  validSong,
  type PlayMode,
} from "../player/queue";

const storageKey = "easy-music:player-v1";
export const usePlayerStore = defineStore("player", () => {
  const account = useAccountStore();
  const recent = useRecentStore();
  const queue = ref<Song[]>([]);
  const history = ref<Song[]>([]);
  let historyReady = false;
  let historyVersion = 0;
  let historyClearVersion = 0;
  let historyWrites: Promise<void> = Promise.resolve();
  function persistHistory(): void {
    const api = window.desktop?.music;
    if (!historyReady || !api || typeof api.saveLocalHistory !== "function") return;
    const snapshot: Song[] = JSON.parse(JSON.stringify(history.value));
    historyWrites = historyWrites.then(async () => {
      const result = await api.saveLocalHistory(snapshot);
      if (!result.ok) throw new Error(result.error);
    }).catch(() => { notice.value = "本地播放记录保存失败，请检查 data 文件夹是否可写。"; });
  }
  async function restoreHistory(): Promise<void> {
    if (typeof window.desktop?.music.localHistory !== "function") return;
    const version = historyVersion;
    const cleared = historyClearVersion;
    try {
      const saved = unwrap(await window.desktop.music.localHistory());
      if (saved !== null && cleared === historyClearVersion) {
        history.value = uniqueSongs(version === historyVersion ? saved : [...history.value, ...saved]).slice(0, 200);
      }
      historyReady = true;
      if (saved === null || version !== historyVersion) persistHistory();
      save();
    } catch { notice.value = "本地播放记录读取失败，已保留原文件，请检查 data 文件夹。"; }
  }
  const mode = ref<PlayMode>("order");
  const quality = ref<AudioQuality>("standard");
  const volume = ref(70);
  const muted = ref(false);
  const state = shallowRef(emptyPlayback());
  const notice = ref("");
  const lyricsOpen = ref(false);
  const isRoaming = ref(false);
  const roamingMode = ref<RoamingMode>("DEFAULT");
  const roamingLoading = ref(false);
  const reducing = ref(false);
  let normalQueue: Song[] = [];
  let roamingOwner: number | null = null;
  let roamingGeneration = 0;
  let roamingRequest: Promise<void> | null = null;
  const canGoPrevious = computed(() =>
    isRoaming.value ? index.value > 0 && !roamingLoading.value : queue.value.length > 0,
  );
  const index = computed(() =>
    queue.value.findIndex((song) => song.id === state.value.song?.id),
  );
  let automatic = false;
  let skipped = new Set<number>();
  let lastSavedPosition = -1;
  let lastSongId: number | undefined;
  let restoringPreferences = true;
  const engine = new PlaybackEngine({
    source: async (id) => {
      if (!window.desktop)
        throw new Error("请在桌面客户端播放音乐，浏览器仅用于界面预览。");
      const result = await window.desktop.music.source(id, quality.value);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    createAudio: () => new Audio(),
    changed: (value) => {
      state.value = value;
      if (
        lastSongId !== value.song?.id ||
        Math.abs(lastSavedPosition - value.position) >= 3 ||
        value.phase === "paused" ||
        value.phase === "error"
      ) {
        lastSongId = value.song?.id;
        lastSavedPosition = value.position;
        save();
      }
    },
    started: (song) => {
      if (isRoaming.value) skipped.clear();
      history.value = [
        song,
        ...history.value.filter((item) => item.id !== song.id),
      ].slice(0, 200);
      historyVersion++;
      persistHistory();
      void recent.recordStarted(song.id);
      save();
    },
    ended: () => {
      automatic = true;
      skipped = new Set();
      advance(1, true);
    },
    unavailable: () => {
      if (!automatic || !state.value.song) return;
      skipped.add(state.value.song.id);
      if (isRoaming.value && skipped.size >= 5) {
        notice.value = "连续多首漫游歌曲不可播放，请稍后重试。";
        return;
      }
      notice.value = "已跳过暂不可播放的歌曲。";
      advance(1, true);
    },
  });

  function save(): void {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          queue: queue.value,
          history: history.value,
          currentId: state.value.song?.id,
          position: state.value.position,
          mode: mode.value,
          quality: quality.value,
          volume: volume.value,
          muted: muted.value,
          isRoaming: isRoaming.value,
          roamingMode: roamingMode.value,
          roamingOwner,
          normalQueue,
        }),
      );
    } catch {
      notice.value = "本地存储空间不足，本次队列可能无法保存。";
    }
  }

  function restore(): void {
    try {
      const raw = localStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : {};
      queue.value = Array.isArray(data.queue) ? uniqueSongs(data.queue) : [];
      isRoaming.value = data.isRoaming === true;
      roamingOwner = Number.isSafeInteger(data.roamingOwner) ? data.roamingOwner : null;
      normalQueue = Array.isArray(data.normalQueue) ? uniqueSongs(data.normalQueue) : [];
      if (["DEFAULT", "FAMILIAR", "EXPLORE"].includes(data.roamingMode))
        roamingMode.value = data.roamingMode;
      history.value = Array.isArray(data.history)
        ? data.history.filter(validSong).slice(0, 200)
        : [];
      if (modes.includes(data.mode)) mode.value = data.mode;
      if (isAudioQuality(data.quality))
        quality.value = data.quality;
      const savedVolume = Number(
        data.volume ?? localStorage.getItem("easy-music:volume") ?? 70,
      );
      volume.value = Number.isFinite(savedVolume)
        ? Math.min(100, Math.max(0, savedVolume))
        : 70;
      muted.value = data.muted === true;
      const song = queue.value.find((song) => song.id === data.currentId);
      if (song)
        engine.restore(
          song,
          Number.isFinite(data.position)
            ? Math.min(song.duration, Math.max(0, data.position))
            : 0,
        );
    } catch {
      notice.value = "保存的播放记录无法读取，已使用空队列启动。";
    }
    engine.setVolume(volume.value / 100, muted.value);
  }

  function enqueue(song: Song): void {
    if (isRoaming.value) {
      normalQueue = uniqueSongs([...normalQueue, song]);
      notice.value = "已加入普通播放队列。";
      save();
      return;
    }
    if (!queue.value.some((item) => item.id === song.id)) {
      queue.value.push(song);
      save();
    }
    notice.value = "已加入播放队列。";
  }

  function enqueueAll(songs: Song[]): void {
    if (isRoaming.value) normalQueue = uniqueSongs([...normalQueue, ...songs]);
    else queue.value = uniqueSongs([...queue.value, ...songs]);
    save();
  }
  function enqueueNext(song: Song): void {
    if (!isRoaming.value && state.value.song?.id === song.id) return;
    const target = isRoaming.value ? [...normalQueue] : [...queue.value];
    const filtered = target.filter(item => item.id !== song.id);
    const current = filtered.findIndex(item => item.id === state.value.song?.id);
    filtered.splice(current < 0 ? 0 : current + 1, 0, song);
    if (isRoaming.value) normalQueue = uniqueSongs(filtered);
    else queue.value = uniqueSongs(filtered);
    save();
  }

  function playSong(song: Song): void {
    leaveRoaming();
    automatic = false;
    skipped = new Set();
    notice.value = "";
    if (!queue.value.some((item) => item.id === song.id)) {
      queue.value.splice(
        index.value < 0 ? queue.value.length : index.value + 1,
        0,
        song,
      );
    }
    void engine.play(song);
  }

  function playAll(songs: Song[]): void {
    const valid = uniqueSongs(songs);
    if (!valid.length) return;
    leaveRoaming();
    queue.value = valid;
    automatic = false;
    skipped = new Set();
    notice.value = "";
    void engine.play(queue.value[0]!);
  }

  async function advance(direction: 1 | -1, fromEnded = false): Promise<void> {
    if (isRoaming.value) {
      if (roamingLoading.value || reducing.value) return;
      const generation = roamingGeneration;
      try {
        if (direction === 1 && index.value >= queue.value.length - 1)
          await fetchRoaming();
        if (generation !== roamingGeneration || !isRoaming.value) return;
        const target = index.value + direction;
        if (target < 0 || target >= queue.value.length) return;
        automatic = true;
        void engine.play(queue.value[target]!);
      } catch (reason) {
        if (generation === roamingGeneration) notice.value = errorMessage(reason);
      }
      return;
    }
    const next = nextIndex(
      queue.value,
      index.value,
      mode.value,
      direction,
      fromEnded,
      skipped,
    );
    if (next === null) {
      if (skipped.size) notice.value = "没有更多可播放歌曲，已停止自动播放。";
      return;
    }
    void engine.play(queue.value[next]!);
  }

  function next(direction: 1 | -1): Promise<void> {
    automatic = false;
    skipped = new Set();
    return advance(direction);
  }
  function toggle(): void {
    automatic = false;
    if (roamingLoading.value || reducing.value) return;
    if (isRoaming.value && !state.value.song) {
      void startRoaming(roamingMode.value);
      return;
    }
    if (!state.value.song) {
      if (queue.value[0]) playSong(queue.value[0]);
      return;
    }
    if (state.value.wantsPlayback) engine.pause();
    else void engine.resume();
  }
  function remove(id: number): void {
    const position = queue.value.findIndex((song) => song.id === id);
    if (position < 0) return;
    const current = state.value.song?.id === id;
    queue.value.splice(position, 1);
    if (current) {
      if (queue.value[position]) playSong(queue.value[position]);
      else engine.stop();
    }
    save();
  }
  function clear(): void {
    leaveRoaming();
    queue.value = [];
    engine.stop();
    save();
  }
  function clearHistory(): void {
    history.value = [];
    historyVersion++; historyClearVersion++;
    persistHistory();
    save();
  }
  function cycleMode(): void {
    if (isRoaming.value) return;
    mode.value = modes[(modes.indexOf(mode.value) + 1) % modes.length]!;
  }

  function leaveRoaming(): void {
    roamingGeneration++;
    roamingRequest = null;
    roamingLoading.value = reducing.value = false;
    if (isRoaming.value) queue.value = normalQueue;
    normalQueue = [];
    roamingOwner = null;
    isRoaming.value = false;
  }

  function fetchRoaming(): Promise<void> {
    if (roamingRequest) return roamingRequest;
    const generation = roamingGeneration;
    roamingLoading.value = true;
    const task = (async () => {
      try {
        const songs = unwrap(await desktop().music.roaming(roamingMode.value));
        if (generation !== roamingGeneration) return;
        const known = new Set(queue.value.map((song) => song.id));
        const fresh = uniqueSongs(songs).filter((song) => !known.has(song.id));
        if (!fresh.length) throw new Error("暂时没有新的漫游歌曲，请稍后点击下一首重试。");
        queue.value.push(...fresh);
        // Keep recent roaming tracks for Previous without growing the queue indefinitely.
        if (queue.value.length > 120 && index.value > 20)
          queue.value.splice(0, Math.min(index.value - 20, queue.value.length - 120));
        save();
      } finally {
        if (generation === roamingGeneration) roamingLoading.value = false;
      }
    })();
    roamingRequest = task;
    void task.then(
      () => { if (roamingRequest === task) roamingRequest = null; },
      () => { if (roamingRequest === task) roamingRequest = null; },
    );
    return task;
  }

  async function startRoaming(selected: RoamingMode = roamingMode.value): Promise<void> {
    lyricsOpen.value = true;
    if (isRoaming.value && selected === roamingMode.value && state.value.song) return;
    if (!account.session.authenticated) {
      notice.value = "请先扫码登录，再开启私人漫游。";
      return;
    }
    if (!isRoaming.value) normalQueue = [...queue.value];
    const generation = ++roamingGeneration;
    roamingRequest = null;
    reducing.value = false;
    isRoaming.value = true;
    roamingOwner = account.session.profile?.userId ?? null;
    roamingMode.value = selected;
    queue.value = [];
    automatic = true;
    skipped = new Set();
    notice.value = "";
    engine.stop();
    try {
      await fetchRoaming();
      if (generation !== roamingGeneration) return;
      void engine.play(queue.value[0]!);
    } catch (reason) {
      if (generation === roamingGeneration) notice.value = errorMessage(reason);
    }
  }

  async function reduceRecommendation(): Promise<void> {
    const song = state.value.song;
    if (!isRoaming.value || !song || reducing.value || roamingLoading.value) return;
    const generation = roamingGeneration;
    reducing.value = true;
    try {
      unwrap(await desktop().music.reduceRecommendation(song.id));
      if (generation !== roamingGeneration) return;
      // Remove the rejected track from the local session, so Previous cannot play it.
      queue.value = queue.value.slice(index.value + 1);
      engine.stop();
      reducing.value = false;
      notice.value = "会减少推荐这首歌，正在为你换一首。";
      skipped = new Set();
      await advance(1);
    } catch (reason) {
      if (generation === roamingGeneration) notice.value = errorMessage(reason);
    } finally {
      if (generation === roamingGeneration) reducing.value = false;
    }
  }

  watch([volume, muted], () => {
    engine.setVolume(Number(volume.value) / 100, muted.value);
    save();
  });
  watch(mode, save);
  watch(quality, () => {
    if (restoringPreferences) return;
    save();
    const current = state.value;
    if (current.song) void engine.play(current.song, current.position, current.wantsPlayback);
  }, { flush: "sync" });
  restore();
  restoringPreferences = false;
  void restoreHistory();
  watch(
    () => account.session.authenticated ? account.session.profile?.userId : null,
    (uid, previous) => {
      if (isRoaming.value && ((previous && previous !== uid) ||
          (uid && roamingOwner && uid !== roamingOwner))) {
        leaveRoaming();
        engine.stop();
        save();
      }
    },
    { flush: "sync" },
  );
  return {
    queue,
    history,
    mode,
    quality,
    volume,
    muted,
    state,
    notice,
    index,
    lyricsOpen,
    isRoaming,
    roamingMode,
    roamingLoading,
    reducing,
    canGoPrevious,
    startRoaming,
    reduceRecommendation,
    playSong,
    playAll,
    enqueue,
    enqueueAll,
    enqueueNext,
    toggle,
    next,
    seek: (position: number) => engine.seek(position),
    remove,
    clear,
    clearHistory,
    cycleMode,
    save,
  };
});

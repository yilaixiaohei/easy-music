import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPinia, disposePinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { LocalHistoryStore } from "../src/main/local-history";
import { MusicController } from "../src/main/music-controller";
import { useAccountStore } from "../src/renderer/src/stores/account";
import { usePlayerStore } from "../src/renderer/src/stores/player";
import { useRecentStore } from "../src/renderer/src/stores/recent";
import { useLibraryStore } from "../src/renderer/src/stores/library";
import { useSyncStore } from "../src/renderer/src/stores/sync";
import type { Song, DesktopApi } from "../src/shared/contracts";
const song = (id: number): Song => ({ id, title: `歌曲${id}`, artists: "歌手", album: "专辑", cover: "", duration: 100 });
const raw = (id: number) => ({ id, name: `歌曲${id}`, ar: [{ id: 1, name: "歌手" }], al: { id: 2, name: "专辑" }, dt: 100000 });
const ok = <T>(data: T) => ({ ok: true as const, data });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); await nextTick(); };

function setup(t: { after(fn: () => void): void }, overrides: Partial<DesktopApi["music"]> = {}, authenticated = true) {
  const keys = ["window", "localStorage", "Audio"] as const;
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const storage = new Map<string, string>();
  const pinia = createPinia(); setActivePinia(pinia);
  const music = {
    playlists: async () => ok({ playlists: [], more: false }), likedIds: async () => ok([]),
    likedSongs: async () => ok({ ids: [], songs: [], total: 0, unavailable: 0 }), savedAlbums: async () => ok([]),
    refreshAccountData: async () => ok(undefined), recentSongs: async () => ok([song(99)]),
    recordPlayback: async () => ok(undefined), source: async () => ok({ url: 'https://example.com/song.mp3', level: 'standard', trial: false }),
    ...overrides,
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { desktop: { music } } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: class extends EventTarget {
    src = ''; currentTime = 0; duration = 100; volume = 1; muted = false; preload = 'auto';
    async play() { this.dispatchEvent(new Event('playing')); } pause() { this.dispatchEvent(new Event('pause')); } load() {} removeAttribute() {}
  } });
  const account = useAccountStore();
  if (authenticated) account.session = { authenticated: true, profile: { userId: 123, nickname: "测试", avatarUrl: "" } };
  t.after(() => { disposePinia(pinia); keys.forEach((key, i) => { if (previous[i]) Object.defineProperty(globalThis, key, previous[i]!); else Reflect.deleteProperty(globalThis, key); }); });
  return { account, music, storage, pinia };
}

test("独立本地历史文件可跨实例恢复和清空，拒绝无效数据且保留损坏原文件", t => {
  const directory = mkdtempSync(join(tmpdir(), 'easy-music-history-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new LocalHistoryStore(directory);
  assert.equal(store.read(), null);
  store.write([song(1), song(2)]);
  assert.deepEqual(new LocalHistoryStore(directory).read()?.map(item => item.id), [1, 2]);
  assert.throws(() => store.write([{ ...song(1), id: -1 }]));
  assert.equal(store.read()?.length, 2);
  store.write([]);
  assert.deepEqual(new LocalHistoryStore(directory).read(), []);
  writeFileSync(join(directory, 'local-history.json'), 'broken');
  assert.throws(() => store.read(), /原文件已保留/);
  assert.equal(readFileSync(join(directory, 'local-history.json'), 'utf8'), 'broken');
});

test("本地历史在浏览器存储写入失败时仍持久化，重新创建播放器后能恢复", async t => {
  let durable: Song[] | null = null;
  const { storage } = setup(t, {
    localHistory: async () => ok(durable),
    saveLocalHistory: async value => { durable = structuredClone(value); return ok(undefined); },
  }, false);
  storage.set('easy-music:player-v1', JSON.stringify({ history: [song(1)], queue: [] }));
  const player = usePlayerStore(); await flush();
  assert.equal(durable?.[0]?.id, 1);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => { throw new Error('quota'); } } });
  player.playSong(song(2)); await flush();
  assert.deepEqual(durable?.map(item => item.id), [2, 1]);
  const second = createPinia(); setActivePinia(second);
  const restarted = usePlayerStore(); await flush();
  assert.deepEqual(restarted.history.map(item => item.id), [2, 1]);
  restarted.clearHistory(); await flush();
  assert.deepEqual(durable, []);
  player.clear(); disposePinia(second);
});

test("读取本地历史期间新播放不会丢失，清空后迟到读取不得恢复旧记录", async t => {
  const reply = deferred<any>();
  let durable: Song[] = [];
  setup(t, { localHistory: () => reply.promise, saveLocalHistory: async value => { durable = value; return ok(undefined); } }, false);
  const player = usePlayerStore();
  player.playSong(song(2)); await flush();
  reply.resolve(ok([song(1)])); await flush();
  assert.deepEqual(player.history.map(item => item.id), [2, 1]);
  assert.deepEqual(durable.map(item => item.id), [2, 1]);
  player.clear();
});

test("账号最近播放读取服务器顺序并去重，未登录和账号变化拒绝云记录", async () => {
  let cookie = 'first';
  const controller = new MusicController(async method => {
    assert.equal(method, 'record_recent_song');
    return { code: 200, data: { list: [{ data: raw(2) }, { data: raw(1) }, { data: raw(2) }, { data: {} }] } };
  }, () => cookie, () => 123);
  assert.deepEqual((await controller.recentSongs()).map(item => item.id), [2, 1]);
  cookie = '';
  await assert.rejects(controller.recentSongs(), /扫码登录/);
});

test("清空本地记录后迟到的磁盘响应不得恢复旧历史", async t => {
  const reply = deferred<any>();
  let durable: Song[] | null = null;
  setup(t, { localHistory: () => reply.promise, saveLocalHistory: async value => { durable = value; return ok(undefined); } }, false);
  const player = usePlayerStore();
  player.clearHistory();
  reply.resolve(ok([song(1)])); await flush();
  assert.deepEqual(player.history, []);
  assert.deepEqual(durable, []);
});

test("自动刷新显式丢弃主进程缓存；播放上报只提交有效歌曲 ID", async () => {
  let liked = 1;
  const writes: any[] = [];
  const controller = new MusicController(async (method, params) => {
    if (method === 'likelist') return { code: 200, ids: [liked] };
    if (method === 'record_playback_start') { writes.push(params); return { code: 200 }; }
    throw new Error('unexpected method');
  }, () => 'cookie', () => 123);
  assert.deepEqual(await controller.likedIds(), [1]);
  liked = 2;
  assert.deepEqual(await controller.likedIds(), [1]);
  controller.refreshAccountData();
  assert.deepEqual(await controller.likedIds(), [2]);
  await controller.recordPlayback(9);
  assert.deepEqual(writes, [{ id: 9, cookie: 'cookie' }]);
  await assert.rejects(controller.recordPlayback(-1));
});

test("账号云历史失败不冒充本地记录，退出账号清空且丢弃迟到结果", async t => {
  const reply = deferred<any>();
  const { account } = setup(t, { recentSongs: () => reply.promise });
  const recent = useRecentStore();
  const loading = recent.load(true);
  account.session = { authenticated: false, profile: null };
  reply.resolve(ok([song(9)])); await loading;
  assert.deepEqual(recent.songs, []);
  account.session = { authenticated: true, profile: { userId: 456, nickname: '另一个账号', avatarUrl: '' } };
  window.desktop!.music.recentSongs = async () => ({ ok: false, error: '网络失败' });
  await recent.load(true);
  assert.deepEqual(recent.songs, []);
  assert.equal(recent.error, '网络失败');
});

test("账号播放上报只发生在音频实际开始后，失败不阻止播放；游客不上传", async t => {
  let reports = 0;
  const { account } = setup(t, { recordPlayback: async () => { reports++; return { ok: false, error: 'network' }; } });
  const player = usePlayerStore();
  player.enqueue(song(1)); await flush(); assert.equal(reports, 0);
  player.playSong(song(1)); await flush(); assert.equal(reports, 1);
  assert.equal(player.state.phase, 'playing');
  account.session = { authenticated: false, profile: null };
  player.playSong(song(2)); await flush(); assert.equal(reports, 1);
  player.clear();
});

test("窗口同步合并重复事件并节流，切换账号丢弃旧同步", async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  let calls = 0;
  const reply = deferred<any>();
  const { account } = setup(t, { refreshAccountData: async () => { calls++; return reply.promise; } });
  const sync = useSyncStore();
  const first = sync.refresh('page');
  const second = sync.refresh('focus');
  assert.equal(calls, 1);
  reply.resolve(ok(undefined)); await Promise.all([first, second]);
  await sync.refresh('focus'); assert.equal(calls, 1);
  t.mock.timers.tick(30001); await sync.refresh('focus'); assert.equal(calls, 2);
  const revision = sync.revision;
  const old = deferred<any>();
  window.desktop!.music.refreshAccountData = () => old.promise;
  t.mock.timers.tick(30001);
  const syncing = sync.refresh('focus');
  account.session = { authenticated: false, profile: null };
  old.resolve(ok(undefined)); await syncing;
  assert.equal(sync.revision, revision);
});

test("主动同步能清理本地收藏覆盖，但同步期间的新写入保持优先", async t => {
  const target = { id: 9, name: '歌单', creatorId: 999, creator: '歌手', cover: '', description: '', trackCount: 0, subscribed: true };
  const { music } = setup(t, { playlists: async () => ok({ playlists: [target], more: false }), setPlaylistSaved: async () => ok(undefined) });
  const library = useLibraryStore(); await library.loadPlaylists(true);
  await library.setPlaylistSaved(target, false);
  assert.equal(library.isPlaylistSaved(target), false);
  await library.loadPlaylists(true, true);
  assert.equal(library.isPlaylistSaved(target), true);
  const reply = deferred<any>();
  music.playlists = () => reply.promise;
  const loading = library.loadPlaylists(true, true);
  await library.setPlaylistSaved(target, false);
  reply.resolve(ok({ playlists: [target], more: false })); await loading;
  assert.equal(library.isPlaylistSaved(target), false);
  assert.equal(library.savedPlaylists.length, 0);
});

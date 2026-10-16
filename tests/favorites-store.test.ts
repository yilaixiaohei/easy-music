import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, disposePinia, setActivePinia } from "pinia";
import { nextTick, reactive } from "vue";
import { useAccountStore } from "../src/renderer/src/stores/account";
import { useLibraryStore } from "../src/renderer/src/stores/library";
import { useAlbumsStore } from "../src/renderer/src/stores/albums";
import { usePlaylistActionsStore } from "../src/renderer/src/stores/playlist-actions";
import { usePlayerStore } from "../src/renderer/src/stores/player";
import type { DesktopApi, Song } from "../src/shared/contracts";
import type { Album } from "../src/shared/contracts";

const song = (id: number): Song => ({
  id,
  title: `歌曲${id}`,
  artists: "歌手",
  album: "专辑",
  cover: "",
  duration: 100,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const ok = <T>(data: T) => ({ ok: true as const, data });

const playlistFixture = (id: number, own = false) => ({ id, creatorId: own ? 123 : 999, name: `歌单${id}`, cover: '', description: '', trackCount: 0, creator: '测试', subscribed: !own });

test("收藏新歌单后可立即显示在侧栏，过时列表不能覆盖；删除失败保留原歌单", async (context) => {
  const target = { ...playlistFixture(9), subscribed: false };
  const own = playlistFixture(10, true);
  const { library } = setup(context, {
    playlists: async () => ok({ playlists: [own], more: false }),
    setPlaylistSaved: async () => ok(undefined),
    deletePlaylist: async () => ({ ok: false, error: '删除失败' }),
  });
  await nextTick(); await library.loadPlaylists(true);
  assert.equal(await library.setPlaylistSaved(target, true), true);
  await library.loadPlaylists(true);
  assert.equal(library.isPlaylistSaved(target), true);
  assert.equal(library.savedPlaylists[0].id, 9);
  const actions = usePlaylistActionsStore();
  actions.openRemovePlaylist(own);
  await actions.removePlaylist();
  assert.equal(actions.error, '删除失败');
  assert.equal(actions.dialog, 'remove-playlist');
  assert.equal(library.createdPlaylists[0].id, 10);
  assert.equal(library.deletedPlaylistId, null);
});

test("歌单取消收藏成功同步侧栏和详情，旧刷新不能恢复已移除歌单", async (context) => {
  const target = playlistFixture(9);
  let stale = false;
  const reply = deferred<any>();
  const { library } = setup(context, {
    playlists: async () => stale ? reply.promise : ok({ playlists: [target], more: false }),
    setPlaylistSaved: async () => ok(undefined),
  });
  await nextTick(); await library.loadPlaylists(true);
  stale = true;
  const refreshing = library.loadPlaylists(true);
  assert.equal(await library.setPlaylistSaved(target, false), true);
  assert.equal(library.isPlaylistSaved(target), false);
  reply.resolve(ok({ playlists: [target], more: false }));
  await refreshing;
  assert.equal(library.savedPlaylists.length, 0);
});

test("歌单收藏防止重复写入，失败保留原状态", async (context) => {
  const target = playlistFixture(9);
  const reply = deferred<any>();
  let writes = 0;
  const { library } = setup(context, {
    playlists: async () => ok({ playlists: [target], more: false }),
    setPlaylistSaved: async () => { writes++; return reply.promise; },
  });
  await nextTick(); await library.loadPlaylists(true);
  const saving = library.setPlaylistSaved(target, false);
  await library.setPlaylistSaved(target, false);
  assert.equal(writes, 1);
  reply.resolve({ ok: false, error: '网络失败' });
  assert.equal(await saving, false);
  assert.equal(library.savedPlaylists.length, 1);
  assert.equal(library.isPlaylistSaved(target), true);
  assert.equal(library.message, '网络失败');
});

test("删除歌单必须经过确认动作，成功移除列表并通知详情页", async (context) => {
  const target = playlistFixture(9, true);
  let writes = 0;
  const { library } = setup(context, {
    playlists: async () => ok({ playlists: [target], more: false }),
    deletePlaylist: async () => { writes++; return ok(undefined); },
  });
  await nextTick(); await library.loadPlaylists(true);
  const actions = usePlaylistActionsStore();
  actions.openRemovePlaylist(target);
  assert.equal(actions.dialog, 'remove-playlist');
  assert.equal(writes, 0);
  await actions.removePlaylist();
  assert.equal(writes, 1);
  assert.equal(library.createdPlaylists.length, 0);
  assert.equal(library.deletedPlaylistId, 9);
  assert.equal(actions.dialog, null);
});

test("收藏歌单右键删除执行取消收藏，退出后迟到失败不污染新账号", async (context) => {
  const target = playlistFixture(9);
  const reply = deferred<any>();
  const { account, library } = setup(context, {
    setPlaylistSaved: async (id, saved) => { assert.equal(id, 9); assert.equal(saved, false); return reply.promise; },
    deletePlaylist: async () => { throw new Error('must not delete others playlist'); },
  });
  await nextTick();
  const actions = usePlaylistActionsStore();
  actions.openRemovePlaylist(target);
  const removing = actions.removePlaylist();
  account.session = { authenticated: false, profile: null };
  await nextTick();
  reply.resolve({ ok: false, error: '旧账号请求失败' });
  await removing;
  assert.equal(library.message, '');
  assert.equal(library.deletedPlaylistId, null);
  assert.equal(actions.dialog, null);
});

function setup(
  context: { after(fn: () => void): void },
  overrides: Partial<DesktopApi["music"]> = {},
) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      desktop: {
        music: {
          playlists: async () => ok({ playlists: [], more: false }),
          likedIds: async () => ok([1]),
          likedSongs: async () =>
            ok({ ids: [1], songs: [song(1)], total: 1, unavailable: 0 }),
          setLiked: async () => ok(undefined),
          source: async () => ok({ url: null, level: "", trial: false }),
          ...overrides,
        },
      },
    },
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  context.after(() => {
    disposePinia(pinia);
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousStorage)
      Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  const account = useAccountStore();
  account.session = {
    authenticated: true,
    profile: { userId: 123, nickname: "测试", avatarUrl: "" },
  };
  return { account, library: useLibraryStore(), data };
}

test("收藏后丢弃旧快照并重新读取歌单顺序，刷新不会把新收藏置顶", async (context) => {
  const response = deferred<any>();
  let requests = 0;
  const { library } = setup(context, {
    likedSongs: async () => ++requests === 1 ? response.promise :
      ok({ ids: [1, 2], songs: [song(1), song(2)], total: 2, unavailable: 0 }),
  });
  const loading = library.loadLikedSongs();
  const liking = library.toggleLike(song(2));
  await nextTick();
  response.resolve(
    ok({ ids: [1], songs: [song(1)], total: 1, unavailable: 0 }),
  );
  await Promise.all([loading, liking]);
  assert.deepEqual(
    library.likedSongs.map((song) => song.id),
    [1, 2],
  );
  await library.loadLikedSongs(true);
  assert.deepEqual(
    library.likedSongs.map((song) => song.id),
    [1, 2],
  );
  assert.equal(library.likedTotal, 2);
});

test("取消喜欢时从列表和计数同步移除；写入失败时不提交本地变化", async (context) => {
  let fail = false;
  let ids = [1];
  const { library } = setup(context, {
    setLiked: async () => {
      if (fail) return { ok: false, error: "失败" };
      ids = [];
      return ok(undefined);
    },
    likedSongs: async () => ok({ ids, songs: ids.map(song), total: ids.length, unavailable: 0 }),
  });
  await library.loadLikedSongs();
  fail = true;
  await library.toggleLike(song(1));
  assert.equal(library.likedIds.has(1), true);
  assert.equal(library.likedSongs.length, 1);
  fail = false;
  await library.toggleLike(song(1));
  assert.equal(library.likedIds.has(1), false);
  assert.equal(library.likedSongs.length, 0);
  assert.equal(library.likedTotal, 0);
});

test("退出账号后迟到的完整列表不能恢复已清除的个人数据", async (context) => {
  const response = deferred<any>();
  const { account, library } = setup(context, {
    likedSongs: async () => response.promise,
  });
  const loading = library.loadLikedSongs();
  account.session = { authenticated: false, profile: null };
  await nextTick();
  response.resolve(
    ok({ ids: [1], songs: [song(1)], total: 1, unavailable: 0 }),
  );
  await loading;
  assert.equal(library.likedTotal, 0);
  assert.equal(library.likedSongs.length, 0);
});

test("播放全部和保存队列不再截断超过 500 首的收藏", async (context) => {
  const { data } = setup(context);
  const player = usePlayerStore();
  const songs = Array.from({ length: 1207 }, (_, index) => song(index + 1));
  player.playAll(songs);
  await nextTick();
  assert.equal(player.queue.length, 1207);
  assert.equal(player.queue.at(-1)?.id, 1207);
  assert.equal(
    JSON.parse(data.get("easy-music:player-v1")!).queue.length,
    1207,
  );
});

test("专辑收藏成功才更新列表；重复操作合并；失败保留收藏状态", async (context) => {
  const album: Album = { id: 7, name: '专辑', cover: '', artists: [], size: 3, publishTime: 0 };
  let writes = 0;
  let fail = false;
  const { library } = setup(context, {
    savedAlbums: async () => ok([]),
    setAlbumSaved: async () => { writes++; return fail ? { ok: false, error: '收藏失败' } : ok(undefined); },
  });
  const saved = useAlbumsStore();
  await Promise.all([saved.toggle(album), saved.toggle(album)]);
  assert.equal(writes, 1);
  assert.equal(saved.isSaved(7), true);
  assert.equal(library.message, '已收藏专辑。');
  fail = true;
  await saved.toggle(album);
  assert.equal(saved.isSaved(7), true);
  assert.equal(library.message, '收藏失败');
  fail = false;
  await saved.toggle(album);
  assert.equal(saved.albums.length, 0);
});

test("退出账号后迟到的专辑列表或收藏写入不能恢复个人数据", async (context) => {
  const album: Album = { id: 7, name: '专辑', cover: '', artists: [], size: 3, publishTime: 0 };
  const read = deferred<ReturnType<typeof ok<Album[]>>>();
  const { account } = setup(context, { savedAlbums: () => read.promise });
  const saved = useAlbumsStore();
  const task = saved.load();
  account.session = { authenticated: false, profile: null };
  await nextTick();
  read.resolve(ok([album]));
  await task;
  assert.equal(saved.albums.length, 0);
  assert.equal(saved.loaded, false);
});

test("专辑刷新旧快照不能覆盖同时成功的收藏操作", async (context) => {
  const album: Album = { id: 7, name: '专辑', cover: '', artists: [], size: 3, publishTime: 0 };
  const old = deferred<ReturnType<typeof ok<Album[]>>>();
  let reads = 0;
  const { library } = setup(context, { savedAlbums: async () => { reads++; return reads === 2 ? old.promise : ok(reads === 1 ? [] : [album]); }, setAlbumSaved: async () => ok(undefined) });
  const saved = useAlbumsStore();
  await saved.load();
  const refresh = saved.load(true);
  await saved.toggle(album);
  old.resolve(ok([]));
  await refresh;
  assert.equal(saved.isSaved(7), true);
  assert.equal(reads, 3);
  assert.equal(library.message, '已收藏专辑。');
});

test("侧栏取齐用户歌单后区分创建和收藏，喜欢歌单只保留在可写目标列表", async (context) => {
  const playlist = (id: number, creatorId: number, specialType = 0) => ({ id, creatorId, specialType, name: `歌单${id}`, cover: '', description: '', trackCount: 0, creator: '测试', subscribed: creatorId !== 123 });
  const { library } = setup(context, { playlists: async page => ok({ playlists: page === 1 ? [playlist(1, 123, 5), playlist(2, 123)] : [playlist(3, 999)], more: page === 1 }) });
  await library.loadPlaylists(true);
  assert.deepEqual(library.createdPlaylists.map(item => item.id), [2]);
  assert.deepEqual(library.savedPlaylists.map(item => item.id), [3]);
  assert.deepEqual(library.writablePlaylists.map(item => item.id), [1, 2]);
  assert.equal(library.more, false);
});

test("收藏到歌单去重并防止重复提交；失败保留弹窗，成功后刷新并关闭", async (context) => {
  const target = { id: 9, creatorId: 123, name: '目标歌单', cover: '', description: '', trackCount: 0, creator: '测试', subscribed: false };
  const reply = deferred<any>();
  let writes = 0;
  const { library } = setup(context, { changePlaylistSongs: async (id, ids, operation) => { writes++; assert.equal(id, 9); assert.deepEqual(ids, [1, 2]); assert.equal(operation, 'add'); return reply.promise; } });
  const actions = usePlaylistActionsStore();
  actions.openAdd([song(1), song(1), song(2)]);
  const writing = actions.addTo(target);
  await actions.addTo(target);
  assert.equal(writes, 1);
  actions.close();
  assert.equal(actions.dialog, 'add');
  reply.resolve({ ok: false, error: '网络失败' });
  await writing;
  assert.equal(actions.dialog, 'add');
  assert.equal(actions.error, '网络失败');
  assert.equal(actions.busy, false);
  assert.equal(library.message, '');
});

test("创建后收藏失败回到已有新歌单的选择窗口，重试不会再次创建", async (context) => {
  const created = { id: 9, creatorId: 123, name: '新歌单', cover: '', description: '', trackCount: 0, creator: '测试', subscribed: false };
  let creates = 0;
  let exists = false;
  setup(context, {
    playlists: async () => ok({ playlists: exists ? [created] : [], more: false }),
    createPlaylist: async () => { creates++; exists = true; return ok(created); },
    changePlaylistSongs: async () => ({ ok: false, error: '添加失败' }),
  });
  const actions = usePlaylistActionsStore();
  actions.openAdd([song(1)]);
  actions.openCreate(true);
  await actions.create('新歌单', true);
  assert.equal(creates, 1);
  assert.equal(actions.dialog, 'add');
  assert.equal(actions.error, '添加失败');
  await actions.addTo(created);
  assert.equal(creates, 1);
});

test("切换账号会关闭歌单弹窗，旧写入响应不能影响新账号", async (context) => {
  const target = { id: 9, creatorId: 123, name: '目标歌单', cover: '', description: '', trackCount: 0, creator: '测试', subscribed: false };
  const reply = deferred<any>();
  const { account, library } = setup(context, { changePlaylistSongs: () => reply.promise });
  const actions = usePlaylistActionsStore();
  actions.openDelete([song(1)], target);
  const writing = actions.removeSongs();
  account.session = { authenticated: false, profile: null };
  await nextTick();
  reply.resolve(ok(undefined));
  await writing;
  assert.equal(actions.dialog, null);
  assert.equal(actions.busy, false);
  assert.equal(library.message, '');
});

test("批量加入队列和下一首播放保持去重与顺序，不会触发播放", (context) => {
  setup(context);
  const player = usePlayerStore();
  player.enqueueAll([song(1), song(2), song(2), song(3)]);
  player.enqueueNext(song(3));
  assert.deepEqual(player.queue.map(item => item.id), [3, 1, 2]);
  assert.equal(player.state.wantsPlayback, false);
});

test("编辑歌单在通信前转换响应式表单，空标签和已选标签均可结构化克隆", async (context) => {
  const target = { id: 9, creatorId: 123, name: '旧名称', cover: '', description: '', trackCount: 0, creator: '测试', subscribed: false };
  const sent: unknown[] = [];
  const { library } = setup(context, {
    updatePlaylist: async (id, value) => {
      assert.equal(id, 9);
      sent.push(structuredClone(value));
      return ok(undefined);
    },
  });
  const actions = usePlaylistActionsStore();
  for (const tags of [[], ['华语', '流行']]) {
    actions.openEdit(target);
    const form = reactive({ name: '新名称', description: '简介\n第二行', tags });
    await actions.saveEdit(form);
    assert.equal(actions.error, '');
    assert.equal(actions.dialog, null);
    assert.equal(library.message, '歌单信息已保存。');
  }
  assert.deepEqual(sent, [
    { name: '新名称', description: '简介\n第二行', tags: [] },
    { name: '新名称', description: '简介\n第二行', tags: ['华语', '流行'] },
  ]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { MusicController } from "../src/main/music-controller";

const rawSong = (id: number) => ({ id, name: `歌曲${id}`, ar: [{ id: 9, name: "歌手" }], al: { id: 7, name: "专辑" } });
const rawAlbum = (id: number) => ({ id, name: `专辑${id}`, picUrl: "http://p1.music.126.net/a.jpg", artists: [{ id: 9, name: "歌手" }], size: 3 });

test("四类搜索使用正确类型，过滤异常项并保留翻页信息", async () => {
  const calls: number[] = [];
  const controller = new MusicController(async (_method, params) => {
    calls.push(params.type as number);
    assert.equal(params.offset, 30);
    return { code: 200, result: { songs: [rawSong(1), null], playlists: [{ id: 2, name: "歌单" }], albums: [rawAlbum(7)], artists: [{ id: 9, name: "歌手", picUrl: "file:///secret" }], songCount: 90, playlistCount: 90, albumCount: 90, artistCount: 90 } };
  }, () => "");
  for (const kind of ["songs", "playlists", "albums", "artists"] as const) {
    const result = await controller.searchCatalog("歌手", 2, kind);
    assert.equal(result[kind].length, 1);
    assert.equal(result.total, 90);
    assert.equal(result.hasMore, true);
    if (kind === "songs") { assert.equal(result.songs[0].albumId, 7); assert.deepEqual(result.songs[0].artistRefs, [{ id: 9, name: "歌手" }]); }
    if (kind === "artists") assert.equal(result.artists[0].cover, "");
  }
  assert.deepEqual(calls, [1, 1000, 10, 100]);
  await assert.rejects(controller.searchCatalog("歌", 1, "__proto__"));
  await assert.rejects(controller.searchCatalog("歌", 0, "songs"));
  await assert.rejects(controller.artist(-1));
  assert.equal(calls.length, 4);
});

test("歌手热门歌曲只展示50首，全部歌曲在内部翻页取齐并保持服务端顺序", async () => {
  const songs = Array.from({ length: 205 }, (_, i) => rawSong(i + 1));
  const offsets: number[] = [];
  const controller = new MusicController(async (method, params) => {
    if (method === "artists") return { code: 200, artist: { id: 9, name: "歌手", musicSize: 205 }, hotSongs: songs.slice(0, 60) };
    assert.equal(method, "artist_songs");
    assert.equal(params.order, "hot");
    offsets.push(params.offset as number);
    return { code: 200, total: 205, songs: songs.slice(params.offset as number, (params.offset as number) + 100) };
  }, () => "");
  assert.equal((await controller.artist(9)).songs.length, 50);
  assert.deepEqual((await controller.artistSongs(9)).map(s => s.id), songs.map(s => s.id));
  assert.deepEqual(offsets, [0, 100, 200]);
});

test("歌手专辑与收藏专辑取齐所有页，专辑详情补全歌曲跳转信息", async () => {
  const albums = Array.from({ length: 103 }, (_, i) => rawAlbum(i + 1));
  const calls: string[] = [];
  const controller = new MusicController(async (method, params) => {
    calls.push(method);
    if (method === "album") return { code: 200, album: { ...rawAlbum(7), description: "简介" }, songs: [{ id: 1, name: "歌曲", dt: 1000 }] };
    const offset = params.offset as number;
    return { code: 200, more: offset === 0, [method === "artist_album" ? "hotAlbums" : "data"]: albums.slice(offset, offset + 100) };
  }, () => "cookie", () => 123);
  assert.equal((await controller.artistAlbums(9)).length, 103);
  assert.equal((await controller.savedAlbums()).length, 103);
  const album = await controller.album(7);
  assert.equal(album.songs[0].albumId, 7);
  assert.deepEqual(album.songs[0].artistRefs, [{ id: 9, name: "歌手" }]);
  assert.equal(album.songs[0].cover, "https://p1.music.126.net/a.jpg");
  assert.equal(album.description, "简介");
  assert.deepEqual(calls, ["artist_album", "artist_album", "album_sublist", "album_sublist", "album"]);
});

test("列表中途失败或上游重复返回同一页时不冒充完整结果", async () => {
  const batch = Array.from({ length: 100 }, (_, i) => rawSong(i + 1));
  const controller = new MusicController(async () => ({ code: 200, more: true, songs: batch }), () => "");
  await assert.rejects(controller.artistSongs(9), /完整加载/);
  const broken = new MusicController(async (_method, params) => {
    if (params.offset === 100) throw new Error("network");
    return { code: 200, more: true, data: batch.map(s => rawAlbum(s.id)) };
  }, () => "cookie", () => 123);
  await assert.rejects(broken.savedAlbums(), /network/);
});

test("专辑收藏校验登录与布尔参数；请求中切换账号则丢弃旧结果", async () => {
  let calls = 0;
  const anonymous = new MusicController(async () => { calls++; return { code: 200 }; }, () => "");
  await assert.rejects(anonymous.setAlbumSaved(7, true));
  await assert.rejects(anonymous.savedAlbums());
  assert.equal(calls, 0);
  const toggles: unknown[] = [];
  const controller = new MusicController(async (method, params) => { assert.equal(method, "album_sub"); toggles.push(params.t); return { code: 200 }; }, () => "cookie", () => 123);
  await controller.setAlbumSaved(7, true);
  await controller.setAlbumSaved(7, false);
  await assert.rejects(controller.setAlbumSaved(7, "true"));
  assert.deepEqual(toggles, [1, 2]);
  let cookie = "old";
  const stale = new MusicController(async () => { cookie = "new"; return { code: 200, data: [] }; }, () => cookie, () => 123);
  await assert.rejects(stale.savedAlbums(), /账号状态已变化/);
});

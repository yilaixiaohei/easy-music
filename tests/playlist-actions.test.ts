import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { MusicController, normalizePlaylist } from "../src/main/music-controller";
const require = createRequire(import.meta.url);
const raw = (id = 9, owner = 123, specialType = 0) => ({ id, name: "我的歌单", creator: { userId: owner }, specialType, trackCount: 0, trackIds: [], tracks: [], tags: [] });

test("删除歌单重新验证所有者，保护喜欢歌单，拒绝未登录和无效参数", async () => {
  let owner = 999;
  let specialType = 0;
  const writes: any[] = [];
  const controller = new MusicController(async (method, params) => {
    if (method === "playlist_detail") return { code: 200, playlist: raw(9, owner, specialType) };
    writes.push({ method, params }); return { code: 200 };
  }, () => "cookie", () => 123);
  await assert.rejects(controller.deletePlaylist(9), /自己创建/);
  owner = 123; specialType = 5;
  await assert.rejects(controller.deletePlaylist(9), /不能删除/);
  specialType = 0;
  await controller.deletePlaylist(9);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "playlist_delete");
  assert.equal(writes[0].params.id, 9);
  await assert.rejects(controller.deletePlaylist(-1));
  const guest = new MusicController(async () => { throw new Error("must not call"); }, () => "");
  await assert.rejects(guest.deletePlaylist(9), /扫码登录/);
});

test("收藏与取消收藏仅修改他人歌单，调用对应订阅操作并清理详情缓存", async () => {
  let owner = 999;
  let subscribed = false;
  const writes: any[] = [];
  const controller = new MusicController(async (method, params) => {
    if (method === "playlist_detail") return { code: 200, playlist: { ...raw(9, owner), subscribed } };
    writes.push({ method, params }); subscribed = params?.t === 1; return { code: 200 };
  }, () => "cookie", () => 123);
  assert.equal((await controller.playlist(9)).playlist.subscribed, false);
  await controller.setPlaylistSaved(9, true);
  assert.equal((await controller.playlist(9)).playlist.subscribed, true);
  await controller.setPlaylistSaved(9, false);
  assert.deepEqual(writes.map(item => [item.method, item.params.t]), [["playlist_subscribe", 1], ["playlist_subscribe", 2]]);
  owner = 123;
  await assert.rejects(controller.setPlaylistSaved(9, true), /无需收藏/);
  await assert.rejects(controller.setPlaylistSaved(9, "true"));
  assert.equal(writes.length, 2);
});

test("账号在所有权检查期间变化时不得提交删除或收藏", async () => {
  let cookie = "first";
  let reply!: (body: any) => void;
  const methods: string[] = [];
  const controller = new MusicController(async (method) => {
    methods.push(method);
    return new Promise(resolve => { reply = resolve; });
  }, () => cookie, () => 123);
  const pending = controller.deletePlaylist(9);
  cookie = "second";
  reply({ code: 200, playlist: raw() });
  await assert.rejects(pending, /账号状态已变化/);
  assert.deepEqual(methods, ["playlist_detail"]);
});

test("收藏状态已由官方客户端更新时不再重复提交", async () => {
  let writes = 0;
  for (const saved of [true, false]) {
    const controller = new MusicController(async method => {
      if (method === "playlist_detail") return { code: 200, playlist: { ...raw(9, 999), subscribed: saved } };
      writes++; return { code: 200 };
    }, () => "cookie", () => 123);
    await controller.setPlaylistSaved(9, saved);
  }
  assert.equal(writes, 0);
});

test("收藏错误后回读确认已提交，只报告成功而不重发写请求", async () => {
  for (const saved of [true, false]) {
    const methods: string[] = [];
    let reads = 0;
    const controller = new MusicController(async method => {
      methods.push(method);
      if (method === "playlist_detail") return { code: 200, playlist: { ...raw(9, 999), subscribed: ++reads === 1 ? !saved : saved } };
      throw new Error("网易云操作频繁");
    }, () => "cookie", () => 123);
    await controller.setPlaylistSaved(9, saved);
    assert.deepEqual(methods, ["playlist_detail", "playlist_subscribe", "playlist_detail"]);
  }
});

test("回读未确认目标状态时保留原错误，不把风控拒绝冒充成功", async () => {
  for (const mode of ["unchanged", "missing", "unavailable"]) {
    const original = new Error("网易云操作频繁");
    let reads = 0;
    let writes = 0;
    const controller = new MusicController(async method => {
      if (method === "playlist_detail") {
        if (++reads > 1 && mode === "unavailable") throw new Error("读回失败");
        return { code: 200, playlist: { ...raw(9, 999), ...(mode === "missing" && reads > 1 ? {} : { subscribed: false }) } };
      }
      writes++; throw original;
    }, () => "cookie", () => 123);
    await assert.rejects(controller.setPlaylistSaved(9, true), reason => reason === original);
    assert.equal(writes, 1);
    assert.equal(reads, 2);
  }
});

test("创建歌单校验名称、登录和隐私选项，只传递标准歌单类型", async () => {
  const calls: any[] = [];
  const controller = new MusicController(async (method, params) => { calls.push({ method, params }); return { code: 200, playlist: raw() }; }, () => "cookie", () => 123);
  assert.equal((await controller.createPlaylist(" 新歌单 ", true)).creatorId, 123);
  assert.equal(calls[0].method, "playlist_create");
  assert.equal(calls[0].params.name, "新歌单");
  assert.equal(calls[0].params.privacy, 10);
  assert.equal(calls[0].params.type, "NORMAL");
  await assert.rejects(controller.createPlaylist(" ", false));
  await assert.rejects(controller.createPlaylist("歌".repeat(41), false));
  await assert.rejects(controller.createPlaylist("歌单", "true"));
  const anonymous = new MusicController(async () => { throw new Error("must not call"); }, () => "");
  await assert.rejects(anonymous.createPlaylist("歌单", false), /扫码登录/);
  assert.equal(calls.length, 1);
  assert.equal(normalizePlaylist({ id: 9, name: "歌单", userId: 123 })?.creatorId, 123);
});

test("歌单增删和编辑在主进程重新验证所有者，无法利用公共缓存操作他人歌单", async () => {
  const calls: string[] = [];
  const controller = new MusicController(async method => { calls.push(method); return { code: 200, playlist: raw(9, 999) }; }, () => "cookie", () => 123);
  await controller.playlist(9);
  await assert.rejects(controller.changePlaylistSongs(9, [1], "del"), /自己创建/);
  await assert.rejects(controller.changePlaylistSongs(9, [1], "add"), /自己创建/);
  await assert.rejects(controller.updatePlaylist(9, { name: "改名", description: "", tags: [] }), /自己创建/);
  assert.deepEqual(calls, Array(4).fill("playlist_detail"));
  await assert.rejects(controller.changePlaylistSongs(9, [], "add"));
  await assert.rejects(controller.changePlaylistSongs(9, [NaN], "add"));
  await assert.rejects(controller.changePlaylistSongs(9, [1], "unknown"));
  assert.equal(calls.length, 4);
});

test("普通歌单批量增删分批去重，兼容上游嵌套响应并清理旧详情", async () => {
  const operations: any[] = [];
  let reads = 0;
  const controller = new MusicController(async (method, params) => {
    if (method === "playlist_detail") { reads++; return { code: 200, playlist: raw() }; }
    assert.equal(method, "playlist_tracks"); operations.push(params);
    return { status: 200, body: { code: 200 } };
  }, () => "cookie", () => 123);
  await controller.playlist(9);
  await controller.changePlaylistSongs(9, [...Array.from({ length: 503 }, (_, i) => i + 1), 1], "add");
  assert.deepEqual(operations.map(op => op.tracks.split(',').length), [500, 3]);
  assert.equal(operations[0].op, "add");
  await controller.playlist(9);
  assert.equal(reads, 3);
  await controller.changePlaylistSongs(9, [1], "del");
  assert.equal(operations[2].op, "del");
});

test("喜欢歌单增删对应喜欢状态；中途失败明确返回已处理数量", async () => {
  const calls: any[] = [];
  const controller = new MusicController(async (method, params) => {
    if (method === "playlist_detail") return { code: 200, playlist: raw(9, 123, 5) };
    assert.equal(method, "like"); calls.push(params);
    return { code: params.id === 3 ? 500 : 200 };
  }, () => "cookie", () => 123);
  await controller.changePlaylistSongs(9, [1], "add");
  await controller.changePlaylistSongs(9, [1], "del");
  assert.deepEqual(calls.map(call => call.like), ["true", "false"]);
  await assert.rejects(controller.changePlaylistSongs(9, [2, 3], "del"), /已处理 1 首/);
  await assert.rejects(controller.updatePlaylist(9, { name: "改名", description: "", tags: [] }), /由网易云音乐管理/);
});

test("编辑歌单使用真实标签并正确转义引号换行，检查批量更新子响应", async () => {
  let partialFailure = false;
  const upstreamUpdate = require("../node_modules/@neteasecloudmusicapienhanced/api/module/playlist_update.js");
  const name = '歌单"名字';
  const description = '第一行\n第二行\\结尾';
  const controller = new MusicController(async (method, params) => {
    if (method === "playlist_detail") return { code: 200, playlist: raw() };
    if (method === "playlist_catlist") return { code: 200, categories: { 0: "语种" }, sub: [{ name: "华语", category: 0 }] };
    assert.equal(method, "playlist_update");
    return upstreamUpdate(params, async (_url: string, data: Record<string, string>) => {
      assert.equal(JSON.parse(data["/api/playlist/update/name"]).name, name);
      assert.equal(JSON.parse(data["/api/playlist/desc/update"]).desc, description);
      assert.equal(JSON.parse(data["/api/playlist/tags/update"]).tags, "华语");
      return { code: 200, "/api/playlist/tags/update": { code: partialFailure ? 500 : 200 } };
    });
  }, () => "cookie", () => 123);
  const value = { name, description, tags: ["华语"] };
  await controller.updatePlaylist(9, value);
  partialFailure = true;
  await assert.rejects(controller.updatePlaylist(9, value), /部分歌单信息/);
  await assert.rejects(controller.updatePlaylist(9, { ...value, tags: ["无效标签"] }), /有效的歌单标签/);
});

test("歌单修改期间的旧详情响应不能重新写入缓存", async () => {
  let release!: (body: any) => void;
  const old = new Promise<any>(resolve => { release = resolve; });
  let reads = 0;
  const controller = new MusicController(async method => {
    if (method === "playlist_detail") { reads++; return reads === 1 ? old : { code: 200, playlist: { ...raw(), name: "新歌单" } }; }
    return { code: 200 };
  }, () => "cookie", () => 123);
  const reading = controller.playlist(9);
  await controller.updatePlaylist(9, { name: "新歌单", description: "", tags: [] });
  release({ code: 200, playlist: { ...raw(), name: "旧歌单" } });
  assert.equal((await reading).playlist.name, "新歌单");
  assert.equal((await controller.playlist(9)).playlist.name, "新歌单");
});

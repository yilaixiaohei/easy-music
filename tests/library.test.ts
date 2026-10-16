import { test } from "node:test";
import assert from "node:assert/strict";
import { MusicController } from "../src/main/music-controller";
import {
  currentLyricIndex,
  parseLyrics,
} from "../src/renderer/src/player/lyrics";

const rawSong = (id: number) => ({
  id,
  name: `歌曲${id}`,
  ar: [{ name: "歌手" }],
  al: { name: "专辑" },
  dt: 200000,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const likedPlaylist = {
  id: 99, name: "喜欢歌单", specialType: 5, creator: { userId: 123 },
};

test("歌单完整加载超过 50 首，歌曲详情乱序返回时恢复歌单顺序", async () => {
  const calls: string[] = [];
  const library = new MusicController(
    async (method, params) => {
      calls.push(method);
      if (method === "playlist_detail")
        return {
          code: 200,
          playlist: {
            id: 1,
            name: "歌单",
            trackCount: 55,
            trackIds: Array.from({ length: 55 }, (_, index) => ({
              id: index + 1,
            })),
            tracks: [rawSong(1)],
          },
        };
      if (method === "song_detail")
        return {
          code: 200,
          songs: String(params?.ids)
            .split(",")
            .map(Number)
            .reverse()
            .map(rawSong),
        };
      throw new Error("unexpected");
    },
    () => "",
  );
  const result = await library.playlist(1);
  assert.deepEqual(
    result.songs.map((song) => song.id),
    Array.from({ length: 55 }, (_, index) => index + 1),
  );
  assert.equal(result.unavailable, 0);
  assert.equal(result.total, 55);
  await library.playlist(1);
  assert.equal(calls.filter((value) => value === "playlist_detail").length, 1);
});

test("空歌单不调用歌曲详情，也不生成无效的空 ID 请求", async () => {
  const library = new MusicController(
    async (method) => {
      assert.equal(method, "playlist_detail");
      return {
        code: 200,
        playlist: { id: 1, name: "空歌单", trackIds: [], tracks: [] },
      };
    },
    () => "",
  );
  const result = await library.playlist(1);
  assert.deepEqual(result.songs, []);
  assert.equal(result.total, 0);
});

test("大型歌单分批取齐详情，复用已有歌曲并报告不可读取项", async () => {
  const ids = Array.from({ length: 1207 }, (_, index) => index + 1);
  const sizes: number[] = [];
  const controller = new MusicController(async (method, params) => {
    if (method === "playlist_detail") return { code: 200, playlist: {
      id: 1, name: "完整歌单", trackIds: ids.map((id) => ({ id })),
      tracks: [1, 2, 3].map(rawSong),
    } };
    assert.equal(method, "song_detail");
    const batch = String(params?.ids).split(",").map(Number);
    sizes.push(batch.length);
    return { code: 200, songs: batch.filter((id) => id !== 707).reverse().map(rawSong) };
  }, () => "account");
  const result = await controller.playlist(1);
  assert.deepEqual(sizes, [500, 500, 204]);
  assert.equal(result.total, 1207);
  assert.equal(result.unavailable, 1);
  assert.deepEqual(result.songs.map((song) => song.id), ids.filter((id) => id !== 707));
});

test("歌单分批读取失败或缺少完整 ID 列表时不返回截断的成功结果", async () => {
  for (const missingIds of [false, true]) {
    const controller = new MusicController(async (method, params) => {
      if (method === "playlist_detail") return { code: 200, playlist: {
        id: 1, name: "歌单", tracks: [],
        ...(missingIds ? {} : { trackIds: Array.from({ length: 501 }, (_, index) => ({ id: index + 1 })) }),
      } };
      if (params?.ids === "501") throw new Error("network");
      return { code: 200, songs: String(params?.ids).split(",").map(Number).map(rawSong) };
    }, () => "account");
    await assert.rejects(controller.playlist(1), missingIds ? /完整歌单/ : /network/);
  }
});

test("账号变化时清理喜欢列表缓存，不把旧账号请求结果返回给新账号", async () => {
  let cookie = "account-a";
  const response = deferred<Record<string, any>>();
  let requests = 0;
  const library = new MusicController(
    async () => {
      requests++;
      return requests === 1 ? response.promise : { code: 200, ids: [2] };
    },
    () => cookie,
    () => 123,
  );
  const old = library.likedIds();
  cookie = "account-b";
  response.resolve({ code: 200, ids: [1] });
  await assert.rejects(old, /账号状态已变化/);
  assert.deepEqual(await library.likedIds(), [2]);
});

test("喜欢操作传递字符串布尔值，成功后更新缓存，失败时不篡改本地状态", async () => {
  let input: Record<string, unknown> | undefined;
  let fail = false;
  let ids = [1, 2];
  const library = new MusicController(
    async (method, params) => {
      if (method === "likelist") return { code: 200, ids };
      input = params;
      if (fail) throw new Error("offline");
      ids = ids.filter((id) => id !== params?.id);
      return { code: 200 };
    },
    () => "account",
    () => 123,
  );
  await library.likedIds();
  await library.setLiked(1, false);
  assert.equal(input?.like, "false");
  assert.deepEqual(await library.likedIds(), [2]);
  fail = true;
  await assert.rejects(library.setLiked(2, false));
  assert.deepEqual(await library.likedIds(), [2]);
});

test("未登录不能查询个人歌单或修改喜欢，异常页码不访问上游", async () => {
  let requests = 0;
  const library = new MusicController(
    async () => {
      requests++;
      return {};
    },
    () => "",
  );
  await assert.rejects(library.playlists(1), /扫码登录/);
  await assert.rejects(library.setLiked(1, true), /扫码登录/);
  await assert.rejects(library.likedSongs(), /扫码登录/);
  await assert.rejects(library.playlist(-1));
  assert.equal(requests, 0);
});

test("收藏操作成功后丢弃较早的查询，重新读取服务端状态", async () => {
  const response = deferred<Record<string, any>>();
  let first = true;
  let upstream = [1, 2];
  const library = new MusicController(
    async (method) => {
      if (method === "like") return { code: 200 };
      if (first) {
        first = false;
        return response.promise;
      }
      return { code: 200, ids: upstream };
    },
    () => "account",
    () => 123,
  );
  const old = library.likedIds();
  await library.setLiked(2, true);
  response.resolve({ code: 200, ids: [1] });
  assert.deepEqual(await old, [1, 2]);
  assert.deepEqual(await library.likedIds(true), [1, 2]);
  upstream = [2, 1];
  assert.deepEqual(await library.likedIds(true), [2, 1]);
  upstream = [1];
  assert.deepEqual(await library.likedIds(true), [1]);
});

test("喜欢列表只遵循自己的喜欢歌单，收藏、刷新和重建控制器均不本地置顶", async () => {
  let ids = [3, 1];
  const call = async (method: string, params?: Record<string, unknown>) => {
    if (method === "like") { ids = [3, 2, 1]; return { code: 200 }; }
    if (method === "user_playlist") return { code: 200, playlist: [
      { ...likedPlaylist, id: 88, creator: { userId: 456 } },
      { id: 77, name: "普通歌单", creator: { userId: 123 } },
      likedPlaylist,
    ] };
    if (method === "playlist_detail") {
      assert.equal(params?.id, 99);
      return { code: 200, playlist: { trackIds: ids.map((id) => ({ id })) } };
    }
    assert.equal(method, "song_detail");
    return { code: 200, songs: String(params?.ids).split(",").map(Number).reverse().map(rawSong) };
  };
  const library = new MusicController(
    call,
    () => "account",
    () => 123,
  );
  await library.setLiked(2, true);
  assert.deepEqual((await library.likedSongs()).ids, [3, 2, 1]);
  assert.deepEqual((await library.likedSongs()).songs.map((song) => song.id), [3, 2, 1]);
  const restarted = new MusicController(call, () => "account", () => 123);
  assert.deepEqual((await restarted.likedSongs()).ids, [3, 2, 1]);
});

test("完整喜欢列表内部批量取齐，保留顺序并报告无法读取的歌曲", async () => {
  const ids = Array.from({ length: 1207 }, (_, index) => index + 1);
  const sizes: number[] = [];
  const library = new MusicController(
    async (method, params) => {
      if (method === "user_playlist") return { code: 200, playlist: [likedPlaylist] };
      if (method === "playlist_detail") return { code: 200, playlist: { trackIds: ids.map((id) => ({ id })) } };
      const batch = String(params?.ids).split(",").map(Number);
      sizes.push(batch.length);
      return {
        code: 200,
        songs: batch
          .filter((id) => id !== 707)
          .reverse()
          .map(rawSong),
      };
    },
    () => "account",
    () => 123,
  );
  const result = await library.likedSongs();
  assert.deepEqual(sizes, [500, 500, 207]);
  assert.deepEqual(result.ids, ids);
  assert.equal(result.total, 1207);
  assert.equal(result.unavailable, 1);
  assert.deepEqual(
    result.songs.map((song) => song.id),
    ids.filter((id) => id !== 707),
  );
});

test("完整列表中途请求失败时返回错误，不把截断列表误报为已加载全部", async () => {
  const ids = Array.from({ length: 501 }, (_, index) => index + 1);
  const library = new MusicController(
    async (method, params) => {
      if (method === "user_playlist") return { code: 200, playlist: [likedPlaylist] };
      if (method === "playlist_detail") return { code: 200, playlist: { trackIds: ids.map((id) => ({ id })) } };
      if (params?.ids === "501") throw new Error("network");
      return {
        code: 200,
        songs: String(params?.ids).split(",").map(Number).map(rawSong),
      };
    },
    () => "account",
    () => 123,
  );
  await assert.rejects(library.likedSongs(), /network/);
});

test("跨页查找自己的喜欢歌单，空歌单不请求歌曲详情", async () => {
  const offsets: unknown[] = [];
  const library = new MusicController(
    async (method, params) => {
      if (method === "user_playlist") {
        offsets.push(params?.offset);
        return params?.offset === 0
          ? { code: 200, playlist: [{ id: 1, specialType: 0 }], more: true }
          : { code: 200, playlist: [likedPlaylist], more: false };
      }
      assert.equal(method, "playlist_detail");
      return { code: 200, playlist: { trackIds: [] } };
    },
    () => "account",
    () => 123,
  );
  assert.deepEqual(await library.likedSongs(), {
    ids: [], songs: [], total: 0, unavailable: 0,
  });
  assert.deepEqual(offsets, [0, 1]);
});

test("找不到喜欢歌单或缺少顺序时明确报错，不退回无序接口", async () => {
  for (const found of [false, true]) {
    const library = new MusicController(
      async (method) => {
        if (method === "user_playlist")
          return { code: 200, playlist: found ? [likedPlaylist] : [], more: false };
        assert.equal(method, "playlist_detail");
        return { code: 200, playlist: {} };
      },
      () => "account",
      () => 123,
    );
    await assert.rejects(library.likedSongs(), /喜欢歌单/);
  }
});

test("多时间戳、重复时间行及翻译歌词正确合并并按时间排列", () => {
  const result = parseLyrics(
    "[ti:标题]\n[00:03.50]第三句\n[00:01.00][00:02.000]重复句\n[00:03.50]第三句和声",
    "[00:01.00]翻译一\n[00:03.500]翻译三",
  );
  assert.deepEqual(
    result.lines.map((line) => line.time),
    [1, 2, 3.5],
  );
  assert.equal(result.lines[0]?.translation, "翻译一");
  assert.equal(result.lines[2]?.translation, "翻译三");
  assert.equal(result.lines[2]?.text, "第三句 / 第三句和声");
  assert.equal(currentLyricIndex(result.lines, 0), -1);
  assert.equal(currentLyricIndex(result.lines, 2.1), 1);
  assert.equal(currentLyricIndex(result.lines, 999), 2);
});

test("每日推荐完整保留上游歌曲数量和顺序，未登录不访问上游", async () => {
  const ids = Array.from({ length: 60 }, (_, index) => index + 1);
  const controller = new MusicController(async (method) => {
    assert.equal(method, "recommend_songs");
    return { code: 200, data: { dailySongs: ids.map(rawSong) } };
  }, () => "account", () => 123);
  assert.deepEqual((await controller.dailySongs()).map((song) => song.id), ids);
  const guest = new MusicController(async () => { throw new Error("unexpected"); }, () => "");
  await assert.rejects(guest.dailySongs(), /扫码登录/);
  await assert.rejects(guest.radar(), /扫码登录/);
});

test("私人雷达使用当前登录态读取真实雷达歌单，详情页面保留歌单顺序", async () => {
  let calls = 0;
  const controller = new MusicController(async (method, params) => {
    calls++;
    assert.equal(method, "playlist_detail");
    assert.equal(params?.cookie, "account");
    assert.equal(params?.id, 3136952023);
    return { code: 200, playlist: {
      id: 3136952023, name: "今天从《歌曲3》听起|私人雷达", specialType: 100,
      coverImgUrl: "https://example.com/radar.jpg", trackCount: 3,
      trackIds: [3, 1, 2].map((id) => ({ id })), tracks: [1, 2, 3].map(rawSong),
    } };
  }, () => "account", () => 123);
  assert.equal((await controller.radar()).trackCount, 3);
  assert.deepEqual((await controller.playlist(3136952023)).songs.map((song) => song.id), [3, 1, 2]);
  assert.equal(calls, 1);
});

test("雷达响应不是私人雷达时明确报错，不展示其他歌单冒充雷达", async () => {
  const controller = new MusicController(async () => ({ code: 200, playlist: {
    id: 3136952023, name: "普通歌单", specialType: 0,
  } }), () => "account", () => 123);
  await assert.rejects(controller.radar(), /私人雷达/);
});

test("六个排行榜按指定顺序选择，保留前三名顺序并缓存摘要", async () => {
  const names = ["新歌榜", "热歌榜", "飙升榜", "网易云欧美热歌榜", "网易云日语榜", "网易云韩语榜"];
  let catalogues = 0;
  let details = 0;
  const controller = new MusicController(async (method, params) => {
    if (method === "toplist_detail") {
      catalogues++;
      return { code: 200, list: [
        { id: 99, name: "音乐合伙人热歌榜" },
        ...names.map((name, index) => ({ id: index + 1, name, updateFrequency: "每周更新" })).reverse(),
      ] };
    }
    assert.equal(method, "playlist_detail");
    details++;
    return { code: 200, playlist: {
      id: params?.id, name: names[Number(params?.id) - 1],
      trackIds: [1, 2, 3].map((id) => ({ id })), tracks: [3, 1, 2].map(rawSong),
    } };
  }, () => "account");
  const charts = await controller.charts();
  assert.deepEqual(charts.map((chart) => chart.name), names);
  assert.deepEqual(charts[0].previews.map((song) => song.title), ["歌曲1", "歌曲2", "歌曲3"]);
  assert.equal(charts[0].updateFrequency, "每周更新");
  await controller.charts();
  await controller.playlist(1);
  assert.equal(catalogues, 1);
  assert.equal(details, 6);
});

test("单个榜单预览失败仍保留真实榜单入口与目录摘要", async () => {
  const controller = new MusicController(async (method) => {
    if (method === "toplist_detail") return { code: 200, list: [{
      id: 1, name: "新歌榜", tracks: [{ first: "真实歌曲", second: "真实歌手" }],
    }, { id: 2, name: "网易云日语榜" }] };
    throw new Error("preview unavailable");
  }, () => "");
  const result = await controller.charts();
  assert.equal(result.length, 2);
  assert.equal(result[0].previews[0].title, "真实歌曲");
  assert.deepEqual(result[1].previews, []);
});

test("歌词忽略无效秒数，支持偏移、纯文本及空内容", () => {
  assert.equal(parseLyrics("[offset:500]\n[00:01.00]歌词").lines[0]?.time, 1.5);
  assert.equal(parseLyrics("[01:99.00]无效时间").lines.length, 0);
  assert.equal(parseLyrics("[ti:标题]\n纯文本歌词").plain, "纯文本歌词");
  assert.deepEqual(parseLyrics(""), { lines: [], plain: "" });
  assert.equal(currentLyricIndex([], 1), -1);
});

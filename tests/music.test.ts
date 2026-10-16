import { test } from "node:test";
import assert from "node:assert/strict";
import { MusicController, normalizeSong } from "../src/main/music-controller";

test("兼容歌曲搜索的两种字段结构，并转换为安全的封面地址", () => {
  const modern = normalizeSong({
    id: 1,
    name: "测试歌曲",
    ar: [{ name: "甲" }, { name: "乙" }],
    al: { name: "专辑", picUrl: "http://p1.music.126.net/a.jpg" },
    dt: 123456,
  });
  assert.equal(modern?.artists, "甲 / 乙");
  assert.equal(modern?.duration, 123.456);
  assert.equal(modern?.cover, "https://p1.music.126.net/a.jpg");
  assert.equal(
    normalizeSong({
      id: 2,
      name: "旧结构",
      artists: [{ name: "甲" }],
      album: { name: "旧专辑" },
      duration: 1000,
    })?.duration,
    1,
  );
  assert.equal(
    normalizeSong({
      id: 3,
      name: "危险封面",
      al: { picUrl: "file:///C:/secret" },
    })?.cover,
    "",
  );
  assert.equal(normalizeSong({ id: -1, name: "无效" }), null);
  assert.equal(
    normalizeSong({ id: 4, name: "异常时长", dt: NaN })?.duration,
    0,
  );
});

test("搜索参数在主进程校验，空关键词和异常页码不访问上游", async () => {
  let requests = 0;
  const controller = new MusicController(
    async () => {
      requests++;
      return {};
    },
    () => "",
  );
  await assert.rejects(controller.search("", 1));
  await assert.rejects(controller.search("歌", 0));
  await assert.rejects(controller.search("歌", 1.2));
  await assert.rejects(controller.search("歌", 1001));
  await assert.rejects(controller.source("1", "standard"));
  await assert.rejects(controller.source(1, "unknown"));
  assert.equal(requests, 0);
});

test("搜索计算分页，并只返回标准歌曲数据而不泄露上游 Cookie", async () => {
  let input: Record<string, unknown> | undefined;
  const controller = new MusicController(
    async (_method, params) => {
      input = params;
      return {
        code: 200,
        cookie: "secret",
        result: { songCount: 61, songs: [{ id: 1, name: "歌曲", dt: 1000 }] },
      };
    },
    () => "MUSIC_U=secret",
  );
  const result = await controller.search("  歌曲  ", 2);
  assert.equal(input?.offset, 30);
  assert.equal(input?.keywords, "歌曲");
  assert.equal(input?.cookie, "MUSIC_U=secret");
  assert.equal(result.hasMore, true);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("播放响应匹配歌曲 ID，识别试听并显示实际音质", async () => {
  const controller = new MusicController(
    async () => ({
      code: 200,
      data: [
        { id: 9, url: "https://wrong.example/a.mp3" },
        {
          id: 1,
          url: "http://m8.music.126.net/test.mp3",
          level: "standard",
          freeTrialInfo: { start: 20, end: 50 },
        },
      ],
    }),
    () => "",
  );
  const source = await controller.source(1, "exhigh");
  assert.equal(source.trial, true);
  assert.equal(source.level, "standard");
  assert.equal(source.url, "https://m8.music.126.net/test.mp3");
});

test("无权限歌曲返回可理解的不可播放状态；网络失败仍作为错误处理", async () => {
  const controller = new MusicController(
    async () => ({ code: 200, data: [{ id: 1, url: null }] }),
    () => "",
  );
  const source = await controller.source(1, "standard");
  assert.equal(source.url, null);
  assert.match(source.reason!, /不可播放/);
  const network = new MusicController(
    async () => {
      throw new Error("offline");
    },
    () => "",
  );
  await assert.rejects(network.source(1, "standard"), /offline/);
});

test("无损请求保留登录态并显示服务端实际音质，拒绝更高档位", async () => {
  let returnedLevel = "lossless";
  const calls: any[] = [];
  const controller = new MusicController(async (method, params) => {
    calls.push({ method, params });
    return { code: 200, data: [{ id: 1, url: "https://m8.music.126.net/test.flac", level: returnedLevel }] };
  }, () => "fixture-cookie");
  assert.equal((await controller.source(1, "lossless")).level, "lossless");
  assert.equal(calls[0].params.level, "lossless");
  assert.equal(calls[0].params.cookie, "fixture-cookie");
  assert.equal(calls[0].params.unblock, "false");
  returnedLevel = "exhigh";
  assert.equal((await controller.source(1, "lossless")).level, "exhigh");
  await assert.rejects(controller.source(1, "hires"), /音质选项无效/);
  assert.equal(calls.length, 2);
});

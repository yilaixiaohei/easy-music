import { test } from "node:test";
import assert from "node:assert/strict";
import { createPinia, disposePinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { MusicController } from "../src/main/music-controller";
import { useAccountStore } from "../src/renderer/src/stores/account";
import { usePlayerStore } from "../src/renderer/src/stores/player";
import type { DesktopApi, Song } from "../src/shared/contracts";

const song = (id: number): Song => ({
  id, title: `歌曲${id}`, artists: "歌手", album: "专辑", cover: "", duration: 100,
});
const ok = <T>(data: T) => ({ ok: true as const, data });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
class FakeAudio extends EventTarget {
  src = "";
  currentTime = 0;
  duration = 100;
  volume = 1;
  muted = false;
  preload = "auto";
  async play() { this.dispatchEvent(new Event("playing")); }
  pause() { this.dispatchEvent(new Event("pause")); }
  load() {}
  removeAttribute() {}
}
function setup(
  context: { after(fn: () => void): void },
  overrides: Partial<DesktopApi["music"]> = {},
) {
  const names = ["window", "localStorage", "Audio"] as const;
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const saved = new Map<string, string>();
  const audios: FakeAudio[] = [];
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: class extends FakeAudio {
    constructor() { super(); audios.push(this); }
  } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { desktop: { music: {
    roaming: async () => ok([song(11), song(12)]),
    reduceRecommendation: async () => ok(undefined),
    source: async () => ok({ url: "https://example.com/music.mp3", level: "standard", trial: false }),
    ...overrides,
  } } } });
  const pinia = createPinia();
  setActivePinia(pinia);
  const account = useAccountStore();
  account.session = { authenticated: true, profile: { userId: 123, nickname: "测试", avatarUrl: "" } };
  const player = usePlayerStore();
  context.after(() => {
    player.clear();
    disposePinia(pinia);
    names.forEach((name, index) => {
      if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!);
      else Reflect.deleteProperty(globalThis, name);
    });
  });
  return { player, account, audios, saved };
}

test("切换无损保留当前进度与播放/暂停状态，重启恢复选择时不重新取地址", async context => {
  const requests: string[] = [];
  const { player, audios, saved } = setup(context, {
    source: async (_id, quality) => { requests.push(quality); return ok({ url: 'https://example.com/music.flac', level: quality, trial: false }); },
  });
  player.playSong(song(1));
  await Promise.resolve(); await Promise.resolve();
  audios.at(-1)!.currentTime = 25;
  audios.at(-1)!.dispatchEvent(new Event('timeupdate'));
  player.quality = 'lossless';
  await Promise.resolve(); await Promise.resolve();
  assert.equal(player.state.position, 25);
  assert.equal(player.state.wantsPlayback, true);
  assert.equal(player.state.level, 'lossless');
  player.toggle();
  player.quality = 'exhigh';
  await Promise.resolve(); await Promise.resolve();
  assert.equal(player.state.position, 25);
  assert.equal(player.state.wantsPlayback, false);
  assert.equal(player.state.phase, 'paused');
  player.quality = 'lossless';
  await Promise.resolve(); await Promise.resolve();
  assert.equal(JSON.parse(saved.get('easy-music:player-v1')!).quality, 'lossless');
  const before = requests.length;
  const second = createPinia(); setActivePinia(second);
  const restored = usePlayerStore();
  await nextTick();
  assert.equal(restored.quality, 'lossless');
  assert.equal(restored.state.wantsPlayback, false);
  assert.equal(requests.length, before);
  disposePinia(second);
});

test("漫游打开歌词层，收起后继续播放，顺序按钮无效；普通歌曲恢复普通队列", async (context) => {
  const { player } = setup(context);
  player.playAll([song(1), song(2)]);
  player.mode = "single";
  await player.startRoaming();
  assert.equal(player.lyricsOpen, true);
  assert.equal(player.state.song?.id, 11);
  player.lyricsOpen = false;
  assert.equal(player.isRoaming, true);
  assert.equal(player.state.wantsPlayback, true);
  player.cycleMode();
  assert.equal(player.mode, "single");
  await player.next(1);
  assert.equal(player.state.song?.id, 12);
  player.playSong(song(2));
  assert.equal(player.isRoaming, false);
  assert.deepEqual(player.queue.map((item) => item.id), [1, 2]);
  assert.equal(player.mode, "single");
});

test("漫游自然结束续播，批次末尾取新推荐，连续点击不重复请求", async (context) => {
  const response = deferred<any>();
  let requests = 0;
  const { player, audios } = setup(context, {
    roaming: async () => ++requests === 1 ? ok([song(11)]) : response.promise,
  });
  await player.startRoaming();
  await nextTick();
  audios.at(-1)!.dispatchEvent(new Event("ended"));
  const duplicate = player.next(1);
  assert.equal(requests, 2);
  response.resolve(ok([song(12), song(13)]));
  await duplicate;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(player.state.song?.id, 12);
  assert.equal(player.isRoaming, true);
});

test("减少推荐成功才切歌，不取消红心，反馈失败保留当前歌曲", async (context) => {
  let fail = true;
  const rejected: number[] = [];
  const { player } = setup(context, {
    reduceRecommendation: async (id) => {
      if (fail) return { ok: false, error: "反馈失败" };
      rejected.push(id);
      return ok(undefined);
    },
  });
  await player.startRoaming();
  await player.reduceRecommendation();
  assert.equal(player.state.song?.id, 11);
  assert.match(player.notice, /反馈失败/);
  fail = false;
  await player.reduceRecommendation();
  assert.deepEqual(rejected, [11]);
  assert.equal(player.state.song?.id, 12);
  assert.equal(player.queue.some((item) => item.id === 11), false);
});

test("退出漫游后迟到的推荐不能抢回普通播放，切换账号也会取消请求", async (context) => {
  const first = deferred<any>();
  const second = deferred<any>();
  let calls = 0;
  const { player, account } = setup(context, {
    roaming: async () => ++calls === 1 ? first.promise : second.promise,
  });
  const loading = player.startRoaming();
  player.playSong(song(1));
  first.resolve(ok([song(11)]));
  await loading;
  assert.equal(player.isRoaming, false);
  assert.equal(player.state.song?.id, 1);
  const nextLoading = player.startRoaming();
  account.session = { authenticated: false, profile: null };
  second.resolve(ok([song(12)]));
  await nextLoading;
  assert.equal(player.isRoaming, false);
  assert.equal(player.state.song, null);
});

test("新模式的响应优先；重复推荐和空批次停止续播并可重试", async (context) => {
  const old = deferred<any>();
  let calls = 0;
  const { player } = setup(context, {
    roaming: async () => ++calls === 1 ? old.promise : ok([song(21)]),
  });
  const first = player.startRoaming();
  await player.startRoaming("EXPLORE");
  old.resolve(ok([song(11)]));
  await first;
  assert.equal(player.state.song?.id, 21);
  await player.next(1);
  assert.equal(player.state.song?.id, 21);
  assert.match(player.notice, /没有新的/);
  assert.equal(player.roamingLoading, false);
});

test("漫游接口验证登录和模式，保留服务端推荐顺序，反馈使用垃圾桶接口", async () => {
  const requests: string[] = [];
  const controller = new MusicController(async (method, params) => {
    requests.push(method);
    if (method === "personal_fm_mode") {
      assert.equal(params?.mode, "EXPLORE");
      return { code: 200, data: [3, 1].map((id) => ({ id, name: `歌曲${id}` })) };
    }
    assert.equal(params?.id, 3);
    return { code: 200 };
  }, () => "account", () => 123);
  await assert.rejects(controller.roaming("INVALID"));
  assert.deepEqual((await controller.roaming("EXPLORE")).map((item) => item.id), [3, 1]);
  await controller.reduceRecommendation(3);
  assert.deepEqual(requests, ["personal_fm_mode", "fm_trash"]);
  const guest = new MusicController(async () => { throw new Error("unexpected"); }, () => "");
  await assert.rejects(guest.roaming("DEFAULT"), /扫码登录/);
  await assert.rejects(guest.reduceRecommendation(3), /扫码登录/);
});

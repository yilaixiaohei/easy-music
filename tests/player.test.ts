import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PlaybackEngine,
  type AudioPort,
} from "../src/renderer/src/player/engine";
import {
  formatTime,
  nextIndex,
  uniqueSongs,
} from "../src/renderer/src/player/queue";
import type { PlaybackSource, Song } from "../src/shared/contracts";

const song = (id: number): Song => ({
  id,
  title: `歌曲 ${id}`,
  artists: "歌手",
  album: "专辑",
  cover: "",
  duration: 200,
});
const source: PlaybackSource = {
  url: "https://music.example/song.mp3",
  level: "standard",
  trial: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class FakeAudio implements AudioPort {
  src = "";
  currentTime = 0;
  duration = 200;
  volume = 1;
  muted = false;
  preload = "";
  plays = 0;
  pauses = 0;
  events = new Map<string, Set<() => void>>();
  async play() {
    this.plays++;
    this.emit("playing");
  }
  pause() {
    this.pauses++;
    this.emit("pause");
  }
  load() {}
  removeAttribute() {
    this.src = "";
  }
  addEventListener(type: string, handler: () => void) {
    if (!this.events.has(type)) this.events.set(type, new Set());
    this.events.get(type)!.add(handler);
  }
  removeEventListener(type: string, handler: () => void) {
    this.events.get(type)?.delete(handler);
  }
  emit(type: string) {
    this.events.get(type)?.forEach((handler) => handler());
  }
}
function setup(
  fetchSource: (id: number) => Promise<PlaybackSource> = async () => source,
) {
  const audios: FakeAudio[] = [];
  const started: number[] = [];
  let ended = 0,
    unavailable = 0;
  const engine = new PlaybackEngine({
    source: fetchSource,
    createAudio: () => {
      const audio = new FakeAudio();
      audios.push(audio);
      return audio;
    },
    changed: () => {},
    started: (song) => started.push(song.id),
    ended: () => ended++,
    unavailable: () => unavailable++,
  });
  return {
    engine,
    audios,
    started,
    ended: () => ended,
    unavailable: () => unavailable,
  };
}

test("快速切歌时较晚返回的旧地址不能覆盖当前音频", async () => {
  const first = deferred<PlaybackSource>();
  const { engine, audios, started } = setup(async (id) =>
    id === 1 ? first.promise : source,
  );
  const old = engine.play(song(1));
  await engine.play(song(2));
  first.resolve(source);
  await old;
  assert.equal(engine.state.song?.id, 2);
  assert.equal(audios.length, 1);
  assert.deepEqual(started, [2]);
});

test("已经被释放的旧音频事件不能改写新歌的位置或触发自动切歌", async () => {
  const { engine, audios, ended } = setup();
  await engine.play(song(1));
  const oldTime = [...audios[0]!.events.get("timeupdate")!][0]!;
  const oldEnded = [...audios[0]!.events.get("ended")!][0]!;
  await engine.play(song(2));
  audios[0]!.currentTime = 180;
  oldTime();
  oldEnded();
  assert.equal(engine.state.position, 0);
  assert.equal(engine.state.song?.id, 2);
  assert.equal(ended(), 0);
  assert.equal(audios[0]!.src, "");
});

test("地址加载期间点击暂停，地址返回后不能自动发出声音", async () => {
  const pending = deferred<PlaybackSource>();
  const { engine, audios } = setup(async () => pending.promise);
  const loading = engine.play(song(1));
  engine.pause();
  pending.resolve(source);
  await loading;
  assert.equal(audios[0]!.plays, 0);
  assert.equal(engine.state.wantsPlayback, false);
  await engine.resume();
  assert.equal(audios[0]!.plays, 1);
});

test("网络错误停止播放意图，不触发不可播放歌曲的自动跳过", async () => {
  const { engine, unavailable } = setup(async () => {
    throw new Error("网络已断开");
  });
  await engine.play(song(1));
  assert.equal(engine.state.phase, "error");
  assert.equal(engine.state.wantsPlayback, false);
  assert.equal(unavailable(), 0);
  assert.match(engine.state.error, /网络/);
});

test("不可播放与音频格式错误分别报告，避免无限自动重试", async () => {
  const missing = setup(async () => ({
    ...source,
    url: null,
    reason: "无权限",
  }));
  await missing.engine.play(song(1));
  assert.equal(missing.unavailable(), 1);
  assert.equal(missing.audios.length, 0);
  const badAudio = setup();
  await badAudio.engine.play(song(1));
  badAudio.audios[0]!.emit("error");
  assert.equal(badAudio.engine.state.phase, "error");
  assert.equal(badAudio.unavailable(), 0);
});

test("恢复队列只恢复暂停状态；点击播放时才获取新地址并恢复进度", async () => {
  let requests = 0;
  const { engine, audios } = setup(async () => {
    requests++;
    return source;
  });
  engine.restore(song(1), 65);
  assert.equal(requests, 0);
  assert.equal(engine.state.phase, "paused");
  engine.seek(80);
  assert.equal(requests, 0);
  assert.equal(engine.state.position, 80);
  await engine.resume();
  audios[0]!.emit("loadedmetadata");
  assert.equal(requests, 1);
  assert.equal(audios[0]!.currentTime, 80);
});

test("试听使用实际媒体时长，并限制跳转范围和音量", async () => {
  const { engine, audios } = setup(async () => ({ ...source, trial: true }));
  engine.setVolume(4, true);
  await engine.play(song(1));
  audios[0]!.duration = 30;
  audios[0]!.emit("loadedmetadata");
  engine.seek(100);
  assert.equal(engine.state.duration, 30);
  assert.equal(engine.state.trial, true);
  assert.equal(audios[0]!.currentTime, 30);
  assert.equal(audios[0]!.volume, 1);
  assert.equal(audios[0]!.muted, true);
});

test("清空队列对应的 stop 会丢弃仍在加载的歌曲", async () => {
  const pending = deferred<PlaybackSource>();
  const { engine, audios } = setup(async () => pending.promise);
  const loading = engine.play(song(1));
  engine.stop();
  pending.resolve(source);
  await loading;
  assert.equal(engine.state.song, null);
  assert.equal(audios.length, 0);
});

test("音频缓冲超时后停止加载，不会一直显示等待状态", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { engine, audios } = setup();
  await engine.play(song(1));
  audios[0]!.emit("waiting");
  assert.equal(engine.state.buffering, true);
  context.mock.timers.tick(20001);
  assert.equal(engine.state.phase, "error");
  assert.equal(engine.state.buffering, false);
  assert.equal(engine.state.wantsPlayback, false);
  assert.match(engine.state.error, /超时/);
  engine.stop();
});

test("顺序播放在末尾停止；列表循环回到开头；单曲循环仅在自然结束生效", () => {
  const queue = [song(1), song(2), song(3)];
  assert.equal(nextIndex(queue, 2, "order", 1, true), null);
  assert.equal(nextIndex(queue, 2, "loop", 1, true), 0);
  assert.equal(nextIndex(queue, 1, "single", 1, true), 1);
  assert.equal(nextIndex(queue, 1, "single", 1, false), 2);
});

test("自动跳过已失败歌曲有界，随机播放不重复当前歌曲", () => {
  const queue = [song(1), song(2), song(3)];
  assert.equal(nextIndex(queue, 2, "loop", 1, true, new Set([1, 2, 3])), null);
  assert.equal(
    nextIndex(queue, 0, "shuffle", 1, true, new Set(), () => 0),
    1,
  );
  assert.equal(nextIndex(queue, 0, "shuffle", 1, true, new Set([2, 3])), null);
  assert.equal(nextIndex([], 0, "loop", 1), null);
});

test("队列按歌曲 ID 去重，过滤异常保存数据，时间格式可处理无效时长", () => {
  assert.deepEqual(
    uniqueSongs([song(1), song(1), song(2), null as any]).map(
      (song) => song.id,
    ),
    [1, 2],
  );
  assert.equal(formatTime(125.9), "02:05");
  assert.equal(formatTime(NaN), "00:00");
});

// Isolated integration test: real service + muted Chromium audio. No user session is read.
const { app, utilityProcess, BrowserWindow } = require("electron");
const { join } = require("node:path");
const assert = require("node:assert/strict");
let child, window;
let sequence = 0;
const requestedQuality = process.env.EASY_MUSIC_SMOKE_QUALITY || "standard";
const pending = new Map();
const timer = setTimeout(
  () => finish(1, "FAIL: music smoke test timed out"),
  60000,
);
function finish(code, message) {
  clearTimeout(timer);
  console.log(message);
  child?.kill();
  window?.destroy();
  app.exit(code);
}
function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    child.postMessage({ id, method, params });
  });
}
app.whenReady().then(async () => {
  try {
    child = utilityProcess.fork(
      join(__dirname, "../out/main/music-worker.js"),
      [],
      { stdio: "ignore" },
    );
    child.on("message", ({ id, result }) => {
      const item = pending.get(id);
      if (!item) return;
      pending.delete(id);
      result.ok
        ? item.resolve(result.data)
        : item.reject(new Error(result.error));
    });
    child.on("exit", () => {
      if (pending.size) finish(1, "FAIL: music worker exited");
    });
    const search = await call("cloudsearch", {
      keywords: "纯音乐",
      type: 1,
      limit: 5,
      cookie: "",
    });
    assert.equal(search.code, 200);
    assert.ok(search.result?.songs?.length);
    console.log("PASS: real song search and metadata");
    const recommendations = await call('personalized', { limit: 2, cookie: '' });
    assert.equal(recommendations.code, 200);
    assert.ok(recommendations.result?.length);
    const playlist = await call('playlist_detail', { id: recommendations.result[0].id, cookie: '' });
    assert.equal(playlist.code, 200);
    assert.ok(Array.isArray(playlist.playlist?.trackIds));
    console.log('PASS: real recommendations and playlist detail');
    const lyric = await call('lyric', { id: search.result.songs[0].id, cookie: '' });
    assert.equal(lyric.code, 200);
    console.log('PASS: real lyric endpoint');
    let source;
    for (const song of search.result.songs.slice(0, 3)) {
      const response = await call("song_url_v1", {
        id: String(song.id),
        level: requestedQuality,
        unblock: "false",
        cookie: "",
      });
      const candidate = response.data?.find((item) => item.id === song.id);
      if (candidate?.url) {
        source = candidate;
        break;
      }
    }
    assert.ok(source?.url);
    const url = new URL(source.url);
    url.protocol = "https:";
    console.log(`PASS: real playback URL requested=${requestedQuality}, actual=${source.level}, format=${source.type}`);
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        offscreen: true,
      },
    });
    await window.loadURL(
      'data:text/html,<html><head><meta name="referrer" content="no-referrer"></head><body>Muted audio integration test</body></html>',
    );
    const result = await window.webContents.executeJavaScript(
      `new Promise((resolve, reject) => {
      const audio = new Audio(); audio.muted = true; audio.preload = 'auto';
      let initial = false, seeking = false, duration = 0;
      const timeout = setTimeout(() => { audio.pause(); reject(new Error('Audio timeout')); }, 25000);
      audio.onerror = () => { clearTimeout(timeout); reject(new Error('Media error')); };
      audio.onloadedmetadata = () => { duration = audio.duration; };
      audio.ontimeupdate = () => {
        if (!initial && audio.currentTime > .25) { initial = true; seeking = true; audio.currentTime = Math.min(5, audio.duration / 2); }
      };
      audio.onseeked = () => { if (!seeking) return; clearTimeout(timeout); const position = audio.currentTime; audio.pause(); resolve({ duration, position, paused: audio.paused }); };
      audio.src = ${JSON.stringify(url.href)};
      audio.play().catch(() => { clearTimeout(timeout); reject(new Error('Play rejected')); });
    })`,
      true,
    );
    assert.ok(result.duration > 0 && result.position > 0.25 && result.paused);
    console.log(
      "PASS: actual muted audio decoding, playback, seeking and pause",
    );
    finish(0, "PASS: music service smoke test");
  } catch {
    finish(
      1,
      "FAIL: music service smoke test (network, response or audio decoding)",
    );
  }
});

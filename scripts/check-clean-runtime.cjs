// Fresh portable-style SDK cache; no user account or existing SDK cache is read.
const { app, utilityProcess } = require("electron");
const { mkdtempSync, mkdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const assert = require("node:assert/strict");
const root = mkdtempSync(join(__dirname, "../dist/runtime-check-"));
const temp = join(root, "temp");
mkdirSync(temp);
app.setPath("userData", join(root, "session"));
app.setPath("temp", temp);
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temp;
let child;
let sequence = 0;
const pending = new Map();
const timer = setTimeout(() => finish(1, "FAIL: clean runtime timed out"), 90000);
function finish(code, message) { clearTimeout(timer); console.log(message); child?.kill(); app.exit(code); }
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    child.postMessage({ id, method, params });
  });
}
app.whenReady().then(async () => {
  try {
    assert.equal(existsSync(join(temp, "xeapi_public_key")), false);
    child = utilityProcess.fork(process.argv[2] || join(__dirname, "../out/main/music-worker.js"), [], { stdio: "ignore" });
    child.on("message", ({ id, result }) => {
      const item = pending.get(id); if (!item) return; pending.delete(id);
      result.ok ? item.resolve(result.data) : item.reject(new Error(result.error));
    });
    const key = await call("login_qr_key");
    assert.ok(key.data?.unikey);
    for (let i = 0; i < 3; i++) {
      const state = await call("login_qr_check", { key: key.data.unikey, noCookie: true });
      assert.equal(state.code, 801);
    }
    console.log("PASS: clean runtime QR creation and three waiting polls");
    const response = await call("song_url_v1", { id: "33894312", level: "standard", unblock: "false", cookie: "" });
    assert.equal(response.code, 200);
    assert.ok(response.data?.some((song) => song.url));
    assert.equal(existsSync(join(temp, "xeapi_public_key")), false);
    finish(0, "PASS: real playback URL returned without xeapi key (no account data used)");
  } catch (reason) { finish(1, "FAIL: " + (reason instanceof Error ? reason.message : "runtime check")); }
});

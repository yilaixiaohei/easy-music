// Real utility-process smoke test. No account login or user session access.
const { app, utilityProcess, safeStorage } = require("electron");
const { join } = require("node:path");
const assert = require("node:assert/strict");
let child;
const pending = new Map();
let sequence = 0;
const timeout = setTimeout(
  () => finish(1, "FAIL: smoke test timed out"),
  45000,
);
function finish(code, message) {
  clearTimeout(timeout);
  console.log(message);
  child?.kill();
  app.exit(code);
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    child.postMessage({ id, method, params });
  });
}
app.whenReady().then(async () => {
  try {
    assert.ok(safeStorage.isEncryptionAvailable());
    const encrypted = safeStorage.encryptString("easy-music-smoke-fixture");
    assert.equal(
      safeStorage.decryptString(encrypted),
      "easy-music-smoke-fixture",
    );
    assert.equal(
      encrypted.includes(Buffer.from("easy-music-smoke-fixture")),
      false,
    );
    console.log("PASS: system session encryption round-trip");
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
    child.on("exit", (code) => {
      if (pending.size) finish(1, `FAIL: utility process exited (${code})`);
    });
    const key = await call("login_qr_key");
    assert.equal(typeof key.data?.unikey, "string");
    console.log("PASS: real QR key request");
    const image = await call("login_qr_create", {
      key: key.data.unikey,
      qrimg: true,
    });
    assert.ok(image.data?.qrimg?.startsWith("data:image/png;base64,"));
    console.log("PASS: real QR image generation");
    const state = await call("login_qr_check", {
      key: key.data.unikey,
      noCookie: true,
    });
    assert.equal(state.code, 801);
    console.log("PASS: real QR polling returns waiting-for-scan");
    finish(0, "PASS: authentication service smoke test");
  } catch {
    finish(
      1,
      "FAIL: authentication service smoke test (network, worker or response shape)",
    );
  }
});

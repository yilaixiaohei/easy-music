import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { apiFailure, apiFailureDetails, checkQr, playbackQuery, subscribePlaylist, RequestValidationTokens } from "../src/main/api-runtime";

test("one fresh token serves subscribe body and SDK header without reuse across operations", async () => {
  const require = createRequire(import.meta.url);
  const sdkSubscribe = require("@neteasecloudmusicapienhanced/api/module/playlist_subscribe");
  let issued = 0;
  const tokens = new RequestValidationTokens(async () => `token-${++issued}`);
  const headers: string[] = [];
  const subscribe = (query: Record<string, unknown>) => sdkSubscribe(query, async (_path: string, data: any, options: any) => {
    assert.equal(options.checkToken, "v2");
    const header = await tokens.getToken();
    headers.push(header);
    if (query.t === 1) assert.equal(data.checkToken, header);
    return { body: { code: 200 } };
  });
  await subscribePlaylist(subscribe, tokens.getToken, { id: 123, t: 1 }, tokens);
  assert.equal(issued, 1);
  await subscribePlaylist(subscribe, tokens.getToken, { id: 123, t: 1 }, tokens);
  assert.equal(issued, 2);
  await subscribePlaylist(subscribe, tokens.getToken, { id: 123, t: 2 }, tokens);
  assert.equal(issued, 3);
  assert.deepEqual(headers, ["token-1", "token-2", "token-3"]);
});

test("validation tokens remain isolated during concurrent operations and after rejection", async () => {
  let issued = 0;
  const tokens = new RequestValidationTokens(async () => `token-${++issued}`);
  const seen: string[] = [];
  const submit = async (query: Record<string, unknown>) => {
    await Promise.resolve();
    const header = await tokens.getToken();
    assert.equal(header, query.checkToken);
    seen.push(header);
    throw new Error("fixture rejection");
  };
  const results = await Promise.allSettled([1, 2].map(id => subscribePlaylist(submit, tokens.getToken, { id, t: 1 }, tokens)));
  assert.ok(results.every(result => result.status === "rejected"));
  assert.equal(new Set(seen).size, 2);
  assert.equal(issued, 2);
  assert.equal(await tokens.getToken(), "token-3");
});

test("diagnostic hints never persist raw response text or verification secrets", () => {
  const reason = { body: { code: 405, msg: "操作过于频繁 secret-fixture", verifyUrl: "https://example.com/?token=secret-fixture" } };
  assert.deepEqual(apiFailureDetails(reason), { hint: "too_frequent", challengePresent: true });
  assert.equal(JSON.stringify(apiFailureDetails(reason)).includes("secret-fixture"), false);
  assert.deepEqual(apiFailureDetails({ body: { code: 405 } }), { hint: "empty", challengePresent: false });
});

test("playlist subscribe body uses fresh token while preserving SDK transport and header validation", async () => {
  const require = createRequire(import.meta.url);
  const subscribe = require("@neteasecloudmusicapienhanced/api/module/playlist_subscribe");
  for (const t of [1, 2]) {
    let calls = 0;
    let tokenCalls = 0;
    await subscribePlaylist(query => subscribe(query, async (path: string, data: any, options: any) => {
      calls++;
      assert.equal(path, t === 1 ? "/api/playlist/subscribe" : "/api/playlist/unsubscribe");
      assert.equal(data.id, 123);
      assert.equal(options.crypto, "eapi");
      assert.equal(options.checkToken, "v2");
      assert.equal(options.cookie, "fixture");
      if (t === 1) assert.equal(data.checkToken, "fresh-token-fixture");
      else assert.equal(data.checkToken, undefined);
      return { body: { code: 200 } };
    }), async () => { tokenCalls++; return "fresh-token-fixture"; }, { id: 123, t, cookie: "fixture" });
    assert.equal(calls, 1);
    assert.equal(tokenCalls, t === 1 ? 1 : 0);
  }
});

test("empty subscription validation token prevents sending an invalid write", async () => {
  let calls = 0;
  await assert.rejects(subscribePlaylist(async () => { calls++; return { body: { code: 200 } }; }, async () => "", { id: 123, t: 1 }), /校验暂时不可用/);
  assert.equal(calls, 0);
});

test("playback uses supported eapi transport and preserves requested quality and account", () => {
  assert.deepEqual(playbackQuery({ id: "123", level: "standard", cookie: "fixture" }), {
    id: "123", level: "standard", cookie: "fixture", crypto: "eapi", unblock: "false",
  });
});
test("QR adapter preserves original network error instead of SDK ReferenceError", async () => {
  const failure = { status: 502, body: { msg: "timeout" } };
  await assert.rejects(checkQr(async () => { throw failure; }, {}, "fixture-key"), (reason) => reason === failure);
});
test("QR adapter preserves waiting status and login cookies", async () => {
  const response = await checkQr(async (path, data, options) => {
    assert.equal(path, "/api/login/qrcode/client/login");
    assert.deepEqual(data, { key: "fixture-key", type: 3 });
    assert.equal(options.timeout, 12000);
    return { body: { code: 803 }, cookie: ["fixture=one", "fixture2=two"] };
  }, { timeout: 12000 }, "fixture-key");
  assert.equal(response.body.cookie, "fixture=one;fixture2=two");
  assert.equal(response.body.code, 803);
});
test("error classifier separates authentication and limits; never returns sensitive upstream text", () => {
  assert.equal(apiFailure({ body: { code: 301 } }).category, "authentication");
  assert.equal(apiFailure({ body: { code: 429 } }).retry, false);
  assert.equal(apiFailure({ body: { code: 405 } }).category, "risk_control");
  assert.equal(apiFailure({ body: { code: 405 } }).retry, false);
  assert.ok(!apiFailure({ body: { code: 405 } }).message.includes("安全验证"));
  assert.match(apiFailure({ body: { code: 405, msg: "操作频繁" } }).message, /操作频繁/);
  assert.equal(apiFailure({ status: 429 }).category, "rate_limit");
  assert.equal(apiFailure({ status: 502 }).retry, true);
  assert.equal(apiFailure(new Error("xeapi public key is missing")).category, "service");
  assert.ok(!JSON.stringify(apiFailure(new Error("secret-cookie-fixture"))).includes("secret-cookie-fixture"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthController, type CallApi } from "../src/main/auth-controller";
import type { SavedSession, SessionStorage } from "../src/main/session-store";

function storage(
  initial: SavedSession | null = null,
): SessionStorage & { value: SavedSession | null; writes: number } {
  return {
    value: initial,
    writes: 0,
    read() {
      return this.value;
    },
    write(value) {
      this.value = value;
      this.writes++;
    },
    clear() {
      this.value = null;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const ticketApi = (method: string) =>
  method === "login_qr_key"
    ? { data: { unikey: "test-key" } }
    : { data: { qrimg: "data:image/png;base64,test" } };
const profile = {
  userId: 123,
  nickname: "测试用户",
  avatarUrl: "http://p1.music.126.net/avatar.jpg",
};

test("关闭登录面板后，未完成的二维码请求不能生成有效票据", async () => {
  const response = deferred<Record<string, any>>();
  const auth = new AuthController(() => response.promise, storage());
  const creating = auth.createQr();
  auth.cancelQr();
  response.resolve(ticketApi("login_qr_key"));
  await assert.rejects(creating, /取消/);
  assert.deepEqual(await auth.checkQr(), { status: "cancelled" });
});

test("重复轮询合并为一个请求，取消后的成功响应不得写入会话", async () => {
  const response = deferred<Record<string, any>>();
  const saved = storage();
  let polls = 0;
  const call: CallApi = async (method) => {
    if (method === "login_qr_check") {
      polls++;
      return response.promise;
    }
    return ticketApi(method);
  };
  const auth = new AuthController(call, saved);
  await auth.createQr();
  const first = auth.checkQr();
  const second = auth.checkQr();
  assert.equal(first, second);
  assert.equal(polls, 1);
  auth.cancelQr();
  response.resolve({ code: 803, cookie: "MUSIC_U=test-secret" });
  assert.deepEqual(await first, { status: "cancelled" });
  assert.equal(saved.writes, 0);
  assert.equal((await auth.session()).authenticated, false);
});

test("成功登录保存会话，但返回给界面的数据不含 Cookie", async () => {
  const saved = storage();
  const auth = new AuthController(async (method) => {
    if (method === "login_qr_check")
      return { code: 803, cookie: "MUSIC_U=test-secret" };
    if (method === "login_status") return { data: { code: 200, profile } };
    return ticketApi(method);
  }, saved);
  await auth.createQr();
  const result = await auth.checkQr();
  assert.equal(result.status, "success");
  assert.equal(result.session?.profile?.nickname, profile.nickname);
  assert.equal(result.session?.profile?.avatarUrl.startsWith("https:"), true);
  assert.equal(saved.value?.cookie, "MUSIC_U=test-secret");
  assert.equal(JSON.stringify(result).includes("test-secret"), false);
});

test("恢复会话时网络错误保留凭证，明确失效时清除凭证", async () => {
  const saved = storage({ cookie: "MUSIC_U=test-secret", profile });
  let offline = true;
  const auth = new AuthController(async () => {
    if (offline) throw new Error("offline");
    return { data: { code: 200, profile: null } };
  }, saved);
  const offlineSession = await auth.session();
  assert.equal(offlineSession.authenticated, true);
  assert.match(offlineSession.warning!, /保留/);
  assert.ok(saved.value);
  offline = false;
  assert.equal((await auth.session()).authenticated, false);
  assert.equal(saved.value, null);
});

test("退出登录后，尚未结束的会话校验不得恢复用户", async () => {
  const response = deferred<Record<string, any>>();
  const saved = storage({ cookie: "MUSIC_U=test-secret", profile });
  const auth = new AuthController(
    async (method) => (method === "login_status" ? response.promise : {}),
    saved,
  );
  const restoring = auth.session();
  assert.equal((await auth.logout()).authenticated, false);
  response.resolve({ data: { code: 200, profile } });
  assert.equal((await restoring).authenticated, false);
  assert.equal(saved.value, null);
});

test("手机确认后关闭面板，仍在加载的资料响应不得提交登录", async () => {
  const response = deferred<Record<string, any>>();
  const entered = deferred<void>();
  const saved = storage();
  const auth = new AuthController(async (method) => {
    if (method === "login_qr_check")
      return { code: 803, cookie: "MUSIC_U=test-secret" };
    if (method === "login_status") {
      entered.resolve();
      return response.promise;
    }
    return ticketApi(method);
  }, saved);
  await auth.createQr();
  const checking = auth.checkQr();
  await entered.promise;
  auth.cancelQr();
  response.resolve({ data: { code: 200, profile } });
  assert.equal((await checking).status, "cancelled");
  assert.equal(saved.value, null);
  assert.equal(saved.writes, 0);
});

test("保存失败时仍可完成本次登录，并明确提示重新启动后需扫码", async () => {
  const saved = storage();
  saved.write = () => {
    throw new Error("disk full");
  };
  const auth = new AuthController(async (method) => {
    if (method === "login_qr_check")
      return { code: 803, cookie: "MUSIC_U=test-secret" };
    if (method === "login_status") return { data: { code: 200, profile } };
    return ticketApi(method);
  }, saved);
  await auth.createQr();
  const result = await auth.checkQr();
  assert.equal(result.session?.authenticated, true);
  assert.match(result.session?.warning ?? "", /未能安全保存/);
});

test("过期二维码不写入任何会话", async () => {
  const saved = storage();
  const auth = new AuthController(
    async (method) =>
      method === "login_qr_check" ? { code: 800 } : ticketApi(method),
    saved,
  );
  await auth.createQr();
  assert.deepEqual(await auth.checkQr(), { status: "expired" });
  assert.equal(saved.value, null);
});

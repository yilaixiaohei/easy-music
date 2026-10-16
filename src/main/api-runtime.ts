import { AsyncLocalStorage } from "node:async_hooks";

type Response = { body: Record<string, any>; cookie?: string[] };
type Request = (path: string, data: Record<string, unknown>, options: Record<string, unknown>) => Promise<Response>;

// One freshly issued token per operation, shared only by its body and header.
// Other concurrent requests and subsequent operations still fetch their own.
export class RequestValidationTokens {
  private scope = new AsyncLocalStorage<string>();
  constructor(private fetch: () => Promise<string>) {}
  readonly getToken = (): Promise<string> => {
    const token = this.scope.getStore();
    return token ? Promise.resolve(token) : this.fetch();
  };
  run<T>(token: string, operation: () => T): T {
    return this.scope.run(token, operation);
  }
}

// SDK 4.41.1 defaults to xeapi, whose separately registered key is absent in a
// fresh portable install. The same official endpoint supports SDK's eapi mode.
export function playbackQuery(params: Record<string, unknown>): Record<string, unknown> {
  return { ...params, crypto: "eapi", unblock: "false" };
}

// The SDK refreshes its header token but defaults the subscribe body to a
// hard-coded APP_CONF.checkToken. Supply a fresh token to that body as well.
// Leave the SDK's own transport and header validation enabled, sharing this
// operation's token rather than issuing a second token for the header.
export async function subscribePlaylist(
  subscribe: (query: Record<string, unknown>) => Promise<Response>,
  getToken: () => Promise<string>,
  params: Record<string, unknown>,
  tokens?: RequestValidationTokens,
): Promise<Response> {
  if (params.t !== 1) return subscribe(params);
  const checkToken = await getToken();
  if (!checkToken) throw new Error("歌单收藏校验暂时不可用，请稍后重试。");
  const submit = () => subscribe({ ...params, checkToken });
  return tokens ? tokens.run(checkToken, submit) : submit();
}

// Only generic response hints and field-presence flags are safe to persist.
// Do not log raw messages, challenge links, cookies or validation tokens.
export function apiFailureDetails(reason: unknown) {
  const body = (reason as { body?: Record<string, unknown> } | null)?.body;
  const text = typeof body?.msg === "string" ? body.msg : typeof body?.message === "string" ? body.message : "";
  const hint = /频繁|太快|频率/.test(text) ? "too_frequent"
    : /验证|验证码|校验/.test(text) ? "verification"
    : /已收藏|重复收藏/.test(text) ? "already_saved"
    : /登录|登陆/.test(text) ? "authentication"
    : text ? "other" : "empty";
  return {
    hint,
    challengePresent: !!body && ["captcha", "captchaId", "captchaToken", "verifyUrl", "verifyId", "verifyType"].some(key => body[key] !== undefined && body[key] !== null),
  };
}

// SDK 4.41.1's QR catch references an out-of-scope `result`, hiding network errors.
// Keep the same endpoint/options and let the original error reach our classifier.
export async function checkQr(request: Request, options: Record<string, unknown>, key: unknown): Promise<Response> {
  const response = await request("/api/login/qrcode/client/login", { key, type: 3 }, options);
  return { ...response, body: { ...response.body, cookie: (response.cookie ?? []).join(";") } };
}

export function apiFailure(reason: unknown): { category: string; message: string; retry: boolean } {
  const value = reason as { status?: number; body?: { code?: number; msg?: string }; code?: string; message?: string } | null;
  const status = Number(value?.body?.code ?? value?.status);
  const text = String(value?.message ?? value?.body?.msg ?? "");
  if (status === 301 || status === 401) return { category: "authentication", message: "登录状态已失效，请重新扫码登录。", retry: false };
  if (status === 405) return { category: "risk_control", message: apiFailureDetails(reason).hint === "too_frequent"
    ? "网易云以“操作频繁”为由拒绝了本次请求，请稍后再试。"
    : "网易云拒绝了本次操作，请稍后重试。", retry: false };
  if (status === 429) return { category: "rate_limit", message: "网易云提示请求过于频繁，请稍后重试。", retry: false };
  if (status === 502 || status === 503 || status === 504 || /ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|timeout|socket hang up/i.test(text + value?.code)) {
    return { category: "network", message: "连接网易云音乐失败，请检查网络后重试。", retry: true };
  }
  return { category: "service", message: "网易云接口请求失败，请稍后重试。", retry: false };
}

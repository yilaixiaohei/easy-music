import type {
  AccountSession,
  QrResult,
  QrTicket,
  UserProfile,
} from "../shared/contracts";
import type { SavedSession, SessionStorage } from "./session-store";

export type CallApi = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<Record<string, any>>;
const guest = (): AccountSession => ({ authenticated: false, profile: null });

function profileFrom(data: any): UserProfile | null {
  if (
    !data ||
    !Number.isSafeInteger(data.userId) ||
    typeof data.nickname !== "string"
  )
    return null;
  return {
    userId: data.userId,
    nickname: data.nickname,
    avatarUrl:
      typeof data.avatarUrl === "string" && /^https?:\/\//.test(data.avatarUrl)
        ? data.avatarUrl.replace(/^http:/, "https:")
        : "",
  };
}

export class AuthController {
  private saved: SavedSession | null = null;
  private ticket: { key: string; expiresAt: number } | null = null;
  private epoch = 0;
  private checking: Promise<QrResult> | null = null;
  private warning: string | undefined;

  constructor(
    private call: CallApi,
    private storage: SessionStorage,
  ) {
    try {
      this.saved = storage.read();
    } catch (error) {
      this.warning = (error as Error).message;
    }
  }

  private snapshot(): AccountSession {
    return {
      authenticated: Boolean(this.saved),
      profile: this.saved?.profile ?? null,
      warning: this.warning,
    };
  }

  // Internal only: credentials never cross the renderer IPC boundary.
  musicCookie(): string {
    return this.saved?.cookie ?? "";
  }
  userId(): number | null {
    return this.saved?.profile?.userId ?? null;
  }

  private persist(): void {
    try {
      if (this.saved) this.storage.write(this.saved);
      this.warning = undefined;
    } catch {
      this.warning = "登录成功，但会话未能安全保存；关闭应用后需重新扫码。";
    }
  }

  async session(): Promise<AccountSession> {
    if (!this.saved) return this.snapshot();
    const epoch = this.epoch;
    const cookie = this.saved.cookie;
    try {
      const body = await this.call("login_status", { cookie });
      if (epoch !== this.epoch || this.saved?.cookie !== cookie)
        return this.snapshot();
      const data = body.data ?? body;
      if (data.code !== 200)
        throw new Error("暂时无法验证登录状态，请稍后重试。");
      const profile = profileFrom(data.profile);
      if (!profile) {
        this.saved = null;
        this.storage.clear();
        this.warning = "登录已失效，请重新扫码。";
      } else {
        this.saved.profile = profile;
        this.persist();
      }
    } catch {
      if (epoch === this.epoch)
        this.warning =
          "暂时无法验证登录状态，已保留本地会话，请检查网络后重试。";
    }
    return this.snapshot();
  }

  async createQr(): Promise<QrTicket> {
    this.cancelQr();
    const epoch = this.epoch;
    const body = await this.call("login_qr_key");
    if (epoch !== this.epoch) throw new Error("二维码请求已取消。");
    const key = body.data?.unikey;
    if (typeof key !== "string" || !key)
      throw new Error("二维码获取失败，请重试。");
    const qr = await this.call("login_qr_create", {
      key,
      qrimg: true,
      platform: "pc",
    });
    if (epoch !== this.epoch) throw new Error("二维码请求已取消。");
    const image = qr.data?.qrimg;
    if (
      typeof image !== "string" ||
      !image.startsWith("data:image/png;base64,")
    ) {
      throw new Error("二维码生成失败，请重试。");
    }
    const expiresAt = Date.now() + 180000;
    this.ticket = { key, expiresAt };
    return { image, expiresAt };
  }

  cancelQr(): void {
    this.epoch++;
    this.ticket = null;
    this.checking = null;
  }

  checkQr(): Promise<QrResult> {
    if (this.checking) return this.checking;
    const task = this.checkOnce();
    this.checking = task;
    void task
      .finally(() => {
        if (this.checking === task) this.checking = null;
      })
      .catch(() => {});
    return task;
  }

  private async checkOnce(): Promise<QrResult> {
    const ticket = this.ticket;
    if (!ticket) return { status: "cancelled" };
    if (Date.now() >= ticket.expiresAt) {
      this.ticket = null;
      return { status: "expired" };
    }
    const epoch = this.epoch;
    const body = await this.call("login_qr_check", {
      key: ticket.key,
      noCookie: true,
    });
    if (epoch !== this.epoch) return { status: "cancelled" };
    if (body.code === 800) {
      this.ticket = null;
      return { status: "expired" };
    }
    if (body.code === 801) return { status: "waiting" };
    if (body.code === 802) return { status: "confirming" };
    if (
      body.code !== 803 ||
      typeof body.cookie !== "string" ||
      !body.cookie.includes("MUSIC_U=")
    ) {
      throw new Error("扫码状态获取失败，请重试。");
    }
    let profile: UserProfile | null = null;
    let warning: string | undefined;
    try {
      const response = await this.call("login_status", { cookie: body.cookie });
      const data = response.data ?? response;
      if (data.code === 200 && !data.profile) {
        if (epoch === this.epoch) this.ticket = null;
        return { status: epoch === this.epoch ? "expired" : "cancelled" };
      }
      profile = profileFrom(data.profile);
      if (!profile)
        warning = "登录成功，暂时无法加载账号资料，可稍后重新检查。";
    } catch {
      warning = "登录成功，暂时无法加载账号资料，可稍后重新检查。";
    }
    // Commit only when the panel still owns this QR attempt, including during profile loading.
    if (epoch !== this.epoch) return { status: "cancelled" };
    this.ticket = null;
    this.saved = { cookie: body.cookie, profile };
    this.persist();
    this.warning =
      [this.warning, warning].filter(Boolean).join(" ") || undefined;
    return { status: "success", session: this.snapshot() };
  }

  async logout(): Promise<AccountSession> {
    this.cancelQr();
    const cookie = this.saved?.cookie;
    this.saved = null;
    this.warning = undefined;
    try {
      this.storage.clear();
    } catch {
      return { ...guest(), warning: "本地会话文件清理失败，请重试退出登录。" };
    }
    // Local logout completes even if the upstream service is unavailable.
    if (cookie) void this.call("logout", { cookie }).catch(() => {});
    return guest();
  }
}

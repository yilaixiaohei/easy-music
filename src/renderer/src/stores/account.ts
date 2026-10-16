import { defineStore } from "pinia";
import { ref } from "vue";
import type { AccountSession, Result } from "../../../shared/contracts";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const useAccountStore = defineStore("account", () => {
  const session = ref<AccountSession>({ authenticated: false, profile: null });
  const restoring = ref(false);
  const qrPhase = ref<
    | "idle"
    | "loading"
    | "waiting"
    | "confirming"
    | "expired"
    | "success"
    | "error"
  >("idle");
  const qrImage = ref("");
  const expiresAt = ref(0);
  const error = ref("");
  let generation = 0;
  let sessionGeneration = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pollFailures = 0;

  async function restore(): Promise<void> {
    if (!window.desktop || restoring.value) return;
    const current = ++sessionGeneration;
    restoring.value = true;
    try {
      const value = unwrap(await window.desktop.auth.session());
      if (current === sessionGeneration) session.value = value;
    } catch {
      if (current === sessionGeneration)
        session.value.warning = "读取登录状态失败，请稍后重试。";
    } finally {
      if (current === sessionGeneration) restoring.value = false;
    }
  }

  function cancelQr(): void {
    generation++;
    clearTimeout(timer);
    qrImage.value = "";
    qrPhase.value = "idle";
    void window.desktop?.auth.cancelQr().catch(() => {});
  }

  async function createQr(): Promise<void> {
    const current = ++generation;
    clearTimeout(timer);
    pollFailures = 0;
    error.value = "";
    qrImage.value = "";
    qrPhase.value = "loading";
    if (!window.desktop) {
      error.value =
        "请在 Easy Music 桌面窗口中扫码登录。浏览器预览不连接账号服务。";
      qrPhase.value = "error";
      return;
    }
    try {
      const ticket = unwrap(await window.desktop.auth.createQr());
      if (current !== generation) return;
      qrImage.value = ticket.image;
      expiresAt.value = ticket.expiresAt;
      qrPhase.value = "waiting";
      timer = setTimeout(() => void poll(current), 2000);
    } catch (reason) {
      if (current !== generation) return;
      error.value =
        reason instanceof Error ? reason.message : "二维码获取失败，请重试。";
      qrPhase.value = "error";
    }
  }

  async function poll(current: number): Promise<void> {
    if (current !== generation || !window.desktop) return;
    if (Date.now() >= expiresAt.value) {
      qrPhase.value = "expired";
      return;
    }
    try {
      const result = unwrap(await window.desktop.auth.checkQr());
      if (current !== generation) return;
      pollFailures = 0;
      error.value = "";
      if (result.status === "success" && result.session) {
        sessionGeneration++;
        restoring.value = false;
        session.value = result.session;
        qrPhase.value = "success";
        return;
      }
      if (result.status === "expired" || result.status === "cancelled") {
        qrPhase.value = "expired";
        return;
      }
      qrPhase.value = result.status === "confirming" ? "confirming" : "waiting";
      timer = setTimeout(() => void poll(current), 2000);
    } catch (reason) {
      if (current !== generation) return;
      if (Date.now() >= expiresAt.value) {
        qrPhase.value = "expired";
        return;
      }
      if (++pollFailures <= 3) {
        error.value = "连接暂时中断，正在重新检查扫码状态…";
        timer = setTimeout(() => void poll(current), 2000 * pollFailures);
        return;
      }
      error.value =
        reason instanceof Error ? reason.message : "扫码状态获取失败，请重试。";
      qrPhase.value = "error";
    }
  }

  async function logout(): Promise<void> {
    if (!window.desktop) return;
    cancelQr();
    sessionGeneration++;
    restoring.value = false;
    try {
      session.value = unwrap(await window.desktop.auth.logout());
    } catch {
      session.value.warning = "退出登录失败，请重试。";
    }
  }

  return {
    session,
    restoring,
    qrPhase,
    qrImage,
    expiresAt,
    error,
    restore,
    createQr,
    cancelQr,
    logout,
  };
});

import { app, utilityProcess, type UtilityProcess } from "electron";
import { join } from "node:path";
import type { Result } from "../shared/contracts";

interface Pending {
  resolve(value: Record<string, any>): void;
  reject(reason: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class MusicService {
  private child: UtilityProcess | null = null;
  private pending = new Map<number, Pending>();
  private sequence = 0;

  private start(): UtilityProcess {
    if (this.child) return this.child;
    const child = utilityProcess.fork(join(__dirname, "music-worker.js"), [], {
      serviceName: "Easy Music Service",
      stdio: "ignore",
      env: { ...process.env, EASY_MUSIC_LOG_DIRECTORY: app.getPath("logs") },
    });
    this.child = child;
    child.on(
      "message",
      (message: { id: number; result: Result<Record<string, any>> }) => {
        const item = this.pending.get(message.id);
        if (!item) return;
        clearTimeout(item.timer);
        this.pending.delete(message.id);
        if (message.result.ok) item.resolve(message.result.data);
        else item.reject(new Error(message.result.error));
      },
    );
    child.on("exit", () => {
      if (this.child !== child) return;
      this.child = null;
      this.rejectPending("音乐服务已断开，请重试。");
    });
    return child;
  }

  call(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const child = this.start();
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("请求超时，请检查网络后重试。"));
      }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        child.postMessage({ id, method, params });
      } catch {
        this.dispose("音乐服务启动失败，请重试。");
      }
    });
  }

  private rejectPending(message: string): void {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    this.pending.clear();
  }

  dispose(message = "音乐服务已关闭。"): void {
    const child = this.child;
    this.child = null;
    this.rejectPending(message);
    child?.kill();
  }
}

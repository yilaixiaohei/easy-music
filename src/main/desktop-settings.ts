import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DesktopSettings, CacheLimitMB } from "../shared/contracts";

export function validCacheLimit(value: unknown): value is CacheLimitMB {
  return value === null || value === 256 || value === 512 || value === 1024;
}
export function configureCacheLimit(commandLine: { appendSwitch(name: string, value: string): void }, limit: CacheLimitMB) {
  // Zero means Chromium's default, not unlimited. Omit the app's cap instead.
  if (limit !== null) commandLine.appendSwitch('disk-cache-size', String(limit * 1024 * 1024));
}

export class DesktopSettingsStore {
  private value: DesktopSettings = { closeToTray: false, cacheLimitMB: 512 };
  constructor(private directory: string) {
    try {
      const saved = JSON.parse(readFileSync(join(directory, "desktop-settings.json"), "utf8"));
      if (typeof saved.closeToTray === "boolean") this.value.closeToTray = saved.closeToTray;
      if (validCacheLimit(saved.cacheLimitMB)) this.value.cacheLimitMB = saved.cacheLimitMB;
    } catch { /* Missing or corrupt settings keep normal close-to-exit behavior. */ }
  }
  read(): DesktopSettings { return { ...this.value }; }
  setCloseToTray(value: unknown): DesktopSettings {
    if (typeof value !== "boolean") throw new Error("关闭窗口设置无效。");
    return this.write({ ...this.value, closeToTray: value });
  }
  setCacheLimit(value: unknown): DesktopSettings {
    if (!validCacheLimit(value)) throw new Error('缓存上限无效。');
    return this.write({ ...this.value, cacheLimitMB: value });
  }
  private write(next: DesktopSettings): DesktopSettings {
    mkdirSync(this.directory, { recursive: true });
    const file = join(this.directory, "desktop-settings.json");
    writeFileSync(`${file}.tmp`, JSON.stringify(next), "utf8");
    renameSync(`${file}.tmp`, file);
    this.value = next;
    return this.read();
  }
}

interface TrayWindow {
  hide(): void;
  show(): void;
  focus(): void;
  restore(): void;
  isMinimized(): boolean;
}
export class CloseToTrayController {
  private quitting = false;
  constructor(private enabled: () => boolean, private trayAvailable: () => boolean) {}
  beforeQuit(): void { this.quitting = true; }
  close(event: { preventDefault(): void }, window: TrayWindow): void {
    if (!this.quitting && this.enabled() && this.trayAvailable()) {
      event.preventDefault();
      window.hide();
    }
  }
  show(window: TrayWindow): void {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}

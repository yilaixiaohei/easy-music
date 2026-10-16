import type { Result } from "../../shared/contracts";
export function desktop() {
  if (!window.desktop)
    throw new Error("请在 Easy Music 桌面窗口中使用此功能。");
  return window.desktop;
}
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "加载失败，请稍后重试。";
}

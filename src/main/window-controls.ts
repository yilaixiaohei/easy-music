import type { WindowState } from "../shared/contracts";

interface WindowTarget {
  isMaximized(): boolean;
  isFocused(): boolean;
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  close(): void;
  isDestroyed(): boolean;
}
export function windowState(window: WindowTarget): WindowState {
  return { maximized: window.isMaximized(), focused: window.isFocused() };
}
export function controlWindow(
  window: WindowTarget,
  action: unknown,
): WindowState {
  if (action === "minimize") window.minimize();
  else if (action === "toggle-maximize") {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  } else if (action === "close") {
    // Let invoke return before the sender window is destroyed.
    setImmediate(() => { if (!window.isDestroyed()) window.close(); });
  } else throw new Error("无效的窗口操作。");
  return windowState(window);
}

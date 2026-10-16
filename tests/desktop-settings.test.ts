import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CloseToTrayController, DesktopSettingsStore, configureCacheLimit } from "../src/main/desktop-settings";

test("关闭策略保存后重启恢复，无效设置不覆盖已保存值", () => {
  const directory = mkdtempSync(join(tmpdir(), "easy-music-settings-"));
  try {
    const settings = new DesktopSettingsStore(directory);
    assert.equal(settings.read().closeToTray, false);
    assert.equal(settings.read().cacheLimitMB, 512);
    for (const value of [256, 512, 1024, null] as const) {
      settings.setCacheLimit(value);
      assert.equal(new DesktopSettingsStore(directory).read().cacheLimitMB, value);
    }
    settings.setCacheLimit(256);
    settings.setCloseToTray(true);
    assert.equal(new DesktopSettingsStore(directory).read().cacheLimitMB, 256);
    settings.setCacheLimit(null);
    assert.equal(settings.read().closeToTray, true);
    for (const value of [0, -1, 128, '512', undefined, {}, Number.NaN]) assert.throws(() => settings.setCacheLimit(value));
    assert.equal(settings.read().cacheLimitMB, null);
    assert.equal(new DesktopSettingsStore(directory).read().closeToTray, true);
    assert.throws(() => settings.setCloseToTray("true"));
    assert.equal(settings.read().closeToTray, true);
    writeFileSync(join(directory, 'desktop-settings.json'), JSON.stringify({ closeToTray: true }));
    assert.equal(new DesktopSettingsStore(directory).read().cacheLimitMB, 512);
    writeFileSync(join(directory, 'desktop-settings.json'), JSON.stringify({ closeToTray: true, cacheLimitMB: 0 }));
    assert.equal(new DesktopSettingsStore(directory).read().cacheLimitMB, 512);
    writeFileSync(join(directory, "desktop-settings.json"), "{broken");
    assert.equal(new DesktopSettingsStore(directory).read().closeToTray, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('网络缓存容量转换为 Chromium 启动参数；无限制不传入会被当作默认值的 0', () => {
  for (const value of [256, 512, 1024, null] as const) {
    const calls: string[][] = [];
    configureCacheLimit({ appendSwitch: (name, value) => { calls.push([name, value]); } }, value);
    assert.deepEqual(calls, value === null ? [] : [['disk-cache-size', String(value * 1024 * 1024)]]);
  }
});

function fixture() {
  const calls: string[] = [];
  return { calls, window: { hide: () => calls.push("hide"), show: () => calls.push("show"),
    focus: () => calls.push("focus"), restore: () => calls.push("restore"), isMinimized: () => true },
    event: { preventDefault: () => calls.push("prevent") } };
}
test("关闭隐藏窗口并可从托盘恢复；退出命令不会再次拦截关闭", () => {
  const f = fixture();
  const policy = new CloseToTrayController(() => true, () => true);
  policy.close(f.event, f.window);
  assert.deepEqual(f.calls, ["prevent", "hide"]);
  policy.show(f.window);
  assert.deepEqual(f.calls.slice(2), ["restore", "show", "focus"]);
  f.calls.length = 0;
  policy.beforeQuit();
  policy.close(f.event, f.window);
  assert.deepEqual(f.calls, []);
});
test("未启用或托盘不可用时不把应用藏成无法退出的后台进程", () => {
  for (const [enabled, available] of [[false, true], [true, false]]) {
    const f = fixture();
    new CloseToTrayController(() => enabled, () => available).close(f.event, f.window);
    assert.deepEqual(f.calls, []);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { configurePortableStorage, portablePaths } from "../src/main/portable";

function temporary(context: { after(callback: () => void): void }) {
  const base = resolve(tmpdir());
  const root = mkdtempSync(join(base, "easy-music-portable-test-"));
  context.after(() => {
    const target = resolve(root);
    if (dirname(target) !== base || !basename(target).startsWith("easy-music-portable-test-")) throw new Error("Refusing to remove an unexpected path");
    rmSync(target, { recursive: true, force: true });
  });
  return root;
}

test("便携版路径始终位于 EXE 同级 data 内，支持空格中文和移动目录", () => {
  for (const folder of [join("D:\\", "Apps", "EasyMusic"), join("D:\\", "音乐应用", "移动后的目录")]) {
    const paths = portablePaths(join(folder, "EasyMusic.exe"));
    assert.equal(paths.data, join(folder, "data"));
    assert.equal(paths.session, join(folder, "data", "session"));
    assert.equal(paths.temp, join(folder, "data", "temp"));
    assert.equal(paths.cache, join(folder, "data", "cache"));
  }
});

test("在启动前重定向所有应用存储、Chromium 缓存和第三方临时文件", (context) => {
  const root = temporary(context);
  const setPaths = new Map<string, string>();
  const switches = new Map<string, string>();
  const environment: NodeJS.ProcessEnv = { TEMP: "old", TMP: "old", TMPDIR: "old" };
  let workingDirectory = "";
  const paths = configurePortableStorage({
    getPath: () => join(root, "EasyMusic.exe"),
    setPath: (name, value) => { assert.ok(existsSync(value)); setPaths.set(name, value); },
    setAppLogsPath: value => { setPaths.set("logs", value); },
    commandLine: { appendSwitch: (name, value) => { switches.set(name, value); } },
  }, environment, value => { workingDirectory = value; });
  assert.equal(setPaths.get("userData"), paths.data);
  assert.equal(setPaths.get("appData"), paths.data);
  assert.equal(setPaths.get("sessionData"), paths.session);
  assert.equal(setPaths.get("temp"), paths.temp);
  assert.equal(setPaths.get("crashDumps"), paths.crashes);
  assert.equal(setPaths.get("logs"), paths.logs);
  assert.equal(switches.get("user-data-dir"), paths.data);
  assert.equal(switches.get("disk-cache-dir"), paths.cache);
  assert.equal(switches.get("log-file"), join(paths.logs, "electron.log"));
  assert.deepEqual(environment, { TEMP: paths.temp, TMP: paths.temp, TMPDIR: paths.temp });
  assert.equal(workingDirectory, paths.data);
});

test("data 路径不可用时明确失败，不退回系统用户目录", (context) => {
  const root = temporary(context);
  writeFileSync(join(root, "data"), "occupied");
  let changed = false;
  assert.throws(() => configurePortableStorage({
    getPath: () => join(root, "EasyMusic.exe"),
    setPath: () => { changed = true; },
    setAppLogsPath: () => { changed = true; },
    commandLine: { appendSwitch: () => { changed = true; } },
  }, {}, () => { changed = true; }));
  assert.equal(changed, false);
});

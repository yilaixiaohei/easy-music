import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { StorageManager } from '../src/main/storage-manager';

async function fixture(context: { after(callback: () => Promise<void>): void }) {
  const base = resolve('build');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, '.storage-test-'));
  context.after(async () => {
    if (dirname(resolve(root)) !== base || !basename(root).startsWith('.storage-test-')) throw new Error('Unexpected test cleanup path');
    await rm(root, { recursive: true, force: true });
  });
  const paths = { data: join(root, 'data'), logs: join(root, 'data/logs'), crashes: join(root, 'data/crashes'), temporary: join(root, 'data/temp') };
  for (const path of Object.values(paths)) await mkdir(path, { recursive: true });
  await writeFile(join(paths.data, 'session.json'), 'login');
  await writeFile(join(paths.data, 'local-history.json'), 'history');
  await writeFile(join(paths.temporary, 'service-key'), 'token');
  await writeFile(join(paths.logs, 'api-errors.log'), 'log');
  await writeFile(join(paths.crashes, 'crash.dmp'), 'dump');
  return { root, paths };
}

test('网络缓存使用 Electron 清理接口，保留登录、历史、临时凭证及诊断日志', async context => {
  const { paths } = await fixture(context);
  let cache = 100;
  const manager = new StorageManager(paths, { getCacheSize: async () => cache, clearCache: async () => { cache = 0; } });
  const before = await manager.info();
  assert.equal(before.cacheBytes, 100);
  assert.equal(before.diagnosticBytes, 7);
  assert.equal(before.temporaryBytes, 5);
  assert.equal(before.totalBytes, 24);
  assert.equal(before.approximate, false);
  const result = await manager.clear('cache');
  assert.equal(result.info.cacheBytes, 0);
  for (const [file, content] of [['session.json', 'login'], ['local-history.json', 'history'], ['temp/service-key', 'token'], ['logs/api-errors.log', 'log']]) {
    assert.equal(await readFile(join(paths.data, file), 'utf8'), content);
  }
});

test('诊断清理只删除日志及崩溃报告文件，保留目录、用户数据和 SDK 临时凭证', async context => {
  const { paths } = await fixture(context);
  const manager = new StorageManager(paths, { getCacheSize: async () => 20, clearCache: async () => { assert.fail('Should not clear HTTP cache'); } });
  const result = await manager.clear('diagnostics');
  assert.equal(result.info.diagnosticBytes, 0);
  assert.equal(result.skippedFiles, 0);
  assert.equal(await readFile(join(paths.data, 'session.json'), 'utf8'), 'login');
  assert.equal(await readFile(join(paths.temporary, 'service-key'), 'utf8'), 'token');
});

test('统计和清理不跟随目录联接，拒绝任意路径及误配的数据根目录', async context => {
  const { root, paths } = await fixture(context);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.txt'), 'keep');
  await symlink(outside, join(paths.logs, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const session = { getCacheSize: async () => 0, clearCache: async () => {} };
  const manager = new StorageManager(paths, session);
  const result = await manager.clear('diagnostics');
  assert.ok(result.skippedFiles > 0);
  assert.equal(result.info.approximate, true);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'keep');
  await assert.rejects(manager.clear('../session'), /无效/);
  assert.throws(() => new StorageManager({ ...paths, logs: paths.data }, session), /配置/);
  assert.throws(() => new StorageManager({ ...paths, crashes: root }, session), /配置/);
});

test('清理串行执行；失败释放锁；开发环境不扫描系统共享临时目录', async context => {
  const { paths } = await fixture(context);
  let reject!: (reason: Error) => void;
  const manager = new StorageManager({ ...paths, temporary: undefined }, {
    getCacheSize: async () => 0,
    clearCache: () => new Promise<void>((_, fail) => { reject = fail; }),
  });
  assert.equal((await manager.info()).temporaryBytes, null);
  const first = manager.clear('cache');
  await assert.rejects(manager.clear('diagnostics'), /正在清理/);
  reject(new Error('cache busy'));
  await assert.rejects(first, /cache busy/);
  assert.equal((await manager.clear('diagnostics')).info.diagnosticBytes, 0);
});

test('管理界面区分保存的缓存上限和本次启动的实际上限，不因改设置而清空缓存', async context => {
  const { paths } = await fixture(context);
  let selected: 256 | null = 256;
  const manager = new StorageManager(paths, {
    getCacheSize: async () => 100,
    clearCache: async () => assert.fail('Changing a preference must not clear cache'),
  }, () => ({ cacheLimitMB: selected, activeCacheLimitMB: 512 }));
  assert.equal((await manager.info()).cacheLimitMB, 256);
  selected = null;
  const info = await manager.info();
  assert.equal(info.cacheLimitMB, null);
  assert.equal(info.activeCacheLimitMB, 512);
  assert.equal(info.cacheBytes, 100);
});

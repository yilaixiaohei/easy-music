import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { acquireDataInstance, canonicalDataDirectory } from '../src/main/single-instance';

function fixture(context: { after(callback: () => void): void }, hasLock = true) {
  const base = resolve('build');
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, '.single-instance-test-'));
  context.after(() => {
    if (dirname(resolve(directory)) !== base || !basename(directory).startsWith('.single-instance-test-')) throw new Error('Unexpected cleanup path');
    rmSync(directory, { recursive: true, force: true });
  });
  const events = new EventEmitter();
  const calls: string[] = [];
  const app = {
    getPath: () => join(directory, 'data'),
    setPath: (_: 'userData', path: string) => { calls.push('path:' + path); },
    requestSingleInstanceLock: () => { calls.push('lock'); return hasLock; },
    on: (event: string, listener: () => void) => events.on(event, listener),
    exit: (code: number) => { calls.push('exit:' + code); },
  };
  return { directory, app, events, calls };
}

test('获取锁前确定实际数据目录；后启动进程立即退出且不注册唤起监听', context => {
  const f = fixture(context, false);
  const instance = acquireDataInstance(f.app, () => assert.fail('Secondary cannot activate itself'));
  assert.equal(instance.primary, false);
  assert.ok(f.calls[0].startsWith('path:'));
  assert.deepEqual(f.calls.slice(1), ['lock', 'exit:0']);
  assert.equal(f.events.listenerCount('second-instance'), 0);
  instance.ready();
});

test('首次初始化期间的多次启动合并唤起；就绪后每次唤起原窗口，退出期间不再唤起', context => {
  const f = fixture(context);
  let activations = 0;
  const instance = acquireDataInstance(f.app, () => activations++);
  assert.equal(instance.primary, true);
  f.events.emit('second-instance'); f.events.emit('second-instance');
  assert.equal(activations, 0);
  instance.ready(); instance.ready();
  assert.equal(activations, 1);
  f.events.emit('second-instance');
  assert.equal(activations, 2);
  f.events.emit('before-quit'); f.events.emit('second-instance');
  assert.equal(activations, 2);
});

test('目录联接指向同一份数据时使用相同锁目录，不同数据目录保持独立', context => {
  const f = fixture(context);
  const data = join(f.directory, 'data');
  mkdirSync(data);
  const alias = join(f.directory, 'alias');
  symlinkSync(data, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(canonicalDataDirectory(data), canonicalDataDirectory(alias));
  assert.notEqual(canonicalDataDirectory(data), canonicalDataDirectory(join(f.directory, 'other')));
  if (process.platform === 'win32') assert.equal(canonicalDataDirectory(data), canonicalDataDirectory(data.toUpperCase()));
});

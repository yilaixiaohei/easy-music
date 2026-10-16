import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, ref } from 'vue';
import { colorsFromPixels, defaultCoverColors } from '../src/renderer/src/player/cover-colors';
import { useCoverBackground } from '../src/renderer/src/player/use-cover-background';

test('封面主色生成浅色背景，透明像素不会污染颜色', () => {
  const colors = colorsFromPixels(new Uint8ClampedArray([220, 30, 40, 255, 0, 255, 0, 0]));
  assert.equal(colors.glow, 'rgb(247, 201, 203)');
  assert.deepEqual(colorsFromPixels(new Uint8ClampedArray([0, 0, 0, 0])), defaultCoverColors);
  assert.deepEqual(colorsFromPixels(new Uint8ClampedArray()), defaultCoverColors);
});

test('切歌后迟到的取色和关闭歌词页后的结果不能覆盖当前背景', async () => {
  const cover = ref<string | undefined>('fixture-old');
  const scope = effectScope();
  const pending = new Map<string, (value: typeof defaultCoverColors) => void>();
  const style = scope.run(() => useCoverBackground(() => cover.value, url => new Promise(resolve => pending.set(url, resolve))))!;
  cover.value = 'fixture-current';
  pending.get('fixture-current')!({ glow: 'current', middle: 'current', edge: 'current' });
  await Promise.resolve();
  pending.get('fixture-old')!({ glow: 'old', middle: 'old', edge: 'old' });
  await Promise.resolve();
  assert.equal(style.value['--lyrics-glow'], 'current');
  cover.value = 'fixture-closed';
  cover.value = undefined;
  pending.get('fixture-closed')!({ glow: 'closed', middle: 'closed', edge: 'closed' });
  await Promise.resolve();
  assert.equal(style.value['--lyrics-glow'], defaultCoverColors.glow);
  scope.stop();
});

test('取色加载失败保持默认背景', async () => {
  const scope = effectScope();
  const style = scope.run(() => useCoverBackground(() => 'fixture-failure', async () => { throw new Error('CORS'); }))!;
  await Promise.resolve();
  assert.equal(style.value['--lyrics-glow'], defaultCoverColors.glow);
  scope.stop();
});

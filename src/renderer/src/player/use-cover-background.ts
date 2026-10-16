import { computed, onScopeDispose, ref, watch } from 'vue';
import { defaultCoverColors, readCoverColors, type CoverColors } from './cover-colors';

const cache = new Map<string, CoverColors>();
export function useCoverBackground(cover: () => string | undefined, load = readCoverColors) {
  const colors = ref({ ...defaultCoverColors });
  let generation = 0;
  watch(cover, async value => {
    const current = ++generation;
    colors.value = { ...defaultCoverColors };
    if (!value) return;
    const cached = cache.get(value);
    if (cached) { colors.value = cached; return; }
    try {
      const result = await load(value);
      if (current !== generation) return;
      cache.set(value, result);
      if (cache.size > 40) cache.delete(cache.keys().next().value!);
      colors.value = result;
    } catch { /* CORS/network failures keep the readable default background. */ }
  }, { immediate: true, flush: 'sync' });
  onScopeDispose(() => generation++);
  return computed(() => ({ '--lyrics-glow': colors.value.glow, '--lyrics-middle': colors.value.middle, '--lyrics-edge': colors.value.edge }));
}

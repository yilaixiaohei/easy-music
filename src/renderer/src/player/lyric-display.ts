export const lyricFontMin = 14;
export const lyricFontMax = 32;
const key = 'easy-music:lyric-display-v1';
export interface LyricDisplay { showTranslation: boolean; fontSize: number }
export function normalizeLyricDisplay(value: unknown): LyricDisplay {
  const data = value as Partial<LyricDisplay> | null;
  return {
    showTranslation: data?.showTranslation === true,
    fontSize: typeof data?.fontSize === 'number' && Number.isFinite(data.fontSize)
      ? Math.min(lyricFontMax, Math.max(lyricFontMin, Math.round(data.fontSize))) : 19,
  };
}
export function readLyricDisplay(): LyricDisplay {
  try { return normalizeLyricDisplay(JSON.parse(localStorage.getItem(key) ?? 'null')); }
  catch { return normalizeLyricDisplay(null); }
}
export function saveLyricDisplay(value: LyricDisplay): void {
  try { localStorage.setItem(key, JSON.stringify(normalizeLyricDisplay(value))); }
  catch { /* Display controls still work if storage is unavailable. */ }
}

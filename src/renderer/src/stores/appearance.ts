import { ref, watch } from 'vue';
import { defineStore } from 'pinia';

export const useAppearanceStore = defineStore('appearance', () => {
  let saved: string | null = null;
  try { saved = localStorage.getItem('easy-music:lyrics-style'); } catch { /* Storage may be unavailable. */ }
  const lyricsStyle = ref(saved === 'classic' ? 'classic' : 'immersive');
  watch(lyricsStyle, value => {
    try { localStorage.setItem('easy-music:lyrics-style', value); } catch { /* Keep the session preference. */ }
  });
  return { lyricsStyle };
});

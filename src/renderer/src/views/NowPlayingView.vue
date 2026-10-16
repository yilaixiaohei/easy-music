<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Music2, LoaderCircle, RefreshCw, LocateFixed, Type, Plus, Minus } from "@lucide/vue";
import { desktop, errorMessage, unwrap } from "../api";
import { usePlayerStore } from "../stores/player";
import { useAppearanceStore } from '../stores/appearance';
import ImmersiveControls from '../components/ImmersiveControls.vue';
import { restoreFocus } from '../focus';
import { currentLyricIndex, parseLyrics } from "../player/lyrics";
import { readLyricDisplay, saveLyricDisplay, lyricFontMin, lyricFontMax } from "../player/lyric-display";
const player = usePlayerStore();
const appearance = useAppearanceStore();
const coverSource = computed(() => {
  const source = player.state.song?.cover;
  if (!source) return '';
  try {
    const url = new URL(source);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      url.searchParams.set('param', '1000y1000');
      return url.href;
    }
  } catch { /* Let the image element handle local sources. */ }
  return source;
});
const lyrics = ref<ReturnType<typeof parseLyrics>>({ lines: [], plain: "" });
const loading = ref(false);
const error = ref("");
const instrumental = ref(false);
const following = ref(true);
const viewport = ref<HTMLElement | null>(null);
const display = readLyricDisplay();
const showTranslation = ref(display.showTranslation);
const fontSize = ref(display.fontSize);
const fontOpen = ref(false);
const tools = ref<HTMLElement | null>(null);
const fontButton = ref<HTMLButtonElement | null>(null);
const hasTranslation = computed(() => lyrics.value.lines.some(line => line.translation.trim()));
function closeFont() { fontOpen.value = false; restoreFocus(fontButton.value); }
function toolKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && fontOpen.value) { event.stopPropagation(); event.preventDefault(); closeFont(); }
}
function outsideTools(event: PointerEvent) {
  if (event.target instanceof Node && !tools.value?.contains(event.target)) fontOpen.value = false;
}
function changeFont(event: Event) { fontSize.value = Number((event.target as HTMLInputElement).value); }
function adjustFont(delta: number) { fontSize.value = Math.min(lyricFontMax, Math.max(lyricFontMin, fontSize.value + delta)); }
onMounted(() => document.addEventListener('pointerdown', outsideTools));
let resizeObserver: ResizeObserver | undefined;
onMounted(() => { resizeObserver = new ResizeObserver(() => { if (following.value) scrollToActive(); }); if (viewport.value) resizeObserver.observe(viewport.value); });
watch(viewport, value => { resizeObserver?.disconnect(); if (value) resizeObserver?.observe(value); });
const active = computed(() =>
  currentLyricIndex(
    lyrics.value.lines,
    player.state.position + player.state.lyricOffset,
  ),
);
let generation = 0;
async function load() {
  const current = ++generation;
  lyrics.value = { lines: [], plain: "" };
  error.value = "";
  instrumental.value = false;
  following.value = true;
  fontOpen.value = false;
  const id = player.state.song?.id;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const data = unwrap(await desktop().music.lyric(id));
    if (current === generation) {
      lyrics.value = parseLyrics(data.original, data.translated);
      instrumental.value = data.instrumental;
    }
  } catch (reason) {
    if (current === generation) error.value = errorMessage(reason);
  } finally {
    if (current === generation) loading.value = false;
  }
}
function scrollToActive() {
  const target = viewport.value?.querySelector<HTMLElement>(
    `[data-lyric-index="${active.value}"]`,
  );
  if (target && viewport.value)
    viewport.value.scrollTo({
      top:
        target.offsetTop -
        viewport.value.clientHeight / 2 +
        target.clientHeight / 2,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
}
async function follow() {
  following.value = true;
  await nextTick();
  scrollToActive();
}
watch(
  () => player.state.song?.id,
  () => void load(),
  { immediate: true },
);
watch([active, loading], async () => {
  if (following.value) {
    await nextTick();
    scrollToActive();
  }
});
watch([showTranslation, fontSize], async () => {
  saveLyricDisplay({ showTranslation: showTranslation.value, fontSize: fontSize.value });
  await nextTick();
  if (following.value) scrollToActive();
});
onUnmounted(() => { generation++; resizeObserver?.disconnect(); document.removeEventListener('pointerdown', outsideTools); });
</script>
<template>
  <div v-if="!player.state.song" class="page-content">
    <div class="empty-state">
      <LoaderCircle v-if="player.roamingLoading" class="spin" :size="42" />
      <Music2 v-else :size="42" />
      <h2>{{ player.isRoaming ? '让好音乐，带你漫游' : '让音乐从这里开始' }}</h2>
      <p>{{ player.roamingLoading ? '正在寻找适合你的下一首…' : player.isRoaming ? '准备好，再出发。' : '选择一首歌曲，歌词会在这里陪你一起听。' }}</p>
      <button v-if="player.isRoaming && !player.roamingLoading" class="primary-button" @click="player.startRoaming()">重新开启漫游</button>
      <button v-else-if="!player.isRoaming" class="primary-button" @click="player.lyricsOpen = false">回到音乐库</button>
    </div>
  </div>
  <div v-else class="now-playing-view">
    <section class="album-display">
      <div class="large-cover">
        <img
          v-if="player.state.song.cover"
          :src="coverSource"
          alt="当前歌曲封面"
        /><Music2 v-else :size="80" />
      </div>
      <ImmersiveControls v-if="appearance.lyricsStyle === 'immersive'" />
      <template v-else>
      <p class="eyebrow">{{ player.isRoaming ? 'YOUR PERSONAL SOUNDTRACK' : 'NOW PLAYING' }}</p>
      <h1>{{ player.state.song.title }}</h1>
      <p>{{ player.state.song.artists }}</p>
      <small>{{ player.state.song.album }}</small
      ><span v-if="player.state.trial" class="trial-tag">试听片段</span>
      </template>
    </section>
    <section class="lyrics-section" :style="{ '--lyric-font-size': `${fontSize}px` }" aria-label="歌曲歌词">
      <div v-if="loading" class="lyrics-placeholder" role="status">
        <LoaderCircle class="spin" :size="28" />
        <p>正在找寻歌词…</p>
      </div>
      <div v-else-if="error" class="lyrics-placeholder">
        <p>{{ error }}</p>
        <button class="secondary-button" @click="load">
          <RefreshCw :size="14" />重新加载
        </button>
      </div>
      <div
        v-else-if="lyrics.lines.length"
        ref="viewport"
        class="lyrics-scroll"
        @wheel.passive="following = false"
        @touchstart.passive="following = false"
        @pointerdown="following = false"
        @keydown="following = false"
      >
        <button
          v-for="(line, index) in lyrics.lines"
          :key="`${line.time}-${index}`"
          :data-lyric-index="index"
          class="lyric-line"
          :class="{ active: index === active }"
          :style="{ '--lyric-distance': following ? Math.min(4, Math.abs(index - active)) : 0 }"
          :aria-current="index === active ? 'true' : undefined"
          :disabled="
            player.state.trial &&
            (line.time < player.state.lyricOffset ||
              line.time > player.state.lyricOffset + player.state.duration)
          "
          @click="player.seek(line.time - player.state.lyricOffset)"
        >
          <span>{{ line.text }}</span
          ><small v-if="showTranslation && line.translation">{{ line.translation }}</small>
        </button>
      </div>
      <pre v-else-if="lyrics.plain && !instrumental" class="plain-lyrics">{{
        lyrics.plain
      }}</pre>
      <div v-else class="lyrics-placeholder">
        <Music2 :size="36" />
        <p>
          {{ instrumental ? "纯音乐，请欣赏。" : "暂时没有这首歌的歌词。" }}
        </p>
      </div>
      <div v-if="!loading && !error && (lyrics.lines.length || (lyrics.plain && !instrumental))"
        ref="tools" class="lyrics-tools" :class="{ 'is-open': fontOpen }" role="group" aria-label="歌词显示设置" @keydown="toolKeydown">
        <button v-if="hasTranslation" class="lyric-tool-button" :class="{ selected: showTranslation }"
          :aria-pressed="showTranslation" :aria-label="showTranslation ? '隐藏译文' : '显示译文'"
          :title="showTranslation ? '隐藏译文' : '显示译文'" @click="showTranslation = !showTranslation">译</button>
        <button ref="fontButton" class="lyric-tool-button" :class="{ selected: fontOpen }"
          aria-label="歌词字体大小" title="歌词字体大小" :aria-expanded="fontOpen" aria-controls="lyric-font-panel"
          @click="fontOpen = !fontOpen"><Type :size="17" /></button>
        <div v-if="fontOpen" id="lyric-font-panel" class="lyric-font-panel" role="group" aria-label="调整歌词字号">
          <button aria-label="增大歌词字号" title="增大字号" :disabled="fontSize >= lyricFontMax" @click="adjustFont(1)"><Plus :size="15" /></button>
          <input type="range" aria-label="歌词字号" :min="lyricFontMin" :max="lyricFontMax" step="1" :value="fontSize" @input="changeFont" />
          <button aria-label="减小歌词字号" title="减小字号" :disabled="fontSize <= lyricFontMin" @click="adjustFont(-1)"><Minus :size="15" /></button>
          <output>{{ fontSize }}px</output>
        </div>
      </div>
      <button
        v-if="!following && lyrics.lines.length"
        class="follow-lyrics"
        @click="follow"
      >
        <LocateFixed :size="14" />回到当前歌词
      </button>
    </section>
  </div>
</template>

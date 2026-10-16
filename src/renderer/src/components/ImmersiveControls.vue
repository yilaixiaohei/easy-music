<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Play, Pause, Heart, Volume2, VolumeX, LoaderCircle } from '@lucide/vue';
import { usePlayerStore } from '../stores/player';
import { useLibraryStore } from '../stores/library';
import { formatTime } from '../player/queue';
const player = usePlayerStore();
const library = useLibraryStore();
const song = computed(() => player.state.song!);
const modeLabels = { order: '顺序播放', loop: '列表循环', single: '单曲循环', shuffle: '随机播放' };
const modeIcon = computed(() => ({ order: ArrowRight, loop: Repeat, single: Repeat1, shuffle: Shuffle })[player.mode]);
const busy = computed(() => (!player.queue.length && !player.isRoaming) || player.roamingLoading || player.reducing);
function seek(event: Event) { player.seek(Number((event.target as HTMLInputElement).value)); }
const progress = computed(() => `${Math.min(100, Math.max(0, player.state.position / (player.state.duration || 1) * 100))}%`);
</script>
<template>
  <div class="immersive-controls">
    <div class="immersive-metadata">
      <div class="immersive-copy">
        <h1 :title="song.title">{{ song.title }}</h1>
        <p :title="`${song.artists} — ${song.album}`">
          <template v-if="song.artistRefs?.length"><template v-for="(artist, index) in song.artistRefs" :key="artist.id"><span v-if="index"> / </span><RouterLink :to="`/artist/${artist.id}`" @click="player.lyricsOpen = false">{{ artist.name }}</RouterLink></template></template>
          <span v-else>{{ song.artists }}</span><span> — </span>
          <RouterLink v-if="song.albumId" :to="`/album/${song.albumId}`" @click="player.lyricsOpen = false">{{ song.album }}</RouterLink><span v-else>{{ song.album }}</span>
        </p>
      </div>
      <button class="immersive-heart" :aria-label="library.likedIds.has(song.id) ? '取消喜欢当前歌曲' : '喜欢当前歌曲'" :aria-pressed="library.likedIds.has(song.id)" :disabled="library.pending.has(song.id)" @click="library.toggleLike(song)">
        <Heart :size="23" :fill="library.likedIds.has(song.id) ? 'currentColor' : 'none'" />
      </button>
    </div>
    <div class="immersive-transport">
      <button class="immersive-mode" :aria-label="player.isRoaming ? '私人漫游中不可切换播放顺序' : modeLabels[player.mode]" :title="modeLabels[player.mode]" :disabled="player.isRoaming" @click="player.cycleMode"><component :is="modeIcon" /></button>
      <button aria-label="上一首" :disabled="!player.canGoPrevious || player.reducing" @click="player.next(-1)"><SkipBack fill="currentColor" /></button>
      <button class="immersive-play" :aria-label="player.state.wantsPlayback ? '暂停' : '播放'" :disabled="busy" @click="player.toggle">
        <LoaderCircle v-if="player.roamingLoading || (player.state.wantsPlayback && (player.state.phase === 'loading' || player.state.buffering))" class="spin" />
        <Pause v-else-if="player.state.wantsPlayback" fill="currentColor" /><Play v-else fill="currentColor" />
      </button>
      <button aria-label="下一首" :disabled="busy" @click="player.next(1)"><SkipForward fill="currentColor" /></button>
    </div>
    <div class="immersive-timeline">
      <input aria-label="播放进度" type="range" min="0" :max="player.state.duration || 1" step="0.1" :value="player.state.position" :style="{ '--range-progress': progress }" :disabled="player.state.phase === 'loading' || player.state.phase === 'error'" @change="seek" />
      <div><span>{{ formatTime(player.state.position) }}</span><span>−{{ formatTime(Math.max(0, player.state.duration - player.state.position)) }}</span></div>
    </div>
    <div class="immersive-volume">
      <button :aria-label="player.muted ? '取消静音' : '静音'" @click="player.muted = !player.muted"><VolumeX v-if="player.muted || !player.volume" :size="17"/><Volume2 v-else :size="17" /></button>
      <input v-model.number="player.volume" aria-label="音量" type="range" min="0" max="100" :style="{ '--range-progress': `${player.muted ? 0 : player.volume}%` }" />
    </div>
    <p v-if="player.state.trial" class="immersive-status">当前播放试听片段</p>
    <p v-if="player.state.error || player.notice" class="immersive-status" role="status">{{ player.state.error || player.notice }}</p>
  </div>
</template>

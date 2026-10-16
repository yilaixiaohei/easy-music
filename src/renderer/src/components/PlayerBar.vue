<script setup lang="ts">
import { computed } from "vue";
import { useLibraryStore } from "../stores/library";
import {
  Music2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ListMusic,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
  ArrowRight,
  LoaderCircle,
  X,
  Heart,
  Captions,
  ThumbsDown,
  ListPlus,
} from "@lucide/vue";
import { usePlayerStore } from "../stores/player";
import { formatTime } from "../player/queue";
import { usePlaylistActionsStore } from "../stores/playlist-actions";
import QualityPicker from "./QualityPicker.vue";
defineEmits<{ queue: [] }>();
const player = usePlayerStore();
const library = useLibraryStore();
const playlistActions = usePlaylistActionsStore();
const modeLabels = {
  order: "顺序播放",
  loop: "列表循环",
  single: "单曲循环",
  shuffle: "随机播放",
};
const modeIcon = computed(
  () =>
    ({ order: ArrowRight, loop: Repeat, single: Repeat1, shuffle: Shuffle })[
      player.mode
    ],
);
function seek(event: Event) {
  player.seek(Number((event.target as HTMLInputElement).value));
}
</script>
<template>
  <footer class="player">
    <div class="now-playing">
      <button
        class="empty-cover"
        :disabled="!player.state.song"
        aria-label="打开播放详情"
        title="查看歌词"
        @click="player.lyricsOpen = true"
      >
        <img
          v-if="player.state.song?.cover"
          :src="`${player.state.song.cover}?param=120y120`"
          alt=""
        /><Music2 v-else :size="22" />
      </button>
      <div class="now-playing-copy">
        <strong :title="player.state.song?.title">{{
          player.state.song?.title || "让音乐从这里开始"
        }}</strong>
        <p class="player-artist-row" :title="player.state.song?.artists">
          <span class="player-artists artist-links"><template v-if="player.state.song?.artistRefs?.length"><template v-for="(artist, index) in player.state.song.artistRefs" :key="artist.id"><span v-if="index"> / </span><RouterLink :to="`/artist/${artist.id}`" @click="player.lyricsOpen = false">{{ artist.name }}</RouterLink></template></template><template v-else>{{ player.state.song?.artists || "选择一首喜欢的歌" }}</template></span>
          <span v-if="player.state.trial" class="trial-tag">试听</span
          ><QualityPicker v-if="player.state.song" v-model="player.quality" :actual="player.state.level" compact />
        </p>
      </div>
      <button
        v-if="player.state.song"
        class="player-heart"
        :class="{ 'is-liked': library.likedIds.has(player.state.song.id) }"
        :disabled="library.pending.has(player.state.song.id)"
        :aria-label="
          library.likedIds.has(player.state.song.id)
            ? '取消喜欢当前歌曲'
            : '喜欢当前歌曲'
        "
        @click="library.toggleLike(player.state.song)"
      >
        <Heart
          :size="17"
          :fill="
            library.likedIds.has(player.state.song.id) ? 'currentColor' : 'none'
          "
        />
      </button>
    </div>
    <div class="playback">
      <div class="transport">
        <button
          :aria-label="player.isRoaming ? '私人漫游中不可切换播放顺序' : modeLabels[player.mode]"
          :title="player.isRoaming ? '私人漫游中不可切换播放顺序' : modeLabels[player.mode]"
          :disabled="player.isRoaming"
          @click="player.cycleMode"
        >
          <component :is="modeIcon" :size="17" /></button
        ><button
          :disabled="!player.canGoPrevious || player.reducing"
          aria-label="上一首"
          @click="player.next(-1)"
        >
          <SkipBack :size="19" /></button
        ><button
          class="play-button"
          :disabled="(!player.queue.length && !player.isRoaming) || player.roamingLoading || player.reducing"
          :aria-label="player.state.wantsPlayback ? '暂停' : '播放'"
          :title="player.state.wantsPlayback ? '暂停' : '播放'"
          @click="player.toggle"
        >
          <LoaderCircle
            v-if="
              player.state.wantsPlayback &&
              (player.state.phase === 'loading' || player.state.buffering)
              || player.roamingLoading
            "
            :size="18"
            class="spin"
          /><Pause
            v-else-if="player.state.wantsPlayback"
            :size="18"
            fill="currentColor"
          /><Play v-else :size="19" fill="currentColor" /></button
        ><button
          :disabled="(!player.queue.length && !player.isRoaming) || player.roamingLoading || player.reducing"
          aria-label="下一首"
          @click="player.next(1)"
        >
          <SkipForward :size="19" /></button
        ><button
          :aria-label="player.isRoaming ? '减少推荐' : '播放队列'"
          :title="player.isRoaming ? '减少推荐这首歌，并播放下一首' : `播放队列 · ${player.queue.length} 首`"
          :disabled="player.isRoaming && (!player.state.song || player.roamingLoading || player.reducing)"
          @click="player.isRoaming ? player.reduceRecommendation() : $emit('queue')"
        >
          <LoaderCircle v-if="player.reducing" class="spin" :size="19" />
          <ThumbsDown v-else-if="player.isRoaming" :size="19" />
          <ListMusic v-else :size="19" />
        </button>
      </div>
      <div class="timeline">
        <span>{{ formatTime(player.state.position) }}</span
        ><input
          class="seek-slider"
          aria-label="播放进度"
          type="range"
          min="0"
          :max="player.state.duration || 1"
          step="0.1"
          :value="player.state.position"
          :disabled="
            !player.state.song ||
            player.state.phase === 'loading' ||
            player.state.phase === 'error'
          "
          @change="seek"
        /><span>{{ formatTime(player.state.duration) }}</span>
      </div>
    </div>
    <div class="volume">
      <button aria-label="收藏当前歌曲到歌单" title="收藏到歌单" :disabled="!player.state.song" @click="player.state.song && playlistActions.openAdd([player.state.song])"><ListPlus :size="19" /></button>
      <button
        aria-label="查看歌词"
        title="歌词"
        :aria-pressed="player.lyricsOpen"
        @click="player.lyricsOpen = !player.lyricsOpen"
      >
        <Captions :size="19" />
      </button>
      <button
        :aria-label="player.muted ? '取消静音' : '静音'"
        @click="player.muted = !player.muted"
      >
        <VolumeX
          v-if="player.muted || Number(player.volume) === 0"
          :size="18"
        /><Volume2 v-else :size="18" /></button
      ><input
        v-model.number="player.volume"
        aria-label="音量"
        type="range"
        min="0"
        max="100"
      /><span>{{ player.muted ? 0 : player.volume }}%</span>
    </div>
    <div
      v-if="player.state.error || player.notice"
      class="player-notice"
      :class="{ 'notice-error': player.state.error }"
      role="status"
    >
      <span>{{ player.state.error || player.notice }}</span
      ><button v-if="player.state.error" @click="player.toggle">重新播放</button
      ><button v-else aria-label="关闭提示" @click="player.notice = ''">
        <X :size="15" />
      </button>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ListMusic, Play, X, AudioLines } from "@lucide/vue";
import { usePlayerStore } from "../stores/player";
import { formatTime } from "../player/queue";
const player = usePlayerStore();
</script>
<template>
  <h2>
    播放队列 <span class="queue-count">{{ player.queue.length }} 首</span>
  </h2>
  <template v-if="player.queue.length"
    ><div class="queue-toolbar">
      <span>按你的节奏，慢慢听。</span
      ><button @click="player.clear">清空队列</button>
    </div>
    <ul class="queue-list">
      <li
        v-for="song in player.queue"
        :key="song.id"
        :class="{ selected: player.state.song?.id === song.id }"
      >
        <button class="queue-song" @click="player.playSong(song)">
          <AudioLines
            v-if="player.state.song?.id === song.id"
            :size="16"
          /><Play v-else :size="16" /><span
            ><strong>{{ song.title }}</strong
            ><small>{{ song.artists }}</small></span
          ></button
        ><span class="queue-time">{{ formatTime(song.duration) }}</span
        ><button
          :aria-label="`从队列移除 ${song.title}`"
          title="移除"
          @click="player.remove(song.id)"
        >
          <X :size="16" />
        </button>
      </li></ul
  ></template>
  <template v-else
    ><div class="connection-placeholder">
      <ListMusic :size="38" /><span>队列里还没有音乐</span>
    </div>
    <p>搜索并播放歌曲，或把喜欢的歌加入队列。</p></template
  >
</template>

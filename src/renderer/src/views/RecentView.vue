<script setup lang="ts">
import { computed, watch } from "vue";
import { History, Play, Trash2, LoaderCircle } from "@lucide/vue";
import SongList from "../components/SongList.vue";
import { usePlayerStore } from "../stores/player";
import { useAccountStore } from "../stores/account";
import { useRecentStore } from "../stores/recent";
import { useSyncStore } from "../stores/sync";
const player = usePlayerStore();
const account = useAccountStore();
const recent = useRecentStore();
const sync = useSyncStore();
const cloud = computed(() => account.session.authenticated);
const songs = computed(() => cloud.value ? recent.songs : player.history);
watch([() => account.session.profile?.userId, () => sync.revision], () => {
  if (cloud.value) void recent.load(true);
}, { immediate: true });
</script>
<template>
  <div class="page-content">
    <div class="page-heading">
      <div>
        <p class="eyebrow">YOUR LISTENING JOURNEY</p>
        <h1>最近播放</h1>
        <p class="page-subtitle">
          {{ cloud ? '网易云账号的最近播放' : '保存在这台设备上的播放记录' }} · {{ songs.length }} 首
        </p>
      </div>
      <div v-if="songs.length" class="heading-actions">
        <button v-if="!cloud" class="secondary-button" @click="player.clearHistory">
          <Trash2 :size="15" />清空记录</button
        ><button class="primary-button" @click="player.playAll(songs)">
          <Play :size="16" />播放全部
        </button>
      </div>
    </div>
    <div v-if="account.restoring || (cloud && recent.loading && !songs.length)" class="empty-state" role="status"><LoaderCircle class="spin" :size="30" /><p>正在读取最近播放…</p></div>
    <div v-else-if="cloud && recent.error && !songs.length" class="empty-state" role="alert"><History :size="38" /><p>{{ recent.error }}</p><button class="secondary-button" @click="recent.load(true)">重新加载</button></div>
    <template v-else-if="songs.length"><p v-if="cloud && recent.error" class="inline-error" role="alert">{{ recent.error }}</p><SongList :songs="songs" /></template>
    <div v-else class="empty-state">
      <History :size="42" />
      <h2>留住听过的好旋律</h2>
      <p>{{ cloud ? '账号还没有可显示的最近播放记录。' : '歌曲开始播放后会记录在这里，关闭程序后仍会保留。' }}</p>
      <RouterLink class="primary-button" to="/search">去找一首歌</RouterLink>
    </div>
  </div>
</template>

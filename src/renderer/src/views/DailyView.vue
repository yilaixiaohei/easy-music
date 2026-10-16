<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { CalendarDays, LoaderCircle, Play, RefreshCw, ScanLine } from "@lucide/vue";
import type { Song } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "../stores/account";
import { usePlayerStore } from "../stores/player";
import { useSyncStore } from "../stores/sync";
import SongList from "../components/SongList.vue";

defineEmits<{ login: [] }>();
const account = useAccountStore();
const player = usePlayerStore();
const songs = ref<Song[]>([]);
const loading = ref(false);
const error = ref("");
const date = ref(new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" }));
const sync = useSyncStore();
let generation = 0;
async function load(background = false) {
  const current = ++generation;
  if (!background || !account.session.authenticated) songs.value = [];
  date.value = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  error.value = "";
  loading.value = false;
  if (!account.session.authenticated) return;
  loading.value = true;
  try {
    const result = unwrap(await desktop().music.dailySongs());
    if (current === generation) songs.value = result;
  } catch (reason) {
    if (current === generation) error.value = errorMessage(reason);
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(() => account.session.profile?.userId, () => void load(), { immediate: true });
watch(() => sync.revision, () => void load(true));
onUnmounted(() => generation++);
</script>

<template>
  <div class="page-content">
    <div class="page-heading">
      <div>
        <p class="eyebrow">A NEW DAY, A NEW SOUNDTRACK</p>
        <h1>每日推荐</h1>
        <p class="page-subtitle">{{ date }} · 为今天的你而选<span v-if="songs.length"> · {{ songs.length }} 首歌曲</span></p>
      </div>
      <div v-if="account.session.authenticated" class="heading-actions">
        <button v-if="songs.length" class="primary-button" @click="player.playAll(songs)">
          <Play :size="16" />播放全部
        </button>
      </div>
    </div>
    <div v-if="!account.session.authenticated" class="empty-state">
      <CalendarDays :size="42" /><h2>今天的好音乐，在等你</h2>
      <p>扫码登录，开启你的每日推荐。</p>
      <button class="primary-button" @click="$emit('login')"><ScanLine :size="16" />扫码登录</button>
    </div>
    <div v-else-if="loading && !songs.length" class="empty-state compact-state" role="status">
      <LoaderCircle class="spin" :size="30" /><p>正在准备今天的好音乐…</p>
    </div>
    <div v-else-if="error && !songs.length" class="empty-state compact-state" role="alert">
      <CalendarDays :size="38" /><p>{{ error }}</p>
      <button class="secondary-button" @click="load()"><RefreshCw :size="15" />重新加载</button>
    </div>
    <template v-else-if="songs.length"><p v-if="error" class="inline-error" role="alert">{{ error }}</p><SongList :songs="songs" /></template>
    <div v-else class="empty-state compact-state"><CalendarDays :size="38" /><p>今天暂时没有推荐歌曲，稍后再来看看。</p></div>
  </div>
</template>

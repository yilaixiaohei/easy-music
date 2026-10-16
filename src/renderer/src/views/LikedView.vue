<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Heart, LoaderCircle, Play, RefreshCw, ScanLine } from "@lucide/vue";
import { useAccountStore } from "../stores/account";
import { useLibraryStore } from "../stores/library";
import { usePlayerStore } from "../stores/player";
import { useSyncStore } from "../stores/sync";
import SongList from "../components/SongList.vue";
import ActionMenu from "../components/ActionMenu.vue";
defineEmits<{ login: [] }>();
const account = useAccountStore();
const library = useLibraryStore();
const player = usePlayerStore();
const batch = ref(false);
const sync = useSyncStore();
watch(() => sync.revision, () => { void library.loadLikedSongs(true); });
watch(() => account.session.profile?.userId, () => { batch.value = false; });
const likedPlaylist = computed(() => library.writablePlaylists.find(playlist => playlist.specialType === 5));
const menu = computed(() => [
  { label: '批量操作', action: () => { batch.value = true; } },
  { label: '添加全部至播放列表', action: () => { player.enqueueAll(library.likedSongs); library.showMessage('已添加全部歌曲至播放列表。'); } },
]);
watch(
  () => account.session.profile?.userId,
  () => void library.loadLikedSongs(true),
  { immediate: true },
);
</script>
<template>
  <div class="page-content">
    <div v-if="!batch" class="page-heading">
      <div>
        <p class="eyebrow">THE ONES YOU LOVE</p>
        <h1>我喜欢的音乐</h1>
        <p v-if="account.session.authenticated" class="page-subtitle">
          每一次心动，都值得收藏 · {{ library.likedTotal }} 首
        </p>
      </div>
      <div v-if="account.session.authenticated" class="heading-actions">
        <button
          v-if="library.likedSongs.length"
          class="primary-button"
          @click="player.playAll(library.likedSongs)"
        >
          <Play :size="16" />播放全部
        </button>
        <ActionMenu v-if="library.likedSongs.length" label="喜欢的音乐更多操作" :items="menu" />
      </div>
    </div>
    <div v-if="!account.session.authenticated" class="empty-state">
      <Heart :size="42" />
      <h2>喜欢的歌，都在这里</h2>
      <p>扫码登录，找回你的网易云音乐收藏。</p>
      <button class="primary-button" @click="$emit('login')">
        <ScanLine :size="16" />扫码登录
      </button>
    </div>
    <div
      v-else-if="library.likedLoading && !library.likedSongs.length"
      class="empty-state compact-state"
      role="status"
    >
      <LoaderCircle class="spin" :size="30" />
      <p>正在找回你的心动…</p>
    </div>
    <div
      v-else-if="library.likedError && !library.likedSongs.length"
      class="empty-state compact-state"
      role="alert"
    >
      <Heart :size="36" />
      <p>{{ library.likedError }}</p>
      <button class="secondary-button" @click="library.loadLikedSongs(true)">
        <RefreshCw :size="15" />重新加载
      </button>
    </div>
    <template v-else-if="library.likedSongs.length"
      ><p v-if="library.likedError" class="inline-error" role="alert">
        {{ library.likedError }}
      </p>
      <p v-if="library.likedUnavailable" class="page-subtitle">
        有 {{ library.likedUnavailable }} 首歌曲暂时无法读取详情。
      </p>
      <SongList v-model:batch="batch" :songs="library.likedSongs" :playlist="likedPlaylist"
    /></template>
    <div v-else class="empty-state compact-state">
      <Heart :size="38" />
      <h2>收藏你的第一份心动</h2>
      <p>点击歌曲旁的爱心，把喜欢的音乐留在这里。</p>
    </div>
  </div>
</template>

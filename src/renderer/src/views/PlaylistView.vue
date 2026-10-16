<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ListMusic,
  LoaderCircle,
  Play,
  RefreshCw,
  SquarePen,
  BookmarkPlus,
  BookmarkCheck,
} from "@lucide/vue";
import type { PlaylistSongs } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "../stores/account";
import { usePlayerStore } from "../stores/player";
import SongList from "../components/SongList.vue";
import ActionMenu from "../components/ActionMenu.vue";
import { useLibraryStore } from "../stores/library";
import { usePlaylistActionsStore } from "../stores/playlist-actions";
import { useSyncStore } from "../stores/sync";
const route = useRoute();
const router = useRouter();
const account = useAccountStore();
const player = usePlayerStore();
const library = useLibraryStore();
const actions = usePlaylistActionsStore();
const sync = useSyncStore();
const batch = ref(false);
const editable = computed(() => data.value?.playlist.creatorId === account.session.profile?.userId && data.value?.playlist.specialType !== 5);
const canSubscribe = computed(() => Boolean(data.value?.playlist.creatorId && data.value.playlist.creatorId !== account.session.profile?.userId));
watch(() => library.deletedPlaylistId, (id) => { if (id !== null && Number(route.params.id) === id) void router.replace('/'); });
const menu = computed(() => [
  { label: '批量操作', action: () => { batch.value = true; } },
  { label: '添加全部至播放列表', action: () => { if (data.value) { player.enqueueAll(data.value.songs); library.showMessage('已添加全部歌曲至播放列表。'); } } },
]);
const data = ref<PlaylistSongs | null>(null);
const error = ref("");
const loading = ref(false);
let generation = 0;
async function load(background = false) {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  if (!background) data.value = null;
  try {
    const result = unwrap(
      await desktop().music.playlist(Number(route.params.id), true),
    );
    if (current === generation) data.value = result;
  } catch (reason) {
    if (current === generation) error.value = errorMessage(reason);
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(
  [
    () => route.params.id,
    () => account.session.profile?.userId,
    () => library.playlistRevision,
  ],
  () => void load(),
  { immediate: true },
);
onUnmounted(() => generation++);
watch(() => sync.revision, () => void load(true));
watch(() => route.params.id, () => { batch.value = false; });
</script>
<template>
  <div class="page-content">
    <div v-if="loading && !data" class="empty-state" role="status">
      <LoaderCircle class="spin" :size="30" />
      <p>正在打开歌单…</p>
    </div>
    <div v-else-if="error && !data" class="empty-state" role="alert">
      <ListMusic :size="38" />
      <h2>暂时无法打开歌单</h2>
      <p>{{ error }}</p>
      <button class="secondary-button" @click="load()">
        <RefreshCw :size="15" />重新加载
      </button>
    </div>
    <template v-else-if="data"
      ><p v-if="error" class="inline-error" role="alert">{{ error }}</p><section v-if="!batch" class="playlist-intro">
        <img
          v-if="data.playlist.cover"
          :src="`${data.playlist.cover}?param=360y360`"
          alt="歌单封面"
        />
        <div class="playlist-intro-copy">
          <p class="eyebrow">PLAYLIST / 你的音乐时刻</p>
          <div class="playlist-title-row"><h1>{{ data.playlist.name }}</h1><button v-if="editable" aria-label="编辑歌单信息" title="编辑歌单信息" @click="actions.openEdit(data.playlist)"><SquarePen :size="21" /></button></div>
          <p class="page-subtitle">
            {{ data.playlist.creator }} · {{ data.total }} 首歌曲
          </p>
          <p v-if="data.playlist.description" class="playlist-description">
            {{ data.playlist.description }}
          </p>
          <div class="heading-actions playlist-main-actions"><button
            class="primary-button"
            :disabled="!data.songs.length"
            @click="player.playAll(data.songs)"
          >
            <Play :size="16" />播放全部
          </button><button v-if="canSubscribe" class="secondary-button" :disabled="library.playlistPending.has(data.playlist.id)" :aria-pressed="library.isPlaylistSaved(data.playlist)" @click="library.setPlaylistSaved(data.playlist, !library.isPlaylistSaved(data.playlist))"><BookmarkCheck v-if="library.isPlaylistSaved(data.playlist)" :size="16" /><BookmarkPlus v-else :size="16" />{{ library.playlistPending.has(data.playlist.id) ? '正在处理…' : library.isPlaylistSaved(data.playlist) ? '取消收藏' : '收藏歌单' }}</button><ActionMenu label="歌单更多操作" :items="menu" /></div>
        </div>
      </section>
      <p v-if="data.unavailable" class="page-subtitle">
        有 {{ data.unavailable }} 首歌曲暂时无法读取详情。
      </p>
      <SongList v-if="data.songs.length" v-model:batch="batch" :songs="data.songs" :playlist="data.playlist" />
      <div v-else class="empty-state compact-state">
        <ListMusic :size="34" />
        <p>这里还没有可展示的歌曲。</p>
      </div>
    </template>
  </div>
</template>

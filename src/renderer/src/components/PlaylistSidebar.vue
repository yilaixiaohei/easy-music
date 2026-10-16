<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { Playlist } from "../../../shared/contracts";
import ActionMenu from "./ActionMenu.vue";
import { usePlayerStore } from "../stores/player";
import { desktop, unwrap, errorMessage } from "../api";
import { ChevronDown, ListMusic, Plus } from "@lucide/vue";
import { useAccountStore } from "../stores/account";
import { useLibraryStore } from "../stores/library";
import { usePlaylistActionsStore } from "../stores/playlist-actions";
const account = useAccountStore();
const library = useLibraryStore();
const actions = usePlaylistActionsStore();
const createdOpen = ref(true);
const savedOpen = ref(true);
const router = useRouter();
const player = usePlayerStore();
const contextMenu = ref<InstanceType<typeof ActionMenu> | null>(null);
const selected = ref<Playlist | null>(null);
let generation = 0;
watch(() => account.session.profile?.userId, () => { generation++; contextMenu.value?.close(); selected.value = null; });
async function playPlaylist(playlist: Playlist) {
  const current = generation;
  try {
    const result = unwrap(await desktop().music.playlist(playlist.id));
    if (current === generation) player.playAll(result.songs);
  } catch (reason) { if (current === generation) library.showMessage(errorMessage(reason)); }
}
const contextItems = computed(() => {
  const playlist = selected.value;
  if (!playlist) return [];
  return [
    { label: "查看歌单", action: () => { void router.push(`/playlist/${playlist.id}`); } },
    { label: "播放", action: () => { void playPlaylist(playlist); } },
    ...(playlist.creatorId === account.session.profile?.userId ? [{ label: "编辑歌单信息", action: () => actions.openEdit(playlist) }] : []),
    { label: "删除歌单", danger: true, disabled: library.playlistPending.has(playlist.id), action: () => actions.openRemovePlaylist(playlist) },
  ];
});
function openContext(event: MouseEvent | KeyboardEvent, playlist: Playlist) {
  selected.value = playlist;
  void contextMenu.value?.openAt(event);
}
</script>
<template>
  <div class="sidebar-playlists grouped-playlists">
    <section>
      <div class="playlist-group-heading"><button :aria-expanded="createdOpen" aria-controls="created-playlists" @click="createdOpen = !createdOpen"><strong>创建的歌单</strong><small>{{ library.createdPlaylists.length }}</small><ChevronDown :size="13" :class="{ collapsed: !createdOpen }" /></button><button aria-label="创建歌单" title="创建歌单" @click="actions.openCreate()"><Plus :size="16" /></button></div>
      <div v-show="createdOpen" id="created-playlists" class="playlist-group-links"><RouterLink v-for="playlist in library.createdPlaylists" :key="playlist.id" :to="`/playlist/${playlist.id}`" :title="playlist.name" @contextmenu="openContext($event, playlist)" @keydown.shift.f10.prevent="openContext($event, playlist)"><img v-if="playlist.cover" :src="`${playlist.cover}?param=80y80`" alt="" /><ListMusic v-else :size="17" /><span>{{ playlist.name }}</span></RouterLink><p v-if="account.session.authenticated && !library.loading && !library.createdPlaylists.length" class="sidebar-hint">创建一张属于你的歌单。</p></div>
    </section>
    <section>
      <div class="playlist-group-heading"><button :aria-expanded="savedOpen" aria-controls="saved-playlists" @click="savedOpen = !savedOpen"><strong>收藏的歌单</strong><small>{{ library.savedPlaylists.length }}</small><ChevronDown :size="13" :class="{ collapsed: !savedOpen }" /></button></div>
      <div v-show="savedOpen" id="saved-playlists" class="playlist-group-links"><RouterLink v-for="playlist in library.savedPlaylists" :key="playlist.id" :to="`/playlist/${playlist.id}`" :title="playlist.name" @contextmenu="openContext($event, playlist)" @keydown.shift.f10.prevent="openContext($event, playlist)"><img v-if="playlist.cover" :src="`${playlist.cover}?param=80y80`" alt="" /><ListMusic v-else :size="17" /><span>{{ playlist.name }}</span></RouterLink><p v-if="account.session.authenticated && !library.loading && !library.savedPlaylists.length" class="sidebar-hint">还没有收藏歌单。</p></div>
    </section>
    <p v-if="library.loading" class="sidebar-hint">正在加载歌单…</p>
    <div v-if="library.error" class="sidebar-playlists-error"><span>{{ library.error }}</span><button @click="library.loadPlaylists(true)">重试</button></div>
    <p v-if="!account.session.authenticated" class="sidebar-hint">登录后，让喜欢的音乐<br />陪伴每一天。</p>
    <ActionMenu ref="contextMenu" label="歌单操作" context-only :items="contextItems" />
  </div>
</template>

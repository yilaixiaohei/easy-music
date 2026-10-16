<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { UserRound, Play, ChevronRight, LoaderCircle } from "@lucide/vue";
import type { ArtistDetail, ArtistDescription, Album, Song } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "../stores/account";
import { usePlayerStore } from "../stores/player";
import SongList from "../components/SongList.vue";
import AlbumGrid from "../components/AlbumGrid.vue";
const route = useRoute();
const account = useAccountStore();
const player = usePlayerStore();
const all = computed(() => route.path.endsWith('/songs'));
const tab = ref('songs');
const data = ref<ArtistDetail | null>(null);
const albums = ref<Album[] | null>(null);
const description = ref<ArtistDescription | null>(null);
const songs = ref<Song[] | null>(null);
const loading = ref(false);
const error = ref('');
const contentLoading = ref(false);
const contentError = ref('');
let generation = 0;
let contentGeneration = 0;
async function loadContent() {
  const current = ++contentGeneration;
  const atGeneration = generation;
  contentLoading.value = false; contentError.value = '';
  if (!data.value) return;
  const kind = all.value ? 'all' : tab.value;
  if (kind === 'songs' || (kind === 'all' && songs.value) || (kind === 'albums' && albums.value) || (kind === 'description' && description.value)) return;
  contentLoading.value = true;
  const id = Number(route.params.id);
  try {
    const api = desktop().music;
    const result = kind === 'all' ? unwrap(await api.artistSongs(id)) : kind === 'albums' ? unwrap(await api.artistAlbums(id)) : unwrap(await api.artistDescription(id));
    if (current !== contentGeneration || atGeneration !== generation) return;
    if (kind === 'all') songs.value = result as Song[];
    else if (kind === 'albums') albums.value = result as Album[];
    else description.value = result as ArtistDescription;
  } catch (reason) { if (current === contentGeneration && atGeneration === generation) contentError.value = errorMessage(reason); }
  finally { if (current === contentGeneration && atGeneration === generation) contentLoading.value = false; }
}
async function load() {
  const current = ++generation;
  contentGeneration++;
  loading.value = true; error.value = ''; data.value = null;
  tab.value = 'songs'; albums.value = null; songs.value = null; description.value = null;
  try { const result = unwrap(await desktop().music.artist(Number(route.params.id))); if (current === generation) { data.value = result; await loadContent(); } }
  catch (reason) { if (current === generation) error.value = errorMessage(reason); }
  finally { if (current === generation) loading.value = false; }
}
watch([() => route.params.id, () => account.session.profile?.userId], () => void load(), { immediate: true });
watch([all, tab], () => void loadContent());
onUnmounted(() => { generation++; contentGeneration++; });
</script>
<template>
  <div class="page-content">
    <div v-if="loading" class="empty-state" role="status"><LoaderCircle class="spin" :size="30" /><p>正在加载歌手资料…</p></div>
    <div v-else-if="error" class="empty-state" role="alert"><p>{{ error }}</p><button class="secondary-button" @click="load">重新加载</button></div>
    <template v-else-if="data">
      <div v-if="all" class="page-heading"><div><p class="eyebrow">{{ data.artist.name }}</p><h1>全部歌曲</h1></div><button class="primary-button" :disabled="!songs?.length || contentLoading" @click="songs && player.playAll(songs)"><Play :size="16" />播放全部</button></div>
      <template v-else>
        <section class="playlist-intro catalog-intro artist-intro"><img v-if="data.artist.cover" :src="`${data.artist.cover}?param=480y480`" alt="歌手头像" /><UserRound v-else :size="100" /><div class="playlist-intro-copy"><p class="eyebrow">ARTIST / 与声音相遇</p><h1>{{ data.artist.name }}</h1><p class="page-subtitle">{{ data.artist.songCount }} 首歌曲 · {{ data.artist.albumCount }} 张专辑</p><p v-if="data.artist.brief" class="artist-brief">{{ data.artist.brief }}</p><button class="primary-button" :disabled="!data.songs.length" @click="player.playAll(data.songs)"><Play :size="16" />播放热门歌曲</button></div></section>
        <nav class="catalog-tabs" aria-label="歌手内容"><button :class="{ active: tab === 'songs' }" @click="tab = 'songs'">歌曲</button><button :class="{ active: tab === 'albums' }" @click="tab = 'albums'">专辑 <small>{{ data.artist.albumCount }}</small></button><button :class="{ active: tab === 'description' }" @click="tab = 'description'">歌手详情</button></nav>
      </template>
      <div v-if="contentLoading" class="empty-state compact-state" role="status"><LoaderCircle class="spin" :size="28" /><p>正在加载{{ all ? '全部歌曲' : tab === 'albums' ? '全部专辑' : '歌手详情' }}…</p></div>
      <div v-else-if="contentError" class="empty-state compact-state" role="alert"><p>{{ contentError }}</p><button class="secondary-button" @click="loadContent">重新加载</button></div>
      <template v-else-if="all"><p class="page-subtitle">{{ songs?.length || 0 }} 首歌曲</p><SongList v-if="songs?.length" :songs="songs" /><div v-else class="empty-state compact-state">暂无可展示的歌曲。</div></template>
      <template v-else-if="tab === 'songs'"><RouterLink class="catalog-section-link" :to="`/artist/${data.artist.id}/songs`">热门歌曲 <small>{{ data.songs.length }} 首</small><ChevronRight :size="19" /></RouterLink><SongList v-if="data.songs.length" :songs="data.songs" /><div v-else class="empty-state compact-state">暂无可展示的热门歌曲。</div></template>
      <template v-else-if="tab === 'albums'"><AlbumGrid v-if="albums?.length" :albums="albums" /><div v-else class="empty-state compact-state">暂无可展示的专辑。</div></template>
      <section v-else class="catalog-description"><h2>{{ data.artist.name }}简介</h2><p>{{ description?.brief || data.artist.brief || '暂时没有歌手介绍。' }}</p><template v-for="(section, index) in description?.sections" :key="index"><h2>{{ section.title }}</h2><p>{{ section.text }}</p></template></section>
    </template>
  </div>
</template>

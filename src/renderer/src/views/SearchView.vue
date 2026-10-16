<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { LoaderCircle, Play, Search, ChevronLeft, ChevronRight, UserRound, ListMusic } from "@lucide/vue";
import type { CatalogSearch, SearchKind } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import SongList from "../components/SongList.vue";
import AlbumGrid from "../components/AlbumGrid.vue";
import { useAccountStore } from "../stores/account";
import { usePlayerStore } from "../stores/player";
const route = useRoute();
const router = useRouter();
const account = useAccountStore();
const player = usePlayerStore();
const tabs: { kind: SearchKind; label: string }[] = [{ kind: 'songs', label: '单曲' }, { kind: 'playlists', label: '歌单' }, { kind: 'albums', label: '专辑' }, { kind: 'artists', label: '歌手' }];
const keywords = computed(() => typeof route.query.q === 'string' ? route.query.q.trim() : '');
const kind = computed<SearchKind>(() => tabs.find(tab => tab.kind === route.query.type)?.kind || 'songs');
const page = computed(() => { const value = Number(route.query.page ?? 1); return Number.isSafeInteger(value) && value >= 1 && value <= 1000 ? value : 1; });
const loading = ref(false);
const error = ref('');
const empty = (): CatalogSearch => ({ songs: [], playlists: [], albums: [], artists: [], total: 0, hasMore: false });
const result = ref<CatalogSearch>(empty());
const hasResults = computed(() => result.value[kind.value].length > 0);
let generation = 0;
async function load() {
  const current = ++generation;
  result.value = empty(); error.value = ''; loading.value = false;
  if (!keywords.value) return;
  loading.value = true;
  try { const data = unwrap(await desktop().music.searchCatalog(keywords.value, page.value, kind.value)); if (current === generation) result.value = data; }
  catch (reason) { if (current === generation) error.value = errorMessage(reason); }
  finally { if (current === generation) loading.value = false; }
}
function navigate(type: SearchKind, targetPage = 1) { void router.push({ path: '/search', query: { q: keywords.value, type, page: targetPage } }); }
watch([keywords, kind, page, () => account.session.profile?.userId], () => void load(), { immediate: true });
onUnmounted(() => generation++);
</script>
<template>
  <div class="page-content search-page">
    <div class="page-heading"><div><p class="eyebrow">FIND YOUR NEXT FAVORITE</p><h1>{{ keywords || '搜索音乐' }}</h1></div><button v-if="kind === 'songs' && result.songs.length" class="primary-button" @click="player.playAll(result.songs)"><Play :size="16" />播放本页</button></div>
    <nav class="catalog-tabs" aria-label="搜索类型"><button v-for="tab in tabs" :key="tab.kind" :class="{ active: kind === tab.kind }" @click="navigate(tab.kind)">{{ tab.label }}</button></nav>
    <p v-if="keywords && !loading && !error" class="page-subtitle search-result-count">找到 {{ result.total }} 个结果</p>
    <div v-if="loading" class="empty-state compact-state" role="status"><LoaderCircle class="spin" :size="30" /><p>正在寻找好音乐…</p></div>
    <div v-else-if="error" class="empty-state compact-state" role="alert"><p>{{ error }}</p><button class="secondary-button" @click="load">重新加载</button></div>
    <template v-else-if="hasResults">
      <SongList v-if="kind === 'songs'" :songs="result.songs" />
      <AlbumGrid v-else-if="kind === 'albums'" :albums="result.albums" />
      <div v-else-if="kind === 'artists'" class="catalog-grid artist-grid"><RouterLink v-for="artist in result.artists" :key="artist.id" :to="`/artist/${artist.id}`" class="catalog-card"><div class="catalog-cover artist-cover"><img v-if="artist.cover" :src="`${artist.cover}?param=360y360`" alt="" loading="lazy" /><UserRound v-else :size="40" /></div><h3>{{ artist.name }}</h3><p>{{ artist.songCount }} 首歌曲 · {{ artist.albumCount }} 张专辑</p></RouterLink></div>
      <div v-else class="catalog-grid"><RouterLink v-for="playlist in result.playlists" :key="playlist.id" :to="`/playlist/${playlist.id}`" class="catalog-card"><div class="catalog-cover"><img v-if="playlist.cover" :src="`${playlist.cover}?param=360y360`" alt="" loading="lazy" /><ListMusic v-else :size="38" /></div><h3 :title="playlist.name">{{ playlist.name }}</h3><p>{{ playlist.creator }} · {{ playlist.trackCount }} 首歌曲</p></RouterLink></div>
      <div class="pagination"><button :disabled="page === 1" @click="navigate(kind, page - 1)"><ChevronLeft :size="16" />上一页</button><span>第 {{ page }} 页</span><button :disabled="!result.hasMore || page >= 1000" @click="navigate(kind, page + 1)">下一页<ChevronRight :size="16" /></button></div>
    </template>
    <div v-else class="empty-state compact-state"><Search :size="38" /><h2>{{ keywords ? '没有找到相关结果' : '下一首喜欢的歌，正在等你' }}</h2><p>{{ keywords ? '换一个关键词试试。' : '在上方输入歌名、歌手、专辑或歌单名称。' }}</p></div>
  </div>
</template>

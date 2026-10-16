<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Disc3, Play, Plus, Check, LoaderCircle } from "@lucide/vue";
import type { AlbumDetail } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "../stores/account";
import { useAlbumsStore } from "../stores/albums";
import { usePlayerStore } from "../stores/player";
import SongList from "../components/SongList.vue";
defineEmits<{ login: [] }>();
const route = useRoute();
const account = useAccountStore();
const saved = useAlbumsStore();
const player = usePlayerStore();
const data = ref<AlbumDetail | null>(null);
const loading = ref(false);
const error = ref("");
const tab = ref("songs");
let generation = 0;
async function load() {
  const current = ++generation;
  data.value = null; loading.value = true; error.value = ""; tab.value = "songs";
  void saved.load(true);
  try { const result = unwrap(await desktop().music.album(Number(route.params.id))); if (current === generation) data.value = result; }
  catch (reason) { if (current === generation) error.value = errorMessage(reason); }
  finally { if (current === generation) loading.value = false; }
}
watch([() => route.params.id, () => account.session.profile?.userId], () => void load(), { immediate: true });
onUnmounted(() => generation++);
</script>
<template>
  <div class="page-content">
    <div v-if="loading" class="empty-state" role="status"><LoaderCircle class="spin" :size="30" /><p>正在打开专辑…</p></div>
    <div v-else-if="error" class="empty-state" role="alert"><p>{{ error }}</p><button class="secondary-button" @click="load">重新加载</button></div>
    <template v-else-if="data">
      <section class="playlist-intro catalog-intro"><img v-if="data.album.cover" :src="`${data.album.cover}?param=480y480`" alt="专辑封面" /><Disc3 v-else :size="100" />
        <div class="playlist-intro-copy"><p class="eyebrow">ALBUM / 用一张专辑的时间</p><h1>{{ data.album.name }}</h1>
          <p class="page-subtitle artist-links"><template v-for="(artist, index) in data.album.artists" :key="artist.id"><span v-if="index"> / </span><RouterLink :to="`/artist/${artist.id}`">{{ artist.name }}</RouterLink></template></p>
          <p class="page-subtitle">{{ data.songs.length }} 首歌曲<span v-if="data.album.publishTime"> · {{ new Date(data.album.publishTime).toLocaleDateString('zh-CN') }} 发行</span></p>
          <div class="heading-actions"><button class="primary-button" :disabled="!data.songs.length" @click="player.playAll(data.songs)"><Play :size="16" />播放全部</button>
            <button class="secondary-button" :disabled="saved.loading || saved.pending.has(data.album.id)" @click="account.session.authenticated ? saved.toggle(data.album) : $emit('login')"><Check v-if="saved.isSaved(data.album.id)" :size="16" /><Plus v-else :size="16" />{{ saved.pending.has(data.album.id) ? '正在更新…' : saved.loading ? '正在读取收藏…' : saved.isSaved(data.album.id) ? '已收藏 · 取消收藏' : '收藏专辑' }}</button></div>
          <p v-if="saved.error && account.session.authenticated" class="inline-error">{{ saved.error }} <button @click="saved.load(true)">重试</button></p>
        </div>
      </section>
      <nav class="catalog-tabs" aria-label="专辑内容"><button :class="{ active: tab === 'songs' }" @click="tab = 'songs'">歌曲 <small>{{ data.songs.length }}</small></button><button :class="{ active: tab === 'description' }" @click="tab = 'description'">专辑详情</button></nav>
      <template v-if="tab === 'songs'"><SongList v-if="data.songs.length" :songs="data.songs" /><div v-else class="empty-state compact-state">暂无可展示的歌曲。</div></template>
      <section v-else class="catalog-description"><h2>专辑介绍</h2><p>{{ data.description || '暂时没有专辑介绍。' }}</p></section>
    </template>
  </div>
</template>

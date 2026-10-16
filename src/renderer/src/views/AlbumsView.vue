<script setup lang="ts">
import { watch } from "vue";
import { Disc3, RefreshCw, LoaderCircle } from "@lucide/vue";
import { useAccountStore } from "../stores/account";
import { useAlbumsStore } from "../stores/albums";
import AlbumGrid from "../components/AlbumGrid.vue";
defineEmits<{ login: [] }>();
const account = useAccountStore();
const saved = useAlbumsStore();
watch(() => account.session.profile?.userId, () => void saved.load(true), { immediate: true });
</script>
<template>
  <div class="page-content">
    <div class="page-heading"><div><p class="eyebrow">YOUR ALBUM COLLECTION</p><h1>收藏的专辑</h1><p v-if="saved.loaded" class="page-subtitle">{{ saved.albums.length }} 张专辑，收藏每一段旋律。</p></div><button v-if="account.session.authenticated" class="secondary-button" :disabled="saved.loading" @click="saved.load(true)"><RefreshCw :size="16" />刷新</button></div>
    <div v-if="!account.session.authenticated" class="empty-state"><Disc3 :size="42" /><p>扫码登录，找回你收藏的专辑。</p><button class="primary-button" @click="$emit('login')">扫码登录</button></div>
    <div v-else-if="saved.loading && !saved.albums.length" class="empty-state" role="status"><LoaderCircle class="spin" :size="30" /><p>正在加载收藏的专辑…</p></div>
    <div v-else-if="saved.error && !saved.albums.length" class="empty-state" role="alert"><p>{{ saved.error }}</p><button class="secondary-button" @click="saved.load(true)">重新加载</button></div>
    <template v-else-if="saved.albums.length"><p v-if="saved.error" class="inline-error" role="alert">{{ saved.error }}</p><AlbumGrid :albums="saved.albums" /></template>
    <div v-else class="empty-state"><Disc3 :size="42" /><p>还没有收藏专辑，去搜索喜欢的专辑吧。</p></div>
  </div>
</template>

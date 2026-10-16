<script setup lang="ts">
import { Disc3 } from "@lucide/vue";
import type { Album } from "../../../shared/contracts";
defineProps<{ albums: Album[] }>();
function date(time: number) { return time ? new Date(time).toLocaleDateString("zh-CN").replaceAll("/", "-") : ""; }
</script>
<template>
  <div class="catalog-grid">
    <RouterLink v-for="album in albums" :key="album.id" :to="`/album/${album.id}`" class="catalog-card">
      <div class="catalog-cover"><img v-if="album.cover" :src="`${album.cover}?param=360y360`" alt="" loading="lazy" /><Disc3 v-else :size="38" /></div>
      <h3 :title="album.name">{{ album.name }}</h3>
      <p :title="album.artists.map(a => a.name).join(' / ')">{{ album.artists.map(a => a.name).join(' / ') }}</p>
      <small>{{ album.size }} 首<span v-if="album.publishTime"> · {{ date(album.publishTime) }}</span></small>
    </RouterLink>
  </div>
</template>

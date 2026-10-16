<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import {
  Music2,
  CalendarDays,
  Radar,
  Play,
  LoaderCircle,
  RefreshCw,
} from "@lucide/vue";
import type { MusicChart, Playlist, Song } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "../stores/account";
import { useRouter } from "vue-router";
const emit = defineEmits<{ login: [] }>();
const account = useAccountStore();
const router = useRouter();
const playlists = ref<Playlist[]>([]);
const daily = ref<Song[]>([]);
const error = ref("");
const dailyError = ref("");
const loading = ref(false);
const dailyLoading = ref(false);
const radar = ref<Playlist | null>(null);
const radarLoading = ref(false);
const radarError = ref("");
const charts = ref<MusicChart[]>([]);
const chartsLoading = ref(false);
const chartsError = ref("");
const recommendedPlaylists = computed(() =>
  playlists.value
    .filter((playlist) => playlist.id !== 3136952023 && playlist.id !== radar.value?.id)
    .slice(0, 10),
);
const today = new Date().getDate();
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true;
  dailyLoading.value = false;
  radarLoading.value = false;
  error.value = dailyError.value = "";
  playlists.value = [];
  daily.value = [];
  radar.value = null;
  radarError.value = "";
  charts.value = [];
  chartsError.value = "";
  const loadRecommendations = async () => {
    try {
      const result = unwrap(await desktop().music.recommendations());
      if (current === generation) playlists.value = result;
    } catch (reason) {
      if (current === generation) error.value = errorMessage(reason);
    } finally {
      if (current === generation) loading.value = false;
    }
  };
  const loadDaily = async () => {
    dailyLoading.value = true;
    try {
      const result = unwrap(await desktop().music.dailySongs());
      if (current === generation) daily.value = result;
    } catch (reason) {
      if (current === generation) dailyError.value = errorMessage(reason);
    } finally {
      if (current === generation) dailyLoading.value = false;
    }
  };
  const loadRadar = async () => {
    radarLoading.value = true;
    try {
      const result = unwrap(await desktop().music.radar());
      if (current === generation) radar.value = result;
    } catch (reason) {
      if (current === generation) radarError.value = errorMessage(reason);
    } finally {
      if (current === generation) radarLoading.value = false;
    }
  };
  const loadCharts = async () => {
    chartsLoading.value = true;
    try {
      const result = unwrap(await desktop().music.charts());
      if (current === generation) charts.value = result;
    } catch (reason) {
      if (current === generation) chartsError.value = errorMessage(reason);
    } finally {
      if (current === generation) chartsLoading.value = false;
    }
  };
  await Promise.allSettled([
    loadRecommendations(),
    loadCharts(),
    ...(account.session.authenticated ? [loadDaily(), loadRadar()] : []),
  ]);
}
function openDaily() {
  if (!account.session.authenticated) emit("login");
  else void router.push("/daily");
}
function openRadar() {
  if (!account.session.authenticated) emit("login");
  else if (radar.value) void router.push(`/playlist/${radar.value.id}`);
  else void load();
}
watch(
  () => account.session.profile?.userId,
  () => void load(),
  { immediate: true },
);
onUnmounted(() => generation++);
</script>
<template>
  <div class="page-content">
    <div class="page-heading">
      <div>
        <p class="eyebrow">YOUR EVERYDAY SOUNDTRACK</p>
        <h1>发现音乐<span>给今天一点好声音。</span></h1>
      </div>
      <button
        class="refresh-discovery"
        :disabled="loading || dailyLoading || radarLoading || chartsLoading"
        title="刷新推荐"
        aria-label="刷新推荐"
        @click="load"
      >
        <RefreshCw :size="16" />
      </button>
    </div>
    <section class="discovery-shortcuts" aria-label="你的专属推荐">
      <button class="discovery-card daily-card" aria-label="查看全部每日推荐" @click="openDaily">
        <div class="discovery-card-art">
          <img v-if="daily[0]?.cover" :src="`${daily[0].cover}?param=500y500`" alt="" />
          <CalendarDays v-else class="discovery-card-fallback" :size="68" :stroke-width="1" />
          <span class="discovery-card-action"><Play :size="22" fill="currentColor" /></span>
        </div>
        <div class="discovery-card-caption">
          <h3 class="discovery-card-title"><span class="daily-date">{{ today }}</span>每日推荐</h3>
          <p>{{ !account.session.authenticated ? '登录，开启今天的专属推荐' : dailyLoading ? '正在准备今天的好音乐…' : dailyError ? '暂时无法加载，点击重试' : daily[0] ? `从「${daily[0].title}」听起，给今天一点好音乐。` : '给今天，一点新的旋律' }}</p>
          <div class="discovery-card-meta"><small>{{ daily.length ? `${daily.length} 首歌曲` : '每天，为你而选' }}</small><span>查看全部<Play :size="12" /></span></div>
        </div>
      </button>
      <button class="discovery-card radar-card" :disabled="radarLoading" aria-label="打开私人雷达歌单" @click="openRadar">
        <div class="discovery-card-art">
          <img v-if="radar?.cover" :src="`${radar.cover}?param=500y500`" alt="" />
          <Radar v-else class="discovery-card-fallback" :size="76" :stroke-width="1" />
          <span class="discovery-card-action"><Play :size="22" fill="currentColor" /></span>
        </div>
        <div class="discovery-card-caption">
          <h3 class="discovery-card-title"><Radar :size="22" />私人雷达</h3>
          <p>{{ !account.session.authenticated ? '登录，发现与你合拍的音乐' : radarLoading ? '正在寻找你的专属频率…' : radarError ? '暂时无法加载，点击重试' : radar?.name.replace(/\s*[|｜]\s*私人雷达$/, '') || '发现下一首，刚好喜欢的歌' }}</p>
          <div class="discovery-card-meta"><small>{{ radar ? `${radar.trackCount} 首歌曲 · 专属歌单` : '发现与你合拍的音乐' }}</small><span>打开歌单<Play :size="12" /></span></div>
        </div>
      </button>
    </section>
    <p v-if="dailyError || radarError" class="inline-error" role="alert">{{ dailyError || radarError }}</p>
    <div class="section-heading">
      <h2>推荐歌单</h2>
    </div>
    <div v-if="loading" class="section-placeholder" role="status">
      <LoaderCircle class="spin" :size="24" />正在寻找好音乐…
    </div>
    <div v-else-if="error" class="section-placeholder" role="alert">
      <p>{{ error }}</p>
      <button class="secondary-button" @click="load">重新加载</button>
    </div>
    <div v-else-if="recommendedPlaylists.length" class="mood-grid real-playlists">
      <RouterLink
        v-for="playlist in recommendedPlaylists"
        :key="playlist.id"
        :to="`/playlist/${playlist.id}`"
        class="mood-card playlist-card"
        ><div class="playlist-cover">
          <img
            v-if="playlist.cover"
            :src="`${playlist.cover}?param=400y400`"
            alt=""
            loading="lazy"
          /><Music2 v-else :size="30" /><span class="playlist-play-hint"
            ><Play :size="20" fill="currentColor"
          /></span>
        </div>
        <h3 :title="playlist.name">{{ playlist.name }}</h3>
        <p>{{ playlist.trackCount }} 首歌曲</p></RouterLink
      >
    </div>
    <div v-else class="section-placeholder">
      暂时没有推荐歌单，稍后再来看看。
    </div>
    <div class="section-heading charts-heading"><h2>排行榜</h2></div>
    <div v-if="chartsLoading" class="section-placeholder" role="status">
      <LoaderCircle class="spin" :size="24" />正在更新榜单…
    </div>
    <div v-else-if="chartsError" class="section-placeholder" role="alert">
      <p>{{ chartsError }}</p><button class="secondary-button" @click="load">重新加载</button>
    </div>
    <div v-else-if="charts.length" class="charts-grid">
      <RouterLink v-for="chart in charts" :key="chart.id" :to="`/playlist/${chart.id}`"
        class="chart-card" :aria-label="`查看${chart.name}完整榜单`">
        <div class="chart-card-heading">
          <h3>{{ chart.name.replace(/^网易云/, '') }}</h3><span>{{ chart.updateFrequency }}</span>
        </div>
        <div class="chart-card-body">
          <div class="chart-art">
            <img v-if="chart.previews[2]?.cover" class="chart-cover-back" :src="`${chart.previews[2].cover}?param=150y150`" alt="" loading="lazy" />
            <img v-if="chart.previews[1]?.cover" class="chart-cover-middle" :src="`${chart.previews[1].cover}?param=150y150`" alt="" loading="lazy" />
            <img v-if="chart.previews[0]?.cover || chart.cover" class="chart-cover-front" :src="`${chart.previews[0]?.cover || chart.cover}?param=180y180`" alt="" loading="lazy" />
            <Music2 v-else :size="28" />
          </div>
          <ol v-if="chart.previews.length" class="chart-preview-list">
            <li v-for="(song, index) in chart.previews" :key="index" :title="`${song.title} · ${song.artists}`">
              <span class="chart-rank">{{ index + 1 }}</span>
              <span class="chart-song-copy"><span>{{ song.title }}</span><span class="chart-artist"> · {{ song.artists }}</span></span>
            </li>
          </ol>
          <p v-else class="chart-preview-empty">查看完整榜单<Play :size="14" /></p>
        </div>
      </RouterLink>
    </div>
    <div v-else class="section-placeholder">榜单暂时不可用，稍后再来看看。</div>
  </div>
</template>

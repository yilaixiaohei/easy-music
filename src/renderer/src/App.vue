<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useAccountStore } from "./stores/account";
import QrLoginPanel from "./components/QrLoginPanel.vue";
import PlayerBar from "./components/PlayerBar.vue";
import QualityPicker from "./components/QualityPicker.vue";
import QueuePanel from "./components/QueuePanel.vue";
import WindowControls from "./components/WindowControls.vue";
import NowPlayingView from "./views/NowPlayingView.vue";
import StorageSettings from './components/StorageSettings.vue';
import RoamingModePicker from "./components/RoamingModePicker.vue";
import PlaylistSidebar from "./components/PlaylistSidebar.vue";
import PlaylistDialogs from "./components/PlaylistDialogs.vue";
import { usePlaylistActionsStore } from "./stores/playlist-actions";
import { useLibraryStore } from "./stores/library";
import { usePlayerStore } from "./stores/player";
import { useSyncStore } from "./stores/sync";
import { useRoute, useRouter } from "vue-router";
import { installAutoScrollbars } from "./auto-scrollbars";
import { errorMessage, unwrap } from "./api";
import { useCoverBackground } from "./player/use-cover-background";
import { useAppearanceStore } from './stores/appearance';
import { restoreFocus } from './focus';
import {
  Compass,
  Heart,
  History,
  Search,
  Music2,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ListMusic,
  Disc3,
  X,
  ArrowUpRight,
  Radio,
  ChevronDown,
} from "@lucide/vue";

const router = useRouter();
const route = useRoute();
const account = useAccountStore();
const player = usePlayerStore();
const appearance = useAppearanceStore();
const library = useLibraryStore();
const playlistActions = usePlaylistActionsStore();
const sync = useSyncStore();
const lyricsBackground = useCoverBackground(() => player.lyricsOpen ? player.state.song?.cover : undefined);
const closeToTray = ref(false);
const isDesktop = Boolean(window.desktop);
const desktopSettingsBusy = ref(true);
const desktopSettingsError = ref("");
async function loadDesktopSettings() {
  try {
    if (window.desktop) closeToTray.value = unwrap(await window.desktop.window.getSettings()).closeToTray;
  } catch (reason) { desktopSettingsError.value = errorMessage(reason); }
  finally { desktopSettingsBusy.value = false; }
}
async function setCloseToTray(event: Event) {
  const input = event.target as HTMLInputElement;
  desktopSettingsBusy.value = true;
  desktopSettingsError.value = "";
  try {
    if (window.desktop) closeToTray.value = unwrap(await window.desktop.window.setCloseToTray(input.checked)).closeToTray;
  } catch (reason) { desktopSettingsError.value = errorMessage(reason); }
  finally { input.checked = closeToTray.value; desktopSettingsBusy.value = false; }
}
function refreshOnFocus() { if (document.visibilityState !== "hidden") void sync.refresh("focus"); }
watch([() => route.fullPath, () => account.session.profile?.userId], () => { void sync.refresh("page"); }, { immediate: true });
let disposeScrollbars: (() => void) | undefined;
onMounted(() => {
  disposeScrollbars = installAutoScrollbars();
  void account.restore();
  void loadDesktopSettings();
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("beforeunload", player.save);
  window.addEventListener("focus", refreshOnFocus);
  document.addEventListener("visibilitychange", refreshOnFocus);
});
onUnmounted(() => {
  disposeScrollbars?.();
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("beforeunload", player.save);
  window.removeEventListener("focus", refreshOnFocus);
  document.removeEventListener("visibilitychange", refreshOnFocus);
});
function closeModal() {
  loginOpen.value = settingsOpen.value = queueOpen.value = false;
}
function onKeydown(event: KeyboardEvent) {
  if (playlistActions.dialog) return;
  if (event.key === "Escape") {
    if (loginOpen.value || settingsOpen.value || queueOpen.value) closeModal();
    else player.lyricsOpen = false;
  }
  if (
    event.code === "Space" &&
    !loginOpen.value &&
    !settingsOpen.value &&
    !queueOpen.value &&
    !(
      event.target instanceof HTMLElement &&
      (event.target.matches("input, textarea, select, button, a") ||
        event.target.isContentEditable)
    )
  ) {
    event.preventDefault();
    player.toggle();
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [
    ...dialog.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
    ),
  ];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
function openAccount() {
  if (account.session.authenticated) settingsOpen.value = true;
  else loginOpen.value = true;
}
const query = ref("");
watch(
  () => route.query.q,
  (value) => {
    if (typeof value === "string") query.value = value;
  },
  { immediate: true },
);
const loginOpen = ref(false);
const settingsOpen = ref(false);
const queueOpen = ref(false);
const dialog = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
watch(
  () => loginOpen.value || settingsOpen.value || queueOpen.value,
  async (open) => {
    if (open) {
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      await nextTick();
      dialog.value?.querySelector<HTMLElement>("button")?.focus();
    } else {
      await nextTick();
      restoreFocus(previousFocus);
    }
  },
);
function search() {
  if (query.value.trim())
    void router.push({ path: "/search", query: { q: query.value.trim() } });
}
async function openRoaming() {
  if (!account.session.authenticated) { openAccount(); return; }
  queueOpen.value = false;
  roamingSelected.value = true;
  await player.startRoaming();
}
const roamingSelected = ref(false);
watch(() => route.fullPath, async () => {
  roamingSelected.value = false;
  await nextTick();
  document.querySelector<HTMLElement>(".workspace")?.scrollTo({ top: 0 });
});
watch(() => player.isRoaming, (active) => { if (!active) roamingSelected.value = false; });
function selectSidebar(event: MouseEvent) {
  if ((event.target as Element).closest("a")) roamingSelected.value = false;
}
const collapseLyrics = ref<HTMLButtonElement | null>(null);
let lyricsTrigger: HTMLElement | null = null;
watch(() => player.lyricsOpen, async (open) => {
  if (open) {
    lyricsTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    collapseLyrics.value?.focus();
  } else {
    await nextTick();
    restoreFocus(lyricsTrigger);
  }
});
</script>

<template>
  <div class="app-shell" :inert="!!playlistActions.dialog">
    <aside class="sidebar" :class="{ 'roaming-selected': roamingSelected }"
      :inert="player.lyricsOpen" @click.capture="selectSidebar">
      <a class="brand" href="#/"
        ><span class="brand-icon"><Music2 :size="22" /></span> easy<span
          class="brand-light"
          >music</span
        ><i
      /></a>
      <nav class="primary-navigation" aria-label="在线音乐">
        <RouterLink to="/"><Compass :size="19" />发现音乐</RouterLink>
        <button class="roaming-navigation" :class="{ 'is-active': roamingSelected }"
          :disabled="account.restoring || player.roamingLoading" @click="openRoaming">
          <Radio :size="19" />私人漫游
        </button>
      </nav>
      <div class="navigation-divider" role="separator" />
      <nav aria-label="我的音乐">
        <RouterLink to="/liked"><Heart :size="19" />我喜欢的音乐</RouterLink>
        <RouterLink to="/recent"><History :size="19" />最近播放</RouterLink>
        <RouterLink to="/albums"><Disc3 :size="19" />我的专辑</RouterLink>
      </nav>
      <PlaylistSidebar />
      <div class="sidebar-bottom">
        <button class="account-button" @click="openAccount">
          <span class="avatar"
            ><img
              v-if="account.session.profile?.avatarUrl"
              :src="account.session.profile.avatarUrl"
              alt="" /><Music2 v-else :size="18" /></span
          ><span
            >{{
              account.session.profile?.nickname ||
              (account.session.authenticated
                ? "已登录"
                : account.restoring
                  ? "正在恢复登录…"
                  : "扫码登录")
            }}<small>{{
              account.session.authenticated
                ? "你的音乐空间"
                : "开启你的音乐空间"
            }}</small></span
          ><ArrowUpRight :size="16" />
        </button>
        <button class="settings-button" @click="settingsOpen = true">
          <Settings2 :size="17" />设置
        </button>
      </div>
    </aside>
    <div class="workspace" :inert="player.lyricsOpen">
      <header class="topbar">
        <div class="history-buttons">
          <button aria-label="后退" @click="router.back()">
            <ChevronLeft :size="19" /></button
          ><button aria-label="前进" @click="router.forward()">
            <ChevronRight :size="19" />
          </button>
        </div>
        <form class="search-field" @submit.prevent="search">
          <Search :size="17" /><input
            v-model="query"
            aria-label="搜索音乐"
            placeholder="搜索歌曲或歌手"
            maxlength="100"
          /><kbd>↵</kbd>
        </form>
        <span class="topbar-note">好音乐，慢慢听。</span>
        <WindowControls />
      </header>
      <main>
        <div
          v-if="account.session.warning"
          class="session-notice"
          role="status"
        >
          {{ account.session.warning
          }}<button :disabled="account.restoring" @click="account.restore">
            重新检查
          </button>
        </div>
        <RouterView @login="openAccount" />
      </main>
    </div>
    <Transition name="lyrics-sheet">
      <section v-if="player.lyricsOpen" class="lyrics-overlay" :class="{ 'lyrics-immersive': appearance.lyricsStyle === 'immersive' }" :style="lyricsBackground" aria-label="正在播放与歌词">
        <div v-if="appearance.lyricsStyle === 'immersive'" class="immersive-background" aria-hidden="true"><img v-if="player.state.song?.cover" :src="player.state.song.cover" alt="" /></div>
        <header class="lyrics-topbar">
          <button ref="collapseLyrics" class="collapse-lyrics" aria-label="收起歌词，返回原页面"
            title="收起歌词" @click="player.lyricsOpen = false"><X v-if="appearance.lyricsStyle === 'immersive'" :size="24"/><ChevronDown v-else :size="24" /></button>
          <span class="lyrics-heading"><Radio v-if="player.isRoaming" :size="17" />
            {{ player.isRoaming ? '私人漫游' : '正在播放' }}</span>
          <RoamingModePicker v-if="player.isRoaming" :model-value="player.roamingMode"
            :disabled="player.roamingLoading || player.reducing" @update:model-value="player.startRoaming" />
          <WindowControls />
        </header>
        <NowPlayingView />
      </section>
    </Transition>
    <PlayerBar v-show="!(player.lyricsOpen && appearance.lyricsStyle === 'immersive')" @queue="queueOpen = true" />
    <div v-if="library.message" class="library-toast" role="status">
      <span>{{ library.message }}</span
      ><button aria-label="关闭提示" @click="library.message = ''">
        <X :size="15" />
      </button>
    </div>
    <div
      v-if="loginOpen || settingsOpen || queueOpen"
      class="modal-backdrop"
      @click.self="closeModal"
    >
      <section
        ref="dialog"
        class="modal"
        :class="{ 'queue-modal': queueOpen }"
        role="dialog"
        aria-modal="true"
        :aria-label="
          loginOpen ? '扫码登录' : settingsOpen ? '设置' : '播放队列'
        "
      >
        <button class="modal-close" aria-label="关闭" @click="closeModal">
          <X :size="20" />
        </button>
        <QrLoginPanel v-if="loginOpen" @complete="closeModal" />
        <template v-else-if="settingsOpen"
          ><h2>设置</h2>
          <div class="setting-row">
            <span>外观主题</span><span class="theme-chip">浅色</span>
          </div>
          <p>深色模式将在后续版本提供。</p>
          <div class="setting-row">
            <label for="lyrics-style">歌词页面样式</label>
            <select id="lyrics-style" v-model="appearance.lyricsStyle" class="lyrics-style-select"><option value="classic">经典歌词</option><option value="immersive">沉浸歌词（Apple Music 风格）</option></select>
          </div>
          <p>沉浸样式使用封面氛围背景，并将播放控制放在封面下方。</p>
          <div class="setting-row">
            <span>默认音质</span><QualityPicker v-model="player.quality" />
          </div>
          <p>切换音质会重新加载当前歌曲并保留进度；实际音质以播放栏显示为准。</p>
          <div class="setting-row">
            <label for="close-to-tray">关闭窗口时最小化到托盘</label>
            <input id="close-to-tray" class="setting-switch" type="checkbox" role="switch"
              :checked="closeToTray" :disabled="desktopSettingsBusy || !isDesktop" @change="setCloseToTray" />
          </div>
          <p>开启后，点击 × 会隐藏窗口并继续播放；可从托盘菜单退出。</p>
          <p v-if="desktopSettingsError" class="inline-error" role="alert">{{ desktopSettingsError }}</p>
          <StorageSettings />
          <div class="setting-row">
            <span>Easy Music</span><span>v0.1.0</span>
          </div>
          <div v-if="account.session.authenticated" class="setting-row">
            <span>{{ account.session.profile?.nickname || "已登录账号" }}</span
            ><button class="logout-button" @click="account.logout">
              退出登录
            </button>
          </div></template
        >
        <QueuePanel v-else />
      </section>
    </div>
  </div>
  <PlaylistDialogs />
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { X, Plus, ListMusic, LoaderCircle, ChevronLeft } from "@lucide/vue";
import type { PlaylistTag } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useLibraryStore } from "../stores/library";
import { usePlaylistActionsStore } from "../stores/playlist-actions";
import { useAccountStore } from "../stores/account";
import { restoreFocus } from '../focus';
const actions = usePlaylistActionsStore();
const library = useLibraryStore();
const account = useAccountStore();
const removingOwn = computed(() => actions.playlist?.creatorId === account.session.profile?.userId);
const panel = ref<HTMLElement | null>(null);
const name = ref('');
const description = ref('');
const privatePlaylist = ref(false);
const tags = ref<string[]>([]);
const catalog = ref<PlaylistTag[]>([]);
const tagsOpen = ref(false);
const tagsLoading = ref(false);
const tagsError = ref('');
const category = ref('');
const categoryOrder = ['语种', '风格', '场景', '情感', '主题'];
const categories = computed(() => [...new Set(catalog.value.map(tag => tag.category))].sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)));
const title = computed(() => actions.dialog === 'add' ? '收藏到歌单' : actions.dialog === 'create' ? '创建歌单' : actions.dialog === 'edit' ? '编辑歌单信息' : actions.dialog === 'remove-playlist' ? (removingOwn.value ? '删除歌单' : '取消收藏歌单') : '从歌单中删除');
const canSave = computed(() => name.value.trim().length > 0 && !actions.busy && (actions.dialog !== 'edit' || name.value.trim() !== actions.playlist?.name || description.value !== (actions.playlist?.description || '') || JSON.stringify(tags.value) !== JSON.stringify(actions.playlist?.tags || [])));
let previousFocus: HTMLElement | null = null;
let generation = 0;
async function loadTags() {
  const current = ++generation;
  tagsLoading.value = true; tagsError.value = '';
  try { const result = unwrap(await desktop().music.playlistTags()); if (current === generation) { catalog.value = result; category.value = categories.value[0] || ''; } }
  catch (reason) { if (current === generation) tagsError.value = errorMessage(reason); }
  finally { if (current === generation) tagsLoading.value = false; }
}
watch(() => actions.dialog, async (value, old) => {
  generation++;
  tagsOpen.value = false;
  if (!value) { await nextTick(); restoreFocus(previousFocus); return; }
  if (!old) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (value === 'create') { name.value = ''; privatePlaylist.value = false; }
  if (value === 'edit') {
    name.value = actions.playlist?.name || ''; description.value = actions.playlist?.description || ''; tags.value = [...(actions.playlist?.tags || [])];
    void loadTags();
  }
  await nextTick();
  panel.value?.querySelector<HTMLElement>('input, button:not(:disabled)')?.focus();
}, { immediate: true });
function toggleTag(name: string) {
  if (tags.value.includes(name)) tags.value = tags.value.filter(tag => tag !== name);
  else if (tags.value.length < 3) tags.value = [...tags.value, name];
}
function keyboard(event: KeyboardEvent) {
  if (!actions.dialog) return;
  if (event.key === 'Escape') { event.preventDefault(); if (tagsOpen.value) tagsOpen.value = false; else actions.close(); }
  if (event.key !== 'Tab') return;
  const focusable = [...(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])];
  if (!focusable.length) { event.preventDefault(); panel.value?.focus(); return; }
  if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
  else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
}
onMounted(() => document.addEventListener('keydown', keyboard));
onUnmounted(() => { generation++; document.removeEventListener('keydown', keyboard); });
</script>
<template>
  <Teleport to="body">
    <div v-if="actions.dialog" class="playlist-dialog-backdrop" @click.self="actions.close()">
      <section ref="panel" class="playlist-dialog" :class="{ 'playlist-edit-dialog': actions.dialog === 'edit' }" role="dialog" aria-modal="true" :aria-label="title" :aria-busy="actions.busy" tabindex="-1">
        <button class="modal-close" aria-label="关闭歌单窗口" :disabled="actions.busy" @click="actions.close()"><X :size="20" /></button>
        <h2>{{ title }}</h2>
        <template v-if="actions.dialog === 'add'">
          <p class="dialog-description">将 {{ actions.songs.length }} 首歌曲收藏到你的歌单</p>
          <div class="playlist-picker-list">
            <button class="playlist-picker-row" :disabled="actions.busy" @click="actions.openCreate(true)"><span class="create-playlist-cover"><Plus :size="25" /></span><span>创建新歌单</span></button>
            <p v-if="library.loading" class="dialog-description" role="status">正在加载歌单…</p>
            <div v-if="library.error" class="inline-error" role="alert">{{ library.error }} <button @click="library.loadPlaylists(true)">重试</button></div>
            <button v-for="playlist in library.writablePlaylists" :key="playlist.id" class="playlist-picker-row" :disabled="actions.busy" @click="actions.addTo(playlist)"><img v-if="playlist.cover" :src="`${playlist.cover}?param=100y100`" alt="" /><span v-else class="create-playlist-cover"><ListMusic :size="23" /></span><span><strong>{{ playlist.name }}</strong><small>{{ playlist.trackCount }} 首歌曲</small></span></button>
          </div>
        </template>
        <form v-else-if="actions.dialog === 'create'" class="playlist-form" @submit.prevent="actions.create(name.trim(), privatePlaylist)">
          <button v-if="actions.songs.length" type="button" class="dialog-back" :disabled="actions.busy" @click="actions.backToAdd()"><ChevronLeft :size="16" />返回歌单列表</button>
          <label for="playlist-create-name">歌单名称</label><input id="playlist-create-name" v-model="name" maxlength="40" placeholder="输入歌单标题" required :disabled="actions.busy" /><small class="field-count">{{ name.length }}/40</small>
          <label class="checkbox-label"><input v-model="privatePlaylist" type="checkbox" :disabled="actions.busy" />设为隐私歌单</label>
          <button class="primary-button dialog-submit" :disabled="!canSave">{{ actions.busy ? '正在创建…' : '创建' }}</button>
        </form>
        <form v-else-if="actions.dialog === 'edit'" class="playlist-form" @submit.prevent="actions.saveEdit({ name: name.trim(), description, tags })">
          <div class="playlist-edit-layout"><div><label for="playlist-edit-name">名称</label><input id="playlist-edit-name" v-model="name" maxlength="40" required :disabled="actions.busy" /><small class="field-count">{{ name.length }}/40</small><label for="playlist-edit-description">简介</label><textarea id="playlist-edit-description" v-model="description" maxlength="1000" rows="6" :disabled="actions.busy" placeholder="介绍一下这张歌单吧" /><small class="field-count">{{ description.length }}/1000</small></div><img v-if="actions.playlist?.cover" :src="`${actions.playlist.cover}?param=300y300`" alt="当前歌单封面" /></div>
          <div class="playlist-tags-field"><span>标签</span><div class="selected-playlist-tags"><button v-for="tag in tags" :key="tag" type="button" :disabled="actions.busy" @click="toggleTag(tag)">{{ tag }}<X :size="12" /></button><button type="button" :disabled="actions.busy" @click="tagsOpen = !tagsOpen"><Plus :size="13" />选择标签</button></div><small>最多选择 3 个</small></div>
          <div v-if="tagsOpen" class="playlist-tag-picker"><p v-if="tagsLoading" role="status">正在加载标签…</p><p v-else-if="tagsError" class="inline-error" role="alert">{{ tagsError }} <button type="button" @click="loadTags">重试</button></p><template v-else><div class="tag-categories"><button v-for="item in categories" :key="item" type="button" :class="{ active: category === item }" @click="category = item">{{ item }}</button></div><div class="tag-options"><button v-for="tag in catalog.filter(item => item.category === category)" :key="tag.name" type="button" :aria-pressed="tags.includes(tag.name)" :disabled="actions.busy || (!tags.includes(tag.name) && tags.length >= 3)" :class="{ selected: tags.includes(tag.name) }" @click="toggleTag(tag.name)">{{ tag.name }}</button></div></template></div>
          <div class="dialog-footer"><button class="primary-button" :disabled="!canSave">{{ actions.busy ? '正在保存…' : '保存' }}</button><button type="button" class="secondary-button" :disabled="actions.busy" @click="actions.close()">取消</button></div>
        </form>
        <template v-else-if="actions.dialog === 'remove-playlist'">
          <p class="delete-playlist-copy">{{ removingOwn ? '确定删除' : '确定取消收藏' }}「{{ actions.playlist?.name }}」？</p>
          <p class="dialog-description">{{ removingOwn ? '删除后无法恢复，请确认后再操作。' : '这张歌单将从你的收藏列表中移除。' }}</p>
          <div class="dialog-footer"><button class="primary-button" :disabled="actions.busy" @click="actions.removePlaylist()">{{ actions.busy ? '正在处理…' : removingOwn ? '确认删除' : '取消收藏' }}</button><button class="secondary-button" :disabled="actions.busy" @click="actions.close()">返回</button></div>
        </template>
        <template v-else>
          <p class="delete-playlist-copy">{{ actions.playlist?.specialType === 5 ? '取消喜欢' : '从「' + actions.playlist?.name + '」中移除' }}所选的 {{ actions.songs.length }} 首歌曲？</p>
          <p class="dialog-description">{{ actions.songs.slice(0, 3).map(song => song.title).join('、') }}{{ actions.songs.length > 3 ? '…' : '' }}</p>
          <div class="dialog-footer"><button class="primary-button" :disabled="actions.busy" @click="actions.removeSongs()">{{ actions.busy ? '正在处理…' : '确认移除' }}</button><button class="secondary-button" :disabled="actions.busy" @click="actions.close()">取消</button></div>
        </template>
        <p v-if="actions.error" class="inline-error" role="alert">{{ actions.error }}</p>
        <p v-if="actions.busy" class="dialog-description" role="status"><LoaderCircle class="spin" :size="15" />正在处理，请稍候…</p>
      </section>
    </div>
  </Teleport>
</template>

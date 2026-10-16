<script setup lang="ts">
import { Play, Plus, Music2, AudioLines, Heart, ListPlus, Trash2 } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { useLibraryStore } from "../stores/library";
import type { Playlist, Song } from "../../../shared/contracts";
import { useAccountStore } from "../stores/account";
import { usePlaylistActionsStore } from "../stores/playlist-actions";
import ActionMenu from "./ActionMenu.vue";
import { usePlayerStore } from "../stores/player";
import { formatTime } from "../player/queue";
const props = defineProps<{ songs: Song[]; playlist?: Playlist | null; batch?: boolean }>();
const emit = defineEmits<{ 'update:batch': [value: boolean] }>();
const player = usePlayerStore();
const library = useLibraryStore();
const account = useAccountStore();
const playlistActions = usePlaylistActionsStore();
const canDelete = computed(() => !!props.playlist && account.session.authenticated && props.playlist.creatorId === account.session.profile?.userId);
const selected = ref(new Set<number>());
const selectedSongs = computed(() => props.songs.filter(song => selected.value.has(song.id)));
const allSelected = computed(() => props.songs.length > 0 && selectedSongs.value.length === props.songs.length);
function toggleSelected(id: number) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next; }
watch(() => props.batch, () => { selected.value = new Set(); });
watch(() => props.songs, songs => { const ids = new Set(songs.map(song => song.id)); selected.value = new Set([...selected.value].filter(id => ids.has(id))); });
function addQueue(songs: Song[]) { player.enqueueAll(songs); library.showMessage(player.isRoaming ? '已添加至普通播放列表。' : '已添加至播放列表。'); }
function items(song: Song) {
  return [
    { label: '播放', action: () => player.playSong(song) },
    { label: '下一首播放', action: () => { player.enqueueNext(song); library.showMessage(player.isRoaming ? '已加入普通播放列表。' : '已设为下一首播放。'); } },
    { label: '添加到播放列表', action: () => addQueue([song]) },
    { label: '收藏到歌单', action: () => playlistActions.openAdd([song]) },
    ...(canDelete.value ? [{ label: '从歌单中删除', danger: true, action: () => playlistActions.openDelete([song], props.playlist!) }] : []),
  ];
}
</script>

<template>
  <div v-if="batch" class="batch-toolbar">
    <span>已选 {{ selectedSongs.length }} 首歌曲</span>
    <button class="primary-button" :disabled="!selectedSongs.length" @click="player.playAll(selectedSongs)"><Play :size="15" />播放</button>
    <button class="secondary-button" :disabled="!selectedSongs.length" @click="addQueue(selectedSongs)"><Plus :size="15" />添加到播放列表</button>
    <button class="secondary-button" :disabled="!selectedSongs.length" @click="playlistActions.openAdd(selectedSongs)"><ListPlus :size="15" />收藏到歌单</button>
    <button v-if="canDelete" class="secondary-button" :disabled="!selectedSongs.length" @click="playlistActions.openDelete(selectedSongs, playlist!)"><Trash2 :size="15" />删除</button>
    <button class="secondary-button batch-done" @click="emit('update:batch', false)">完成</button>
  </div>
  <table class="song-table">
    <thead>
      <tr>
        <th class="number-column"><input v-if="batch" type="checkbox" aria-label="全选歌曲" :checked="allSelected" :indeterminate="!!selectedSongs.length && !allSelected" @change="selected = allSelected ? new Set() : new Set(songs.map(song => song.id))" /><template v-else>#</template></th>
        <th>歌曲</th>
        <th class="album-column">专辑</th>
        <th class="duration-column">时长</th>
        <th class="actions-column"><span class="sr-only">操作</span></th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="(song, index) in songs"
        :key="song.id"
        :class="{ 'song-current': player.state.song?.id === song.id }"
        @click="batch && toggleSelected(song.id)"
        @dblclick="!batch && player.playSong(song)"
      >
        <td class="row-number">
          <input v-if="batch" type="checkbox" :aria-label="`选择 ${song.title}`" :checked="selected.has(song.id)" @click.stop @change="toggleSelected(song.id)" />
          <AudioLines
            v-else-if="player.state.song?.id === song.id"
            :size="15"
          /><span v-else>{{ String(index + 1).padStart(2, "0") }}</span>
        </td>
        <td>
          <div class="song-cell">
            <button class="song-thumbnail" :aria-label="`播放 ${song.title} 并查看歌词`"
              @click.stop="batch ? toggleSelected(song.id) : (player.playSong(song), player.lyricsOpen = true)" @dblclick.stop>
              <img
                v-if="song.cover"
                :src="`${song.cover}?param=96y96`"
                alt=""
                loading="lazy"
              /><Music2 v-else :size="18" />
            </button>
            <div class="song-description">
              <button
                class="song-title"
                :title="song.title"
                @click.stop="batch ? toggleSelected(song.id) : player.playSong(song)"
              >
                {{ song.title }}
              </button>
              <p :title="song.artists" class="artist-links" @dblclick.stop><template v-if="song.artistRefs?.length"><template v-for="(artist, artistIndex) in song.artistRefs" :key="artist.id"><span v-if="artistIndex"> / </span><RouterLink :to="`/artist/${artist.id}`">{{ artist.name }}</RouterLink></template></template><template v-else>{{ song.artists }}</template></p>
            </div>
          </div>
        </td>
        <td class="album-column">
          <RouterLink v-if="song.albumId" class="ellipsis catalog-text-link" :to="`/album/${song.albumId}`" :title="song.album" @dblclick.stop>{{ song.album }}</RouterLink><span v-else class="ellipsis" :title="song.album">{{ song.album }}</span>
        </td>
        <td class="song-duration">{{ formatTime(song.duration) }}</td>
        <td>
          <div v-if="!batch" class="song-actions" @click.stop>
            <button
              :class="{ 'is-liked': library.likedIds.has(song.id) }"
              :disabled="library.pending.has(song.id)"
              :aria-label="`${library.likedIds.has(song.id) ? '取消喜欢' : '喜欢'} ${song.title}`"
              :title="library.likedIds.has(song.id) ? '取消喜欢' : '喜欢'"
              @click="library.toggleLike(song)"
            >
              <Heart
                :size="16"
                :fill="library.likedIds.has(song.id) ? 'currentColor' : 'none'"
              />
            </button>
            <button
              :aria-label="`播放 ${song.title}`"
              title="播放"
              @click="player.playSong(song)"
            >
              <Play :size="16" /></button
            ><button
              :aria-label="`将 ${song.title} 加入队列`"
              title="加入队列"
              @click="player.enqueue(song)"
            >
              <Plus :size="17" />
            </button>
            <button :aria-label="`将 ${song.title} 收藏到歌单`" title="收藏到歌单" @click="playlistActions.openAdd([song])"><ListPlus :size="17" /></button>
            <ActionMenu :label="`${song.title} 更多操作`" :items="items(song)" />
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>

import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Playlist, PlaylistEdit, Song } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "./account";
import { useLibraryStore } from "./library";

export const usePlaylistActionsStore = defineStore("playlist-actions", () => {
  const account = useAccountStore();
  const library = useLibraryStore();
  const dialog = ref<"add" | "create" | "edit" | "delete" | "remove-playlist" | null>(null);
  const songs = ref<Song[]>([]);
  const playlist = ref<Playlist | null>(null);
  const busy = ref(false);
  const error = ref("");
  let generation = 0;
  watch(() => account.session.authenticated ? account.session.profile?.userId : null, () => {
    generation++; dialog.value = null; songs.value = []; playlist.value = null; busy.value = false; error.value = "";
  }, { flush: "sync" });
  function requireAccount() {
    if (account.session.authenticated) return true;
    library.showMessage("请先扫码登录，再管理歌单。"); return false;
  }
  function close() { if (!busy.value) { dialog.value = null; songs.value = []; playlist.value = null; error.value = ""; } }
  function openAdd(value: Song[]) {
    if (!requireAccount() || !value.length) return;
    songs.value = [...new Map(value.map(song => [song.id, song])).values()];
    playlist.value = null; error.value = ""; dialog.value = "add";
    void library.loadPlaylists(true);
  }
  function openCreate(fromAdd = false) {
    if (!requireAccount()) return;
    if (!fromAdd) songs.value = [];
    playlist.value = null; error.value = ""; dialog.value = "create";
  }
  function backToAdd() { if (!busy.value && songs.value.length) { error.value = ""; dialog.value = "add"; } }
  function openEdit(value: Playlist) {
    if (!requireAccount() || value.creatorId !== account.session.profile?.userId || value.specialType === 5) return;
    playlist.value = value; error.value = ""; dialog.value = "edit";
  }
  function openDelete(value: Song[], from: Playlist) {
    if (!requireAccount() || from.creatorId !== account.session.profile?.userId || !value.length) return;
    songs.value = value; playlist.value = from; error.value = ""; dialog.value = "delete";
  }
  function openRemovePlaylist(value: Playlist) {
    if (!requireAccount() || value.specialType === 5 || library.playlistPending.has(value.id)) return;
    playlist.value = value; songs.value = []; error.value = ""; dialog.value = "remove-playlist";
  }
  async function removePlaylist() {
    if (busy.value || !playlist.value) return;
    const current = generation;
    const target = playlist.value;
    busy.value = true; error.value = "";
    try {
      const removed = target.creatorId === account.session.profile?.userId
        ? await library.deletePlaylist(target)
        : await library.setPlaylistSaved(target, false);
      if (current === generation && removed) dialog.value = null;
      else if (current === generation) error.value = "未能取消收藏，请稍后重试。";
    } catch (reason) { if (current === generation) error.value = errorMessage(reason); }
    finally { if (current === generation) busy.value = false; }
  }
  async function addTo(target: Playlist) {
    if (busy.value || !songs.value.length) return;
    const current = generation;
    busy.value = true; error.value = "";
    try {
      unwrap(await desktop().music.changePlaylistSongs(target.id, songs.value.map(song => song.id), "add"));
      if (current !== generation) return;
      library.playlistChanged(target.id, target.specialType === 5);
      library.showMessage(`已收藏到「${target.name}」。`);
      dialog.value = null; songs.value = [];
    } catch (reason) {
      if (current === generation) { error.value = errorMessage(reason); library.playlistChanged(target.id, target.specialType === 5); }
    } finally { if (current === generation) busy.value = false; }
  }
  async function create(name: string, privatePlaylist: boolean) {
    if (busy.value) return;
    const current = generation;
    busy.value = true; error.value = "";
    let created: Playlist | null = null;
    try {
      created = unwrap(await desktop().music.createPlaylist(name, privatePlaylist));
      if (current !== generation) return;
      library.upsertPlaylist(created);
      library.playlistChanged(created.id);
      library.showMessage("歌单已创建。");
      dialog.value = songs.value.length ? "add" : null;
    } catch (reason) { if (current === generation) error.value = errorMessage(reason); }
    finally { if (current === generation) busy.value = false; }
    if (current === generation && created && songs.value.length) await addTo(created);
    return current === generation ? created : null;
  }
  async function saveEdit(value: PlaylistEdit) {
    if (busy.value || !playlist.value) return;
    const current = generation;
    const target = playlist.value;
    busy.value = true; error.value = "";
    try {
      // Vue proxies cannot cross Electron's structured-clone boundary.
      // Build a plain snapshot, including a fresh array for nested form fields.
      const payload: PlaylistEdit = {
        name: value.name,
        description: value.description,
        tags: Array.from(value.tags),
      };
      unwrap(await desktop().music.updatePlaylist(target.id, payload));
      if (current !== generation) return;
      library.upsertPlaylist({ ...target, ...payload });
      library.playlistChanged(target.id);
      library.showMessage("歌单信息已保存。"); dialog.value = null;
    } catch (reason) { if (current === generation) { error.value = errorMessage(reason); library.playlistChanged(target.id); } }
    finally { if (current === generation) busy.value = false; }
  }
  async function removeSongs() {
    if (busy.value || !playlist.value || !songs.value.length) return;
    const current = generation;
    const target = playlist.value;
    busy.value = true; error.value = "";
    try {
      unwrap(await desktop().music.changePlaylistSongs(target.id, songs.value.map(song => song.id), "del"));
      if (current !== generation) return;
      library.playlistChanged(target.id, target.specialType === 5);
      library.showMessage(target.specialType === 5 ? "已取消喜欢。" : "已从歌单中移除歌曲。");
      dialog.value = null; songs.value = [];
    } catch (reason) { if (current === generation) { error.value = errorMessage(reason); library.playlistChanged(target.id, target.specialType === 5); } }
    finally { if (current === generation) busy.value = false; }
  }
  return { dialog, songs, playlist, busy, error, close, openAdd, openCreate, backToAdd, openEdit, openDelete, openRemovePlaylist, removePlaylist, addTo, create, saveEdit, removeSongs };
});

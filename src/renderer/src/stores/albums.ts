import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Album } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "./account";
import { useLibraryStore } from "./library";

export const useAlbumsStore = defineStore("albums", () => {
  const account = useAccountStore();
  const library = useLibraryStore();
  const albums = ref<Album[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  const error = ref("");
  const pending = ref(new Set<number>());
  let generation = 0;
  let version = 0;
  let request: Promise<void> | null = null;
  watch(() => account.session.authenticated ? account.session.profile?.userId : null, () => {
    generation++;
    version++;
    albums.value = [];
    loaded.value = loading.value = false;
    error.value = "";
    pending.value = new Set();
    request = null;
  }, { immediate: true });

  function load(refresh = false): Promise<void> {
    if (!account.session.authenticated || (loaded.value && !refresh)) return Promise.resolve();
    if (request) return request;
    const current = generation;
    loading.value = true;
    error.value = "";
    const task = (async () => {
      try {
        let atVersion: number;
        let result: Album[];
        do {
          atVersion = version;
          result = unwrap(await desktop().music.savedAlbums());
          if (current !== generation) return;
        } while (atVersion !== version);
        albums.value = result;
        loaded.value = true;
      } catch (reason) {
        if (current === generation) error.value = errorMessage(reason);
      } finally {
        if (current === generation) loading.value = false;
      }
    })();
    request = task;
    void task.finally(() => { if (request === task) request = null; });
    return task;
  }
  function isSaved(id: number) { return albums.value.some((album) => album.id === id); }
  async function toggle(album: Album) {
    if (!account.session.authenticated) { library.showMessage("请先扫码登录，再收藏专辑。"); return; }
    if (pending.value.has(album.id)) return;
    const current = generation;
    pending.value = new Set([...pending.value, album.id]);
    try {
      await load();
      if (current !== generation) return;
      if (!loaded.value) throw new Error(error.value || "暂时无法读取专辑收藏状态。");
      const saved = !isSaved(album.id);
      unwrap(await desktop().music.setAlbumSaved(album.id, saved));
      if (current !== generation) return;
      version++;
      albums.value = saved ? [album, ...albums.value.filter((a) => a.id !== album.id)] : albums.value.filter((a) => a.id !== album.id);
      library.showMessage(saved ? "已收藏专辑。" : "已取消收藏专辑。");
    } catch (reason) {
      if (current === generation) library.showMessage(errorMessage(reason));
    } finally {
      if (current === generation) { const next = new Set(pending.value); next.delete(album.id); pending.value = next; }
    }
  }
  return { albums, loading, loaded, error, pending, isSaved, load, toggle };
});

import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { desktop, unwrap } from "../api";
import { useAccountStore } from "./account";
import { useLibraryStore } from "./library";
import { useAlbumsStore } from "./albums";
import { usePlaylistActionsStore } from "./playlist-actions";

export const useSyncStore = defineStore("sync", () => {
  const account = useAccountStore();
  const library = useLibraryStore();
  const albums = useAlbumsStore();
  const actions = usePlaylistActionsStore();
  const revision = ref(0);
  let generation = 0;
  let lastStart = -Infinity;
  let pending: Promise<void> | null = null;
  watch(() => account.session.authenticated ? account.session.profile?.userId : null, () => {
    generation++; lastStart = -Infinity; pending = null;
  }, { flush: "sync" });
  function refresh(reason: "page" | "focus" = "page"): Promise<void> {
    if (!account.session.authenticated || !window.desktop) return Promise.resolve();
    if (pending) return pending;
    if (Date.now() - lastStart < (reason === "focus" ? 30000 : 5000)) return Promise.resolve();
    if (actions.busy || library.pending.size || library.playlistPending.size || albums.pending.size) return Promise.resolve();
    const current = generation;
    lastStart = Date.now();
    const task = (async () => {
      try {
        unwrap(await desktop().music.refreshAccountData());
        if (current !== generation) return;
        revision.value++;
        await Promise.allSettled([library.loadPlaylists(true, true), library.refreshLikes(), albums.load(true)]);
      } catch { if (current === generation) lastStart = -Infinity; }
    })();
    pending = task;
    void task.finally(() => { if (pending === task) pending = null; });
    return task;
  }
  return { revision, refresh };
});

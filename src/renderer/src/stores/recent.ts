import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { Song } from "../../../shared/contracts";
import { desktop, errorMessage, unwrap } from "../api";
import { useAccountStore } from "./account";

export const useRecentStore = defineStore("recent", () => {
  const account = useAccountStore();
  const songs = ref<Song[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  const error = ref("");
  let generation = 0;
  let version = 0;
  let request: Promise<void> | null = null;
  watch(() => account.session.authenticated ? account.session.profile?.userId : null, () => {
    generation++; version++; request = null;
    songs.value = []; loading.value = loaded.value = false; error.value = "";
  }, { flush: "sync" });
  function load(refresh = false): Promise<void> {
    if (!account.session.authenticated || (!refresh && loaded.value)) return Promise.resolve();
    if (request) return request;
    const current = generation;
    loading.value = true; error.value = "";
    const task = (async () => {
      try {
        let atVersion: number;
        let result: Song[];
        do {
          atVersion = version;
          result = unwrap(await desktop().music.recentSongs());
          if (current !== generation) return;
        } while (atVersion !== version);
        songs.value = result; loaded.value = true;
      } catch (reason) { if (current === generation) error.value = errorMessage(reason); }
      finally { if (current === generation) loading.value = false; }
    })();
    request = task;
    void task.finally(() => { if (request === task) request = null; });
    return task;
  }
  async function recordStarted(id: number): Promise<void> {
    if (!account.session.authenticated || typeof window.desktop?.music.recordPlayback !== "function") return;
    const current = generation;
    try {
      unwrap(await desktop().music.recordPlayback(id));
      if (current !== generation) return;
      version++;
      const reload = loaded.value;
      loaded.value = false;
      if (reload) void load(true);
    } catch {
      // Listening must continue even when cloud history reporting is unavailable.
      if (current === generation) loaded.value = false;
    }
  }
  return { songs, loading, loaded, error, load, recordStarted };
});

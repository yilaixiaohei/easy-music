import type { Song } from "../../../shared/contracts";

export type PlayMode = "order" | "loop" | "single" | "shuffle";
export const modes: PlayMode[] = ["order", "loop", "single", "shuffle"];

export function nextIndex(
  queue: Song[],
  current: number,
  mode: PlayMode,
  direction: 1 | -1,
  automatic = false,
  excluded = new Set<number>(),
  random = Math.random,
): number | null {
  if (!queue.length) return null;
  if (
    automatic &&
    mode === "single" &&
    current >= 0 &&
    !excluded.has(queue[current]?.id)
  )
    return current;
  if (mode === "shuffle") {
    const choices = queue
      .map((song, index) => ({ song, index }))
      .filter(
        ({ song, index }) =>
          !excluded.has(song.id) && (index !== current || queue.length === 1),
      );
    return choices.length
      ? choices[Math.floor(random() * choices.length)]!.index
      : null;
  }
  for (let step = 1; step <= queue.length; step++) {
    let index = current + direction * step;
    if (index < 0 || index >= queue.length) {
      if (mode === "order") return null;
      index = ((index % queue.length) + queue.length) % queue.length;
    }
    if (!excluded.has(queue[index]!.id)) return index;
  }
  return null;
}

export function validSong(value: any): value is Song {
  return (
    value &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    ["title", "artists", "album", "cover"].every(
      (key) => typeof value[key] === "string",
    ) &&
    Number.isFinite(value.duration) &&
    value.duration >= 0
  );
}

export function uniqueSongs(songs: Song[]): Song[] {
  return [
    ...new Map(songs.filter(validSong).map((song) => [song.id, song])).values(),
  ];
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

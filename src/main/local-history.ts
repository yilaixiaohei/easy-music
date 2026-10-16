import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Song } from "../shared/contracts";

export function historySongs(value: unknown): Song[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("本地播放记录格式无效。");
  const songs = value.map((item: Song) => {
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || !Number.isFinite(item.duration) || item.duration < 0 || [item.title, item.artists, item.album, item.cover].some(text => typeof text !== "string")) throw new Error("本地播放记录格式无效。");
    return { id: item.id, title: item.title, artists: item.artists, album: item.album, cover: item.cover, duration: item.duration,
      ...(Number.isSafeInteger(item.albumId) && item.albumId! > 0 ? { albumId: item.albumId } : {}),
      ...(Array.isArray(item.artistRefs) ? { artistRefs: item.artistRefs.filter(artist => Number.isSafeInteger(artist?.id) && artist.id > 0 && typeof artist.name === "string").map(({ id, name }) => ({ id, name })) } : {}),
    };
  });
  return [...new Map(songs.map(song => [song.id, song])).values()];
}
export class LocalHistoryStore {
  private file: string;
  constructor(private directory: string) { this.file = join(directory, "local-history.json"); }
  read(): Song[] | null {
    if (!existsSync(this.file)) return null;
    try { return historySongs(JSON.parse(readFileSync(this.file, "utf8"))); }
    catch { throw new Error("本地播放记录读取失败，原文件已保留。"); }
  }
  write(value: unknown): void {
    const songs = historySongs(value);
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(songs), "utf8");
    renameSync(`${this.file}.tmp`, this.file);
  }
}

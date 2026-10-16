// Read-only integration check. Does not load account credentials or change collections.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { MusicController } from "../src/main/music-controller";
const require = createRequire(import.meta.url);
const api = require("@neteasecloudmusicapienhanced/api");
async function main() {
  const controller = new MusicController(async (method, params) => {
    const result = await api[method]({ ...params, timeout: 12000, timestamp: Date.now() });
    return result.body;
  }, () => "");
  for (const kind of ["songs", "playlists", "albums", "artists"] as const) {
    const data = await controller.searchCatalog("房东的猫", 1, kind);
    assert.ok(data[kind].length);
    console.log(`PASS ${kind}: ${data[kind].length} results`);
  }
  const artists = await controller.searchCatalog("房东的猫", 1, "artists");
  const id = artists.artists.find(a => a.name === "房东的猫")!.id;
  const artist = await controller.artist(id);
  assert.equal(artist.songs.length, 50);
  console.log(`PASS popular: ${artist.songs.length} songs`);
  const songs = await controller.artistSongs(id);
  assert.ok(songs.length >= 50);
  console.log(`PASS all songs: ${songs.length}`);
  const albums = await controller.artistAlbums(id);
  assert.ok(albums.length > 0);
  console.log(`PASS all albums: ${albums.length}`);
  const description = await controller.artistDescription(id);
  assert.ok(description.brief || description.sections.length);
  console.log("PASS artist description");
  const album = await controller.album(albums[0].id);
  assert.ok(album.songs.length);
  assert.ok(album.songs[0].albumId);
  console.log(`PASS album detail: ${album.songs.length} songs`);
}
main().catch(() => { console.error("FAIL catalog integration check"); process.exitCode = 1; });

// Third-party code runs in a utility process; never forward its raw logs or errors.
import type { Result } from "../shared/contracts";
import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { apiFailure, apiFailureDetails, checkQr, playbackQuery, subscribePlaylist, RequestValidationTokens } from "./api-runtime";

console.log =
  console.info =
  console.warn =
  console.error =
  console.debug =
    () => {};

type Upstream = { body: Record<string, any> };
type ApiMethod = (params: Record<string, unknown>) => Promise<Upstream>;
const sdkDirectory = dirname(require.resolve("@neteasecloudmusicapienhanced/api"));
// Install before loading SDK request.js, which captures getToken at import time.
// SDK validation remains enabled; only the token for this one write is shared.
const tokenModule = require(join(sdkDirectory, "module/register_checktoken_v2.js"));
const validationTokens = new RequestValidationTokens(tokenModule.getToken);
tokenModule.getToken = validationTokens.getToken;
const api = require("@neteasecloudmusicapienhanced/api") as Record<
  string,
  ApiMethod
>;
const retryableReads = new Set(["login_qr_key", "login_qr_check", "login_status", "song_url_v1"]);

function logFailure(method: string, category: string, attempt: number, reason: unknown): void {
  const directory = process.env.EASY_MUSIC_LOG_DIRECTORY;
  if (!directory) return;
  try {
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "api-errors.log");
    try { if (statSync(path).size > 128 * 1024) writeFileSync(path, ""); } catch { /* First log entry. */ }
    // Never record parameters, QR keys, cookies, URLs or upstream error text.
    const failure = reason as { status?: unknown; body?: { code?: unknown } } | null;
    const status = typeof failure?.status === "number" && Number.isSafeInteger(failure.status) ? failure.status : undefined;
    const code = typeof failure?.body?.code === "number" && Number.isSafeInteger(failure.body.code) ? failure.body.code : undefined;
    appendFileSync(path, JSON.stringify({ time: new Date().toISOString(), method, category, attempt, status, code,
      ...(method === "playlist_subscribe" ? { transport: "eapi", subscriptionAdapter: "fresh-body-v2", ...apiFailureDetails(reason) } : {}),
    }) + "\n");
  } catch { /* Logging must not interrupt playback or login. */ }
}
const allowed = new Set([
  "login_qr_key",
  "login_qr_create",
  "login_qr_check",
  "login_status",
  "logout",
  "cloudsearch",
  "song_url_v1",
  "user_playlist",
  "playlist_detail",
  "song_detail",
  "personalized",
  "recommend_songs",
  "likelist",
  "like",
  "lyric",
  "personal_fm_mode",
  "fm_trash",
  "toplist_detail",
  "artists",
  "artist_songs",
  "artist_album",
  "artist_desc",
  "album",
  "album_sublist",
  "album_sub",
  "playlist_create",
  "playlist_update",
  "playlist_delete",
  "playlist_subscribe",
  "playlist_catlist",
  "playlist_tracks",
  "record_recent_song",
  "record_playback_start",
]);

process.parentPort.on("message", async ({ data }) => {
  const { id, method, params } = data as {
    id: number;
    method: string;
    params: Record<string, unknown>;
  };
  let result: Result<Record<string, any>>;
  try {
    if (!allowed.has(method)) throw new Error("Unsupported method");
    let response!: Upstream;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const requestParams = method === "song_url_v1" ? playbackQuery(params) : params;
        const query = { ...requestParams, timeout: 12000, timestamp: Date.now() };
        if (method === "record_playback_start") {
          const { cookieToJson } = require(join(sdkDirectory, "util"));
          const createOption = require(join(sdkDirectory, "util/option.js"));
          const { APP_CONF } = require(join(sdkDirectory, "util/config.json"));
          // Report only the actual start. Do not invent play durations or ranking counts.
          response = await require(join(sdkDirectory, "util/request.js"))("/api/feedback/weblog", {
            logs: JSON.stringify([{ action: "startplay", json: { id: params.id, type: "song", mainsite: "1", mainsiteWeb: "1", content: "id=0" } }]),
          }, { ...createOption({ ...query, cookie: { ...cookieToJson(String(params.cookie ?? "")), os: "osx" } }, "eapi"), domain: APP_CONF.clDomian });
        } else if (method === "playlist_subscribe") {
          response = await subscribePlaylist(api.playlist_subscribe,
            validationTokens.getToken, query, validationTokens);
        } else if (method === "login_qr_check") {
          const { cookieToJson } = require(join(sdkDirectory, "util"));
          const createOption = require(join(sdkDirectory, "util/option.js"));
          response = await checkQr(require(join(sdkDirectory, "util/request.js")), createOption({ ...query, cookie: cookieToJson(String(params.cookie ?? "")) }), params.key);
        } else response = await api[method](query);
        break;
      } catch (reason) {
        const failure = apiFailure(reason);
        logFailure(method, failure.category, attempt, reason);
        if (attempt === 2 || !retryableReads.has(method) || !failure.retry) throw new Error(failure.message);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (method === "playlist_detail" && typeof params.verifySavedState === "boolean") {
      const state = response.body.playlist?.subscribed;
      logFailure("playlist_subscribe_verify", typeof state !== "boolean" ? "state_unknown"
        : state === params.verifySavedState ? "state_matches" : "state_differs", 1,
        { body: { code: response.body.code } });
    }
    result = { ok: true, data: response.body };
  } catch (reason) {
    result = { ok: false, error: allowed.has(method) && reason instanceof Error ? reason.message : "音乐服务请求失败。" };
  }
  process.parentPort.postMessage({ id, result });
});

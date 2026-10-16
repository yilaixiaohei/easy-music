import type { PlaybackSource, Song } from "../../../shared/contracts";

export type PlaybackPhase = "idle" | "loading" | "playing" | "paused" | "error";
export interface PlaybackState {
  song: Song | null;
  phase: PlaybackPhase;
  position: number;
  duration: number;
  wantsPlayback: boolean;
  buffering: boolean;
  trial: boolean;
  lyricOffset: number;
  level: string;
  error: string;
}
export interface AudioPort {
  src: string;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  preload: string;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}
export const emptyPlayback = (): PlaybackState => ({
  song: null,
  phase: "idle",
  position: 0,
  duration: 0,
  wantsPlayback: false,
  buffering: false,
  trial: false,
  lyricOffset: 0,
  level: "",
  error: "",
});

export class PlaybackEngine {
  state = emptyPlayback();
  private audio: AudioPort | null = null;
  private generation = 0;
  private volume = 0.7;
  private muted = false;
  private cleanup: (() => void) | null = null;

  constructor(
    private options: {
      source(id: number): Promise<PlaybackSource>;
      createAudio(): AudioPort;
      changed(state: PlaybackState): void;
      ended(): void;
      started(song: Song): void;
      unavailable(): void;
    },
  ) {}

  private update(patch: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...patch };
    this.options.changed(this.state);
  }

  private release(): void {
    this.cleanup?.();
    this.cleanup = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
  }

  restore(song: Song, position: number): void {
    this.generation++;
    this.release();
    this.state = emptyPlayback();
    this.update({
      song,
      phase: "paused",
      position: Math.max(0, position),
      duration: song.duration,
    });
  }

  async play(song: Song, position = 0, autoplay = true): Promise<void> {
    const generation = ++this.generation;
    this.release();
    this.state = emptyPlayback();
    this.update({
      song,
      phase: "loading",
      duration: song.duration,
      position,
      wantsPlayback: autoplay,
    });
    try {
      const source = await this.options.source(song.id);
      if (generation !== this.generation) return;
      if (!source.url) {
        this.update({
          phase: "error",
          wantsPlayback: false,
          error: source.reason || "这首歌曲暂不可播放。",
        });
        this.options.unavailable();
        return;
      }
      const audio = this.options.createAudio();
      this.audio = audio;
      const current = () =>
        generation === this.generation && this.audio === audio;
      let loadTimer: ReturnType<typeof setTimeout> | undefined;
      const stopLoadTimer = () => clearTimeout(loadTimer);
      const startLoadTimer = () => {
        stopLoadTimer();
        loadTimer = setTimeout(() => {
          if (!current() || !this.state.wantsPlayback) return;
          this.update({
            phase: "error",
            wantsPlayback: false,
            buffering: false,
            error: "音频加载超时，请检查网络或重新播放。",
          });
          audio.pause();
        }, 20000);
      };
      const handlers: [string, () => void][] = [];
      const listen = (type: string, action: () => void) => {
        const handler = () => {
          if (current()) action();
        };
        handlers.push([type, handler]);
        audio.addEventListener(type, handler);
      };
      this.cleanup = () => {
        stopLoadTimer();
        handlers.forEach(([type, handler]) =>
          audio.removeEventListener(type, handler),
        );
      };
      let recorded = false;
      listen("loadedmetadata", () => {
        const duration = Number.isFinite(audio.duration)
          ? Math.max(0, audio.duration)
          : song.duration;
        const requested = this.state.position;
        const start = requested < duration - 0.5 ? Math.max(0, requested) : 0;
        if (start > 0) audio.currentTime = start;
        this.update({ duration, position: start });
      });
      listen("durationchange", () => {
        if (Number.isFinite(audio.duration))
          this.update({ duration: Math.max(0, audio.duration) });
      });
      listen("timeupdate", () =>
        this.update({
          position: Number.isFinite(audio.currentTime)
            ? Math.max(0, audio.currentTime)
            : 0,
        }),
      );
      listen("waiting", () => {
        this.update({ buffering: this.state.wantsPlayback });
        if (this.state.wantsPlayback) startLoadTimer();
      });
      listen("playing", () => {
        stopLoadTimer();
        if (!this.state.wantsPlayback) {
          audio.pause();
          return;
        }
        this.update({ phase: "playing", buffering: false });
        if (!recorded) {
          recorded = true;
          this.options.started(song);
        }
      });
      listen("pause", () => {
        stopLoadTimer();
        if (this.state.phase !== "error")
          this.update({ phase: "paused", buffering: false });
      });
      listen("ended", () => {
        this.update({
          phase: "paused",
          wantsPlayback: false,
          buffering: false,
        });
        this.options.ended();
      });
      listen("error", () => {
        stopLoadTimer();
        this.update({
          phase: "error",
          wantsPlayback: false,
          buffering: false,
          error: "音频加载失败，请检查网络、切换音质或重新播放。",
        });
      });
      audio.preload = "auto";
      audio.volume = this.volume;
      audio.muted = this.muted;
      audio.src = source.url;
      this.update({
        trial: source.trial,
        lyricOffset: source.trialStart ?? 0,
        level: source.level,
        phase: "paused",
      });
      if (this.state.wantsPlayback) {
        startLoadTimer();
        await this.resume();
        if (this.state.phase === "error") stopLoadTimer();
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.update({
        phase: "error",
        wantsPlayback: false,
        buffering: false,
        error: error instanceof Error ? error.message : "播放失败，请重试。",
      });
    }
  }

  pause(): void {
    this.update({ wantsPlayback: false, buffering: false });
    this.audio?.pause();
  }

  async resume(): Promise<void> {
    if (!this.state.song) return;
    if (!this.audio || this.state.phase === "error") {
      await this.play(this.state.song, this.state.position);
      return;
    }
    const audio = this.audio;
    const generation = this.generation;
    this.update({ wantsPlayback: true, error: "" });
    try {
      await audio.play();
    } catch (error) {
      if (generation !== this.generation || !this.state.wantsPlayback) return;
      this.update({
        phase: "error",
        wantsPlayback: false,
        error:
          error instanceof Error && error.name === "NotAllowedError"
            ? "请点击播放按钮开始播放。"
            : "播放启动失败，请重试。",
      });
    }
  }

  seek(position: number): void {
    if (
      !this.state.song ||
      !Number.isFinite(position) ||
      this.state.phase === "error"
    )
      return;
    const value = Math.max(0, Math.min(position, this.state.duration));
    if (!this.audio) { this.update({ position: value }); return; }
    try {
      this.audio.currentTime = value;
      this.update({ position: value });
    } catch {
      /* Metadata is not available yet; keep the current position. */
    }
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = Math.max(
      0,
      Math.min(1, Number.isFinite(volume) ? volume : 0.7),
    );
    this.muted = muted;
    if (this.audio) {
      this.audio.volume = this.volume;
      this.audio.muted = muted;
    }
  }

  stop(): void {
    this.generation++;
    this.release();
    this.state = emptyPlayback();
    this.update({});
  }
}

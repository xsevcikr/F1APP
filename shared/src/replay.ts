// Playback clock for replays and for following a live session.
// The clock is pure: callers pass the wall time, which keeps it easy to test.

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5, 10] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface ClockState {
  /** Session time being shown (epoch ms). */
  t: number;
  playing: boolean;
  speed: PlaybackSpeed;
  /** When true, the clock tracks the live edge instead of advancing on its own. */
  followLive: boolean;
}

export class ReplayClock {
  private state: ClockState;
  private anchorWall: number;
  private anchorT: number;
  start: number;
  end: number;

  constructor(start: number, end: number, wallNow: number, initial?: Partial<ClockState>) {
    this.start = start;
    this.end = end;
    this.state = { t: start, playing: false, speed: 1, followLive: false, ...initial };
    this.state.t = this.clamp(this.state.t);
    this.anchorWall = wallNow;
    this.anchorT = this.state.t;
  }

  private clamp(t: number) {
    return Math.min(this.end, Math.max(this.start, t));
  }

  /** Current state, advancing the clock to wallNow. */
  tick(wallNow: number, liveEdge?: number): ClockState {
    if (this.state.followLive && liveEdge !== undefined) {
      this.end = Math.max(this.end, liveEdge);
      this.state.t = this.clamp(liveEdge);
      this.rebase(wallNow);
    } else if (this.state.playing) {
      const t = this.anchorT + (wallNow - this.anchorWall) * this.state.speed;
      this.state.t = this.clamp(t);
      if (this.state.t >= this.end) {
        this.state.playing = false;
        this.rebase(wallNow);
      }
    }
    return { ...this.state };
  }

  private rebase(wallNow: number) {
    this.anchorWall = wallNow;
    this.anchorT = this.state.t;
  }

  play(wallNow: number) {
    this.tick(wallNow);
    if (this.state.t >= this.end) this.state.t = this.start;
    this.state.playing = true;
    this.state.followLive = false;
    this.rebase(wallNow);
  }

  pause(wallNow: number) {
    this.tick(wallNow);
    this.state.playing = false;
    this.rebase(wallNow);
  }

  toggle(wallNow: number) {
    if (this.state.playing) this.pause(wallNow);
    else this.play(wallNow);
  }

  setSpeed(speed: PlaybackSpeed, wallNow: number) {
    if (!PLAYBACK_SPEEDS.includes(speed)) throw new Error(`Unsupported speed ${speed}`);
    this.tick(wallNow);
    this.state.speed = speed;
    this.rebase(wallNow);
  }

  seek(t: number, wallNow: number) {
    this.state.t = this.clamp(t);
    this.state.followLive = false;
    this.rebase(wallNow);
  }

  /** Steps by a delta, e.g. -10 s; keeps play state. */
  step(deltaMs: number, wallNow: number) {
    this.tick(wallNow);
    this.seek(this.state.t + deltaMs, wallNow);
  }

  goLive(wallNow: number) {
    this.state.followLive = true;
    this.state.playing = true;
    this.rebase(wallNow);
  }

  setRange(start: number, end: number) {
    this.start = start;
    this.end = end;
    this.state.t = this.clamp(this.state.t);
    this.anchorT = this.state.t;
  }

  /** Jumps to the next or previous marker relative to the current time. */
  jumpToMarker(markers: readonly number[], direction: 1 | -1, wallNow: number): number | null {
    this.tick(wallNow);
    const t = this.state.t;
    const sorted = [...markers].sort((a, b) => a - b);
    const target = direction === 1 ? sorted.find((m) => m > t + 500) : [...sorted].reverse().find((m) => m < t - 500);
    if (target === undefined) return null;
    this.seek(target, wallNow);
    return target;
  }
}

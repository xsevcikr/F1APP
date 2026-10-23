// A queueing rate limiter that enforces several sliding-window limits at once,
// e.g. OpenF1's free tier: 3 requests per second and 30 per minute.

export interface Limit {
  max: number;
  windowMs: number;
}

export class RateLimiter {
  private stamps: number[] = [];
  private queue: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly longest: number;

  constructor(
    private limits: Limit[],
    private now: () => number = Date.now,
  ) {
    this.longest = Math.max(...limits.map((l) => l.windowMs));
  }

  setLimits(limits: Limit[]) {
    this.limits = limits;
  }

  /** Milliseconds until another request is allowed (0 when allowed now). */
  waitTime(): number {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < this.longest);
    let wait = 0;
    for (const l of this.limits) {
      const inWindow = this.stamps.filter((s) => t - s < l.windowMs);
      if (inWindow.length >= l.max) wait = Math.max(wait, inWindow[inWindow.length - l.max] + l.windowMs - t);
    }
    return wait;
  }

  get pending() {
    return this.queue.length;
  }

  /** Runs fn once the limits allow it. */
  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.stamps.push(this.now());
        fn().then(resolve, reject);
      });
      this.pump();
    });
  }

  private pump() {
    if (this.timer) return;
    while (this.queue.length) {
      const wait = this.waitTime();
      if (wait > 0) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.pump();
        }, wait);
        return;
      }
      this.queue.shift()!();
    }
  }
}

// Two-tier cache: memory for hot entries, disk for anything that can outlive
// a restart. Finished sessions never change, so they are cached permanently,
// which keeps us well inside the upstream rate limits.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
  /** Absolute expiry, or null for permanent. */
  expiresAt: number | null;
}

export interface CachePolicy {
  /** Time to live in ms, or null for permanent. */
  ttlMs: number | null;
  /** Also write to disk. */
  persist: boolean;
}

export class Cache {
  private mem = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private ready: Promise<void>;
  private maxMemEntries = 2000;

  constructor(
    private dir: string,
    private now: () => number = Date.now,
  ) {
    this.ready = mkdir(dir, { recursive: true }).then(() => undefined);
  }

  private file(key: string) {
    return join(this.dir, `${createHash("sha1").update(key).digest("hex")}.json`);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const m = this.mem.get(key) as CacheEntry<T> | undefined;
    if (m) return m;
    await this.ready;
    try {
      const entry = JSON.parse(await readFile(this.file(key), "utf8")) as CacheEntry<T>;
      this.remember(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  private remember(key: string, entry: CacheEntry<unknown>) {
    if (this.mem.size >= this.maxMemEntries) {
      const first = this.mem.keys().next().value;
      if (first !== undefined) this.mem.delete(first);
    }
    this.mem.set(key, entry);
  }

  async set<T>(key: string, value: T, policy: CachePolicy): Promise<void> {
    const entry: CacheEntry<T> = { value, storedAt: this.now(), expiresAt: policy.ttlMs === null ? null : this.now() + policy.ttlMs };
    this.remember(key, entry);
    if (policy.persist) {
      await this.ready;
      const f = this.file(key);
      const tmp = `${f}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(entry));
      await rename(tmp, f);
    }
  }

  isFresh(entry: CacheEntry<unknown>): boolean {
    return entry.expiresAt === null || entry.expiresAt > this.now();
  }

  /**
   * Returns a fresh cached value or loads it. Concurrent callers share one load.
   * If loading fails and a stale value exists, the stale value is returned with
   * `stale: true` so the UI can say so.
   */
  async getOrLoad<T>(key: string, policy: CachePolicy | ((v: T) => CachePolicy), load: () => Promise<T>): Promise<{ value: T; stale: boolean; storedAt: number }> {
    const cached = await this.get<T>(key);
    if (cached && this.isFresh(cached)) return { value: cached.value, stale: false, storedAt: cached.storedAt };
    const running = this.inflight.get(key) as Promise<T> | undefined;
    const p = running ?? load();
    if (!running) this.inflight.set(key, p);
    try {
      const value = await p;
      if (!running) await this.set(key, value, typeof policy === "function" ? policy(value) : policy);
      return { value, stale: false, storedAt: this.now() };
    } catch (err) {
      if (cached) return { value: cached.value, stale: true, storedAt: cached.storedAt };
      throw err;
    } finally {
      if (!running) this.inflight.delete(key);
    }
  }
}

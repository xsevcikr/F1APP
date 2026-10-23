import type { RateLimiter } from "./rateLimiter.ts";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
    readonly body?: string,
  ) {
    super(message);
  }
}

export interface FetchJsonOptions {
  limiter: RateLimiter;
  headers?: Record<string, string>;
  /** Treat these statuses as an empty result instead of an error (OpenF1 uses 404 for "no results"). */
  emptyOn?: number[];
  emptyValue?: unknown;
  retries?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rate-limited JSON GET with retries on 429 and 5xx. */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions): Promise<T> {
  const retries = opts.retries ?? 3;
  let attempt = 0;
  for (;;) {
    const res = await opts.limiter.schedule(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
      try {
        return await fetch(url, { headers: { Accept: "application/json", ...opts.headers }, signal: ctrl.signal });
      } catch (err) {
        throw new UpstreamError(`Network error: ${(err as Error).message}`, null, url);
      } finally {
        clearTimeout(timer);
      }
    });
    if (res.ok) return (await res.json()) as T;
    if (opts.emptyOn?.includes(res.status)) return (opts.emptyValue ?? []) as T;
    const body = await res.text().catch(() => "");
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
      attempt++;
      continue;
    }
    throw new UpstreamError(`HTTP ${res.status} from upstream`, res.status, url, body.slice(0, 500));
  }
}

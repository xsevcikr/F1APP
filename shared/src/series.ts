// Helpers for time-sorted arrays. Everything here assumes ascending `ts`.

/** Index of the last element with key <= t, or -1. */
export function lastIndexAtOrBefore<T>(arr: readonly T[], t: number, key: (x: T) => number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function lastAtOrBefore<T>(arr: readonly T[], t: number, key: (x: T) => number): T | undefined {
  const i = lastIndexAtOrBefore(arr, t, key);
  return i >= 0 ? arr[i] : undefined;
}

/** Groups records by driver number, preserving order. */
export function byDriver<T extends { driver: number }>(rows: readonly T[]): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    let list = m.get(r.driver);
    if (!list) m.set(r.driver, (list = []));
    list.push(r);
  }
  return m;
}

export const byTs = <T extends { ts: number }>(a: T, b: T) => a.ts - b.ts;

/** Inserts into a ts-sorted array, keeping order; cheap when appending in order. */
export function insertSorted<T extends { ts: number }>(arr: T[], item: T): void {
  if (arr.length === 0 || arr[arr.length - 1].ts <= item.ts) {
    arr.push(item);
    return;
  }
  const i = lastIndexAtOrBefore(arr, item.ts, (x) => x.ts);
  arr.splice(i + 1, 0, item);
}

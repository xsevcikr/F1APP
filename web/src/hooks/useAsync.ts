import { useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/** Small async loader with a module-level cache keyed by `key`. */
const memo = new Map<string, { at: number; value: unknown }>();

export function useAsync<T>(key: string | null, load: () => Promise<T>, maxAgeMs = 5 * 60_000): AsyncState<T> {
  const cached = key ? (memo.get(key) as { at: number; value: T } | undefined) : undefined;
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ data: cached?.value, loading: !!key && !cached });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!key) {
      setState({ loading: false });
      return;
    }
    const hit = memo.get(key) as { at: number; value: T } | undefined;
    if (hit && Date.now() - hit.at < maxAgeMs && nonce === 0) {
      setState({ data: hit.value, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ data: hit?.value ?? s.data, loading: true }));
    loadRef.current().then(
      (value) => {
        memo.set(key, { at: Date.now(), value });
        if (!cancelled) setState({ data: value, loading: false });
      },
      (error: Error) => {
        if (!cancelled) setState({ data: hit?.value, error, loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, nonce, maxAgeMs]);

  return { ...state, reload: () => setNonce((n) => n + 1) } as AsyncState<T>;
}

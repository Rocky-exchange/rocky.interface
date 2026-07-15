import { useEffect, useRef, useState } from "react";

/** Poll `fn` every `intervalMs`, mirrors perp's usePolling contract.
 *  `refetch()` triggers an immediate tick out of band (e.g. right after a
 *  mutation) so the caller doesn't wait for the next interval. */
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs: number,
  deps: unknown[] = [],
  opts: { enabled?: boolean } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const enabled = opts.enabled !== false;
  const tickRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!enabled) {
      setData(null);
      setErr(null);
      tickRef.current = () => undefined;
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const d = await fn();
        if (alive) {
          setData(d);
          setErr(null);
        }
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    tickRef.current = () => void tick();
    tick();
    const iv = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  return {
    data,
    err,
    refetch: () => tickRef.current(),
  };
}

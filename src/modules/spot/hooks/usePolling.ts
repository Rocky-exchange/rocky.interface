import { useEffect, useRef, useState } from "react";

/** Poll `fn` every `intervalMs`, mirrors perp's usePolling contract.
 *  `refetch()` triggers an immediate tick out of band (e.g. right after a
 *  mutation) so the caller doesn't wait for the next interval. */
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs: number,
  deps: unknown[] = [],
  opts: { enabled?: boolean } = {}
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
    let timer: number | null = null;
    let inFlight = false;
    let rerunRequested = false;

    const schedule = () => {
      if (!alive) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void tick();
      }, intervalMs);
    };

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      if (inFlight) {
        rerunRequested = true;
        return;
      }
      inFlight = true;
      try {
        const d = await fn();
        if (alive) {
          setData(d);
          setErr(null);
        }
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        inFlight = false;
        if (alive) {
          if (rerunRequested) {
            rerunRequested = false;
            void tick();
          } else {
            schedule();
          }
        }
      }
    };

    tickRef.current = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (inFlight) {
        rerunRequested = true;
        return;
      }
      void tick();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") tickRef.current();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void tick();
    return () => {
      alive = false;
      rerunRequested = false;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      tickRef.current = () => undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  return {
    data,
    err,
    refetch: () => tickRef.current(),
  };
}

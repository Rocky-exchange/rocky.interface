import { useEffect, useMemo, useRef, useState } from "react";

import { resolveNames } from "./profile";

// Process-wide cache of party -> display name. `null` means "resolved, no name".
const cache = new Map<string, string | null>();

/**
 * Batch-resolve custom display names for a set of parties, with in-memory
 * caching so the leaderboard doesn't re-fetch the same parties on every render.
 * Returns a map containing only parties that have a name.
 */
export function useResolvedNames(parties: string[]): Record<string, string> {
  const [, setVersion] = useState(0);

  // Stable key so the effect only runs when the set of parties actually changes.
  const key = useMemo(() => Array.from(new Set(parties.filter(Boolean))).sort().join(","), [parties]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const wanted = key ? key.split(",") : [];
    const missing = wanted.filter((p) => !cache.has(p));
    if (missing.length === 0) return;

    let cancelled = false;
    void resolveNames(missing).then((names) => {
      if (cancelled) return;
      for (const p of missing) {
        cache.set(p, names[p] ?? null);
      }
      if (mounted.current) setVersion((v) => v + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => {
    const out: Record<string, string> = {};
    const wanted = key ? key.split(",") : [];
    for (const p of wanted) {
      const name = cache.get(p);
      if (name) out[p] = name;
    }
    return out;
  }, [key]);
}

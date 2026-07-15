/**
 * Per-Canton-party HMAC session for spot trading.
 *
 * When the Canton wallet connects, mint (or fetch) an isolated
 * (key, secret) pair from `POST /api/v3/session-key` and inject it into
 * `spotClient` so subsequent signed calls act as *that party*, not the
 * shared dev credentials. On disconnect, clear.
 *
 * v1 caveat: the backend endpoint TRUSTS the client's party string —
 * fine for dev, MUST be gated by a Canton signature before enabling
 * production spot trading. See `spot/routes_session.rs`.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { getSpotCredentials, setSpotCredentials, subscribeSpotCredentials } from "./spotClient";

type SessionKeyResp = { userId: string; key: string; secret: string };

// Simple in-memory cache: {party → creds}. Survives the tab lifetime but not
// a reload (that's fine — the endpoint is idempotent).
const CACHE = new Map<string, { key: string; secret: string }>();

async function fetchSessionKey(party: string): Promise<{ key: string; secret: string }> {
  const cached = CACHE.get(party);
  if (cached) return cached;
  const r = await fetch("/api/v3/session-key", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ party }),
  });
  if (!r.ok) throw new Error(`session-key HTTP ${r.status}`);
  const j = (await r.json()) as SessionKeyResp;
  const creds = { key: j.key, secret: j.secret };
  CACHE.set(party, creds);
  return creds;
}

/**
 * Reads the current Canton party from useCantonSession and keeps
 * spotClient's credentials in sync. Call once high in the tree
 * (SpotTradePage).
 */
export function useSpotSession(): { ready: boolean; err: string | null } {
  const { party, connected } = useCantonSession();
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !party) {
      setSpotCredentials(null);
      setReady(false);
      setErr(null);
      return;
    }
    let cancelled = false;
    // Wipe any prior (or env-fallback) credentials while we mint the
    // per-party key. Prevents the UI from briefly rendering with the
    // shared dev credentials right after connect.
    setSpotCredentials(null);
    setErr(null);
    setReady(false);
    fetchSessionKey(party)
      .then((c) => {
        if (cancelled) return;
        setSpotCredentials(c);
        setReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [connected, party]);

  return { ready, err };
}

/**
 * Downstream components: `true` iff the wallet is connected AND spot
 * credentials have been minted. Use this in place of raw `connected` to
 * gate signed-endpoint polling / order forms so we never signed-call
 * with stale or absent credentials.
 */
export function useSpotAuthReady(): boolean {
  const { connected } = useCantonSession();
  const hasCreds = useSyncExternalStore(
    subscribeSpotCredentials,
    () => Boolean(getSpotCredentials()),
    () => false
  );
  return connected && hasCreds;
}

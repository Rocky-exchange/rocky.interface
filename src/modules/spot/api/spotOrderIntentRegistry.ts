import BigNumber from "bignumber.js";
import cryptoJs from "crypto-js";

const STORAGE_KEY = "rocky_pending_spot_order_intents_v1";
const MAX_PENDING_INTENTS = 64;

export type SpotOrderIntentScope = { accountKey: string };

export type SpotOrderIntent = {
  symbol: string;
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  price?: string;
  quantity: string;
};

type PendingIntentLease = {
  fingerprint: string;
  key: string;
  state: "in-flight" | "ambiguous";
  createdAt: number;
};
type PendingIntentRegistry = { entries: PendingIntentLease[] };

let memoryRegistry: PendingIntentRegistry = { entries: [] };

export function acquireSpotOrderIntentKey(scope: SpotOrderIntentScope, intent: SpotOrderIntent): string {
  const now = Date.now();
  const fingerprint = fingerprintSpotOrderIntent(scope, intent);
  const registry = sanitizeRegistry(readRegistry());
  const reusable = registry.entries.find((entry) => entry.fingerprint === fingerprint);
  if (reusable) {
    reusable.state = "in-flight";
    writeRegistry(registry);
    return reusable.key;
  }

  const key = createSpotOrderIdempotencyKey();
  registry.entries.push({ fingerprint, key, state: "in-flight", createdAt: now });
  writeRegistry(sanitizeRegistry(registry));
  return key;
}

export function settleSpotOrderIntent(
  scope: SpotOrderIntentScope,
  request: SpotOrderIntent & { newClientOrderId: string },
  outcome: "complete" | "ambiguous"
): void {
  const registry = sanitizeRegistry(readRegistry());
  const fingerprint = fingerprintSpotOrderIntent(scope, request);
  const index = registry.entries.findIndex(
    (entry) => entry.fingerprint === fingerprint && entry.key === request.newClientOrderId
  );
  if (index < 0) return;
  if (outcome === "ambiguous") registry.entries[index]!.state = "ambiguous";
  else registry.entries.splice(index, 1);
  writeRegistry(registry);
}

export function shouldRetainSpotOrderIntent(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return !Number.isFinite(status) || status === 0 || status === 408 || status >= 500;
}

function fingerprintSpotOrderIntent(scope: SpotOrderIntentScope, intent: SpotOrderIntent): string {
  return cryptoJs
    .SHA256(
      JSON.stringify([
        scope.accountKey.trim(),
        intent.symbol.trim().toUpperCase(),
        intent.side,
        intent.type,
        intent.type === "MARKET" ? "" : canonicalDecimal(intent.price || ""),
        canonicalDecimal(intent.quantity),
      ])
    )
    .toString();
}

function canonicalDecimal(value: string): string {
  const decimal = new BigNumber(value.trim());
  return decimal.isFinite() ? decimal.toFixed() : value.trim();
}

function createSpotOrderIdempotencyKey(): string {
  const nativeUuid = globalThis.crypto?.randomUUID?.();
  if (nativeUuid) return `spot-order-${nativeUuid}`;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error("Secure random number generation is unavailable");
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  const randomHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `spot-order-${randomHex}`;
}

function readRegistry(): PendingIntentRegistry {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? globalThis.sessionStorage?.getItem(STORAGE_KEY);
    if (!raw) return memoryRegistry;
    const parsed = JSON.parse(raw) as Partial<PendingIntentRegistry> | null;
    return parsed && Array.isArray(parsed.entries)
      ? { entries: parsed.entries as PendingIntentLease[] }
      : memoryRegistry;
  } catch (_error) {
    return memoryRegistry;
  }
}

function writeRegistry(registry: PendingIntentRegistry): void {
  memoryRegistry = registry;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(registry));
    globalThis.sessionStorage?.removeItem(STORAGE_KEY);
  } catch (_error) {
    // The bounded in-memory registry still prevents duplicate requests in this runtime.
  }
}

function sanitizeRegistry(registry: PendingIntentRegistry): PendingIntentRegistry {
  return {
    entries: registry.entries
      .filter((entry) => entry?.fingerprint && entry?.key)
      .map((entry) => ({
        fingerprint: entry.fingerprint,
        key: entry.key,
        state: entry.state === "ambiguous" ? ("ambiguous" as const) : ("in-flight" as const),
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
      }))
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(-MAX_PENDING_INTENTS),
  };
}

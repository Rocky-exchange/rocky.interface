import BigNumber from "bignumber.js";
import cryptoJs from "crypto-js";

const STORAGE_KEY = "rocky_pending_spot_transfer_intents_v1";

export type SpotTransferIntentScope = {
  walletParty: string;
  sessionParty: string;
  walletProvider: string;
};

export type SpotTransferIntent = {
  asset: "USDA";
  amount: string;
  direction: "toSpot" | "toFunding";
};

type PendingIntentState = "in-flight" | "ambiguous";
type PendingIntentLease = {
  fingerprint: string;
  key: string;
  state: PendingIntentState;
  createdAt: number;
};
type PendingIntentRegistry = { entries: PendingIntentLease[] };

let memoryRegistry: PendingIntentRegistry = { entries: [] };

export function acquireSpotTransferIntentKey(scope: SpotTransferIntentScope, intent: SpotTransferIntent): string {
  const now = Date.now();
  const fingerprint = fingerprintSpotTransferIntent(scope, intent);
  const registry = sanitizeRegistry(readRegistry());
  const reusableLease = registry.entries.find((entry) => entry.fingerprint === fingerprint);

  if (reusableLease) {
    reusableLease.state = "in-flight";
    writeRegistry(registry);
    return reusableLease.key;
  }

  const key = createSpotTransferIdempotencyKey();
  registry.entries.push({
    fingerprint,
    key,
    state: "in-flight",
    createdAt: now,
  });
  writeRegistry(registry);
  return key;
}

export function settleSpotTransferIntent(
  scope: SpotTransferIntentScope,
  request: SpotTransferIntent & { idempotency_key: string },
  outcome: "complete" | "ambiguous"
): void {
  const fingerprint = fingerprintSpotTransferIntent(scope, request);
  const registry = sanitizeRegistry(readRegistry());
  const leaseIndex = registry.entries.findIndex(
    (entry) => entry.fingerprint === fingerprint && entry.key === request.idempotency_key
  );

  if (leaseIndex < 0) {
    writeRegistry(registry);
    return;
  }

  if (outcome === "ambiguous") {
    registry.entries[leaseIndex]!.state = "ambiguous";
  } else {
    registry.entries.splice(leaseIndex, 1);
  }
  writeRegistry(registry);
}

export function shouldRetainSpotTransferIntent(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return !Number.isFinite(status) || status === 408 || status >= 500;
}

function createSpotTransferIdempotencyKey(): string {
  const nativeUuid = globalThis.crypto?.randomUUID?.();
  if (nativeUuid) return `spot-transfer-${nativeUuid}`;

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure random number generation is unavailable");
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  const randomHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `spot-transfer-${randomHex}`;
}

function fingerprintSpotTransferIntent(scope: SpotTransferIntentScope, intent: SpotTransferIntent): string {
  return cryptoJs
    .SHA256(
      JSON.stringify([
        scope.walletParty.trim(),
        scope.sessionParty.trim(),
        scope.walletProvider.trim(),
        intent.direction,
        intent.asset,
        canonicalDecimal(intent.amount),
      ])
    )
    .toString();
}

function canonicalDecimal(value: string): string {
  const decimal = new BigNumber(value.trim());
  return decimal.isFinite() ? decimal.toFixed() : value.trim();
}

function readRegistry(): PendingIntentRegistry {
  try {
    const durableStorage = globalThis.localStorage;
    const raw = durableStorage?.getItem(STORAGE_KEY) ?? globalThis.sessionStorage?.getItem(STORAGE_KEY);
    if (!raw) return { entries: [] };
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
    // The bounded in-memory registry remains available when storage is blocked.
  }
}

function sanitizeRegistry(registry: PendingIntentRegistry): PendingIntentRegistry {
  const entries = registry.entries
    .filter((entry) => entry?.key && entry.fingerprint)
    .map((entry) => ({
      fingerprint: entry.fingerprint,
      key: entry.key,
      state: entry.state,
      createdAt: entry.createdAt,
    }))
    .sort((left, right) => left.createdAt - right.createdAt);
  return { entries };
}

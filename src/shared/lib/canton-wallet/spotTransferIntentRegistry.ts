const STORAGE_KEY = "rocky_pending_spot_transfer_intents_v1";
const INTENT_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_INTENTS = 64;

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
type PendingIntentLease = SpotTransferIntentScope & {
  fingerprint: string;
  key: string;
  state: PendingIntentState;
  createdAt: number;
  expiresAt: number;
};
type PendingIntentRegistry = { entries: PendingIntentLease[] };

let memoryRegistry: PendingIntentRegistry = { entries: [] };

export function acquireSpotTransferIntentKey(scope: SpotTransferIntentScope, intent: SpotTransferIntent): string {
  const now = Date.now();
  const fingerprint = fingerprintSpotTransferIntent(scope, intent);
  const registry = pruneRegistry(readRegistry(), now);
  const reusableLease = registry.entries.find((entry) => entry.fingerprint === fingerprint);

  if (reusableLease) {
    reusableLease.state = "in-flight";
    writeRegistry(registry);
    return reusableLease.key;
  }

  const key = createSpotTransferIdempotencyKey();
  registry.entries.push({
    ...scope,
    fingerprint,
    key,
    state: "in-flight",
    createdAt: now,
    expiresAt: now + INTENT_TTL_MS,
  });
  writeRegistry(pruneRegistry(registry, now));
  return key;
}

export function settleSpotTransferIntent(
  scope: SpotTransferIntentScope,
  request: SpotTransferIntent & { idempotency_key: string },
  outcome: "complete" | "ambiguous"
): void {
  const now = Date.now();
  const fingerprint = fingerprintSpotTransferIntent(scope, request);
  const registry = pruneRegistry(readRegistry(), now);
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
  return !Number.isFinite(status) || status >= 500;
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
  return JSON.stringify([
    scope.walletParty.trim(),
    scope.sessionParty.trim(),
    scope.walletProvider.trim(),
    intent.direction,
    intent.asset,
    intent.amount.trim(),
  ]);
}

function readRegistry(): PendingIntentRegistry {
  try {
    if (typeof globalThis.sessionStorage === "undefined") return memoryRegistry;
    const raw = globalThis.sessionStorage.getItem(STORAGE_KEY);
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
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch (_error) {
    // The bounded in-memory registry remains available when storage is blocked.
  }
}

function pruneRegistry(registry: PendingIntentRegistry, now: number): PendingIntentRegistry {
  const entries = registry.entries
    .filter((entry) => entry?.key && entry.expiresAt > now)
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_PENDING_INTENTS);
  return { entries };
}

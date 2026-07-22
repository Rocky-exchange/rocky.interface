import type { CreateOrderRequest } from "../types";

const STORAGE_KEY = "rocky_pending_order_intents_v2";
const INTENT_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_INTENTS = 64;

export type OrderIntentScope = {
  chainId: number;
  accountKey: string;
};

type OrderIntent = Omit<CreateOrderRequest, "idempotency_key">;
type PendingIntentState = "in-flight" | "ambiguous";
type PendingIntentLease = OrderIntentScope & {
  fingerprint: string;
  key: string;
  state: PendingIntentState;
  createdAt: number;
  expiresAt: number;
};
type PendingIntentRegistry = {
  entries: PendingIntentLease[];
};

let memoryRegistry: PendingIntentRegistry = { entries: [] };
let idSequence = 0;

export function createOrderIdempotencyKey(): string {
  const nativeUuid = globalThis.crypto?.randomUUID?.();
  if (nativeUuid) return nativeUuid;
  idSequence += 1;
  return `web-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

export function acquirePendingOrderIntentKey(scope: OrderIntentScope, intent: OrderIntent, customId?: string): string {
  if (customId !== undefined) {
    if (!customId.trim()) throw new Error("clientOrderId must not be blank");
    return customId;
  }

  const now = Date.now();
  const fingerprint = fingerprintOrderIntent(intent);
  const registry = pruneRegistry(readRegistry(), now);
  const ambiguousLease = registry.entries.find(
    (entry) => matchesScopeAndFingerprint(entry, scope, fingerprint) && entry.state === "ambiguous"
  );

  if (ambiguousLease) {
    ambiguousLease.state = "in-flight";
    writeRegistry(registry);
    return ambiguousLease.key;
  }

  const key = createOrderIdempotencyKey();
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

export function settlePendingOrderIntent(
  scope: OrderIntentScope,
  request: CreateOrderRequest,
  outcome: "complete" | "ambiguous"
): void {
  const now = Date.now();
  const fingerprint = fingerprintOrderIntent(request);
  const registry = pruneRegistry(readRegistry(), now);
  const leaseIndex = registry.entries.findIndex(
    (entry) => matchesScopeAndFingerprint(entry, scope, fingerprint) && entry.key === request.idempotency_key
  );

  if (leaseIndex < 0) {
    writeRegistry(registry);
    return;
  }

  if (outcome === "ambiguous") {
    const lease = registry.entries[leaseIndex]!;
    lease.state = "ambiguous";
  } else {
    registry.entries.splice(leaseIndex, 1);
  }
  writeRegistry(registry);
}

export function shouldRetainPendingOrderIntent(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return !Number.isFinite(status) || status >= 500;
}

function fingerprintOrderIntent(intent: OrderIntent): string {
  return JSON.stringify([intent.symbol, intent.side, intent.price, intent.qty, intent.leverage]);
}

function matchesScopeAndFingerprint(lease: PendingIntentLease, scope: OrderIntentScope, fingerprint: string): boolean {
  return lease.chainId === scope.chainId && lease.accountKey === scope.accountKey && lease.fingerprint === fingerprint;
}

function readRegistry(): PendingIntentRegistry {
  try {
    if (typeof globalThis.sessionStorage === "undefined") {
      return memoryRegistry;
    }

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

import type { CreateOrderRequest } from "../types";

const STORAGE_KEY = "rocky_pending_order_intents_v1";
const INTENT_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_INTENTS = 64;

type OrderIntent = Omit<CreateOrderRequest, "idempotency_key">;
type PendingIntent = {
  key: string;
  createdAt: number;
  expiresAt: number;
};
type PendingIntentRegistry = Record<string, PendingIntent>;

let memoryRegistry: PendingIntentRegistry = {};
let idSequence = 0;

export function createOrderIdempotencyKey(): string {
  const nativeUuid = globalThis.crypto?.randomUUID?.();
  if (nativeUuid) return nativeUuid;
  idSequence += 1;
  return `web-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

export function getOrCreatePendingOrderIntentKey(intent: OrderIntent, customId?: string): string {
  const normalizedCustomId = customId?.trim();
  if (normalizedCustomId) return normalizedCustomId;

  const now = Date.now();
  const fingerprint = fingerprintOrderIntent(intent);
  const registry = pruneRegistry(readRegistry(), now);
  const pending = registry[fingerprint];
  if (pending) {
    writeRegistry(registry);
    return pending.key;
  }

  const key = createOrderIdempotencyKey();
  registry[fingerprint] = {
    key,
    createdAt: now,
    expiresAt: now + INTENT_TTL_MS,
  };
  writeRegistry(pruneRegistry(registry, now));
  return key;
}

export function clearPendingOrderIntent(request: CreateOrderRequest): void {
  const fingerprint = fingerprintOrderIntent(request);
  const registry = pruneRegistry(readRegistry(), Date.now());
  if (registry[fingerprint]?.key !== request.idempotency_key) return;
  delete registry[fingerprint];
  writeRegistry(registry);
}

export function shouldRetainPendingOrderIntent(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return !Number.isFinite(status) || status >= 500;
}

function fingerprintOrderIntent(intent: OrderIntent): string {
  return JSON.stringify([intent.symbol, intent.side, intent.price, intent.qty, intent.leverage]);
}

function readRegistry(): PendingIntentRegistry {
  try {
    if (typeof globalThis.sessionStorage === "undefined") {
      return memoryRegistry;
    }

    const raw = globalThis.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PendingIntentRegistry) : memoryRegistry;
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
  const liveEntries = Object.entries(registry)
    .filter(([, entry]) => entry?.key && entry.expiresAt > now)
    .sort(([, left], [, right]) => left.createdAt - right.createdAt)
    .slice(-MAX_PENDING_INTENTS);
  return Object.fromEntries(liveEntries);
}

import cryptoJs from "crypto-js";

const STORAGE_KEY = "rocky_pending_bonus_redeem_intents_v1";

export type RedeemIntentScope = {
  party: string;
  provider: string;
};

type RedeemIntentLease = {
  fingerprint: string;
  requestId: string;
  state: "in-flight" | "ambiguous";
  createdAt: number;
};
type RedeemIntentRegistry = { entries: RedeemIntentLease[] };

let memoryRegistry: RedeemIntentRegistry = { entries: [] };

export function acquireRedeemRequestId(scope: RedeemIntentScope, code: string): string {
  const fingerprint = fingerprintRedeemIntent(scope, code);
  const registry = readRegistry();
  const reusable = registry.entries.find((entry) => entry.fingerprint === fingerprint);
  if (reusable) {
    reusable.state = "in-flight";
    writeRegistry(registry);
    return reusable.requestId;
  }

  const requestId = createRedeemRequestId();
  registry.entries.push({ fingerprint, requestId, state: "in-flight", createdAt: Date.now() });
  writeRegistry(registry);
  return requestId;
}

export function settleRedeemIntent(
  scope: RedeemIntentScope,
  code: string,
  requestId: string,
  outcome: "complete" | "ambiguous"
): void {
  const fingerprint = fingerprintRedeemIntent(scope, code);
  const registry = readRegistry();
  const index = registry.entries.findIndex(
    (entry) => entry.fingerprint === fingerprint && entry.requestId === requestId
  );
  if (index < 0) return;
  if (outcome === "ambiguous") registry.entries[index]!.state = "ambiguous";
  else registry.entries.splice(index, 1);
  writeRegistry(registry);
}

export function shouldRetainRedeemIntent(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return !Number.isFinite(status) || status === 408 || status >= 500;
}

function fingerprintRedeemIntent(scope: RedeemIntentScope, code: string): string {
  return cryptoJs
    .SHA256(JSON.stringify([scope.party.trim(), scope.provider.trim(), code.trim().toUpperCase()]))
    .toString();
}

function createRedeemRequestId(): string {
  const nativeUuid = globalThis.crypto?.randomUUID?.();
  if (nativeUuid) return `bonus-redeem-${nativeUuid}`;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error("Secure random number generation is unavailable");
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  const randomHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `bonus-redeem-${randomHex}`;
}

function readRegistry(): RedeemIntentRegistry {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return memoryRegistry;
    const parsed = JSON.parse(raw) as Partial<RedeemIntentRegistry> | null;
    if (!parsed || !Array.isArray(parsed.entries)) return memoryRegistry;
    return {
      entries: (parsed.entries as RedeemIntentLease[]).filter((entry) => entry?.fingerprint && entry?.requestId),
    };
  } catch (_error) {
    return memoryRegistry;
  }
}

function writeRegistry(registry: RedeemIntentRegistry): void {
  memoryRegistry = registry;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch (_error) {
    // The in-memory registry still prevents duplicate requests in this runtime.
  }
}

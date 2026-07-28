import BigNumber from "bignumber.js";
import cryptoJs from "crypto-js";

const STORAGE_KEY = "rocky_pending_withdrawal_intents_v1";

export type WithdrawalIntentScope = {
  sessionParty: string;
  walletProvider: string;
};

export type WithdrawalIntent = {
  asset: string;
  amount: string;
  destinationParty: string;
};

type PendingIntentLease = {
  fingerprint: string;
  key: string;
  state: "in-flight" | "ambiguous";
  createdAt: number;
};
type PendingIntentRegistry = { entries: PendingIntentLease[] };

let memoryRegistry: PendingIntentRegistry = { entries: [] };

export function acquireWithdrawalIntentKey(scope: WithdrawalIntentScope, intent: WithdrawalIntent): string {
  const fingerprint = fingerprintWithdrawalIntent(scope, intent);
  const registry = readRegistry();
  const reusableLease = registry.entries.find((entry) => entry.fingerprint === fingerprint);
  if (reusableLease) {
    reusableLease.state = "in-flight";
    writeRegistry(registry);
    return reusableLease.key;
  }

  const key = createWithdrawalIdempotencyKey(intent.asset);
  registry.entries.push({ fingerprint, key, state: "in-flight", createdAt: Date.now() });
  writeRegistry(registry);
  return key;
}

export function hasPendingWithdrawalIntent(scope: WithdrawalIntentScope, intent: WithdrawalIntent): boolean {
  const fingerprint = fingerprintWithdrawalIntent(scope, intent);
  return readRegistry().entries.some((entry) => entry.fingerprint === fingerprint);
}

export function settleWithdrawalIntent(
  scope: WithdrawalIntentScope,
  request: WithdrawalIntent & { idempotency_key: string },
  outcome: "complete" | "ambiguous"
): void {
  const fingerprint = fingerprintWithdrawalIntent(scope, request);
  const registry = readRegistry();
  const index = registry.entries.findIndex(
    (entry) => entry.fingerprint === fingerprint && entry.key === request.idempotency_key
  );
  if (index < 0) return;
  if (outcome === "ambiguous") registry.entries[index]!.state = "ambiguous";
  else registry.entries.splice(index, 1);
  writeRegistry(registry);
}

export function shouldRetainWithdrawalIntent(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return !Number.isFinite(status) || status === 0 || status === 408 || status >= 500;
}

function fingerprintWithdrawalIntent(scope: WithdrawalIntentScope, intent: WithdrawalIntent): string {
  return cryptoJs
    .SHA256(
      JSON.stringify([
        scope.sessionParty.trim(),
        scope.walletProvider.trim(),
        intent.asset.trim().toUpperCase(),
        canonicalDecimal(intent.amount),
        intent.destinationParty.trim(),
      ])
    )
    .toString();
}

function canonicalDecimal(value: string): string {
  const decimal = new BigNumber(value.trim());
  return decimal.isFinite() ? decimal.toFixed() : value.trim();
}

function createWithdrawalIdempotencyKey(asset: string): string {
  const nativeUuid = globalThis.crypto?.randomUUID?.();
  if (nativeUuid) return `withdraw-${asset.toLowerCase()}-${nativeUuid}`;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error("Secure random number generation is unavailable");
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  const randomHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `withdraw-${asset.toLowerCase()}-${randomHex}`;
}

function readRegistry(): PendingIntentRegistry {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return memoryRegistry;
    const parsed = JSON.parse(raw) as Partial<PendingIntentRegistry> | null;
    if (!parsed || !Array.isArray(parsed.entries)) return memoryRegistry;
    return {
      entries: (parsed.entries as PendingIntentLease[]).filter((entry) => entry?.fingerprint && entry?.key),
    };
  } catch (_error) {
    return memoryRegistry;
  }
}

function writeRegistry(registry: PendingIntentRegistry): void {
  memoryRegistry = registry;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch (_error) {
    // The in-memory registry still prevents duplicate requests in this runtime.
  }
}

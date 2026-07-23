import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "rocky_pending_spot_transfer_intents_v1";
const SCOPE = {
  walletParty: "wallet-party",
  sessionParty: "session-party",
  walletProvider: "rocky",
};
const INTENT = { asset: "USDA" as const, amount: "1", direction: "toSpot" as const };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", createMemoryStorage());
  vi.stubGlobal("sessionStorage", createMemoryStorage());
});

describe("spot transfer intent registry", () => {
  it("reuses an ambiguous transfer key after a lost response and reload", async () => {
    const firstRegistry = await import("./spotTransferIntentRegistry");
    const firstKey = firstRegistry.acquireSpotTransferIntentKey(SCOPE, INTENT);
    firstRegistry.settleSpotTransferIntent(SCOPE, { ...INTENT, idempotency_key: firstKey }, "ambiguous");
    expect(firstRegistry.hasPendingSpotTransferIntent(SCOPE, INTENT)).toBe(true);

    vi.resetModules();
    const reloadedRegistry = await import("./spotTransferIntentRegistry");

    expect(reloadedRegistry.acquireSpotTransferIntentKey(SCOPE, INTENT)).toBe(firstKey);
  });

  it("uses distinct keys for different payloads and wallet/session identities", async () => {
    const registry = await import("./spotTransferIntentRegistry");
    const firstKey = registry.acquireSpotTransferIntentKey(SCOPE, INTENT);

    expect(registry.acquireSpotTransferIntentKey(SCOPE, { ...INTENT, amount: "2" })).not.toBe(firstKey);
    expect(registry.acquireSpotTransferIntentKey(SCOPE, { ...INTENT, direction: "toFunding" })).not.toBe(firstKey);
    expect(registry.acquireSpotTransferIntentKey({ ...SCOPE, sessionParty: "other-session" }, INTENT)).not.toBe(
      firstKey
    );
  });

  it("retains ambiguous transfer keys after fifteen minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T00:00:00Z"));
    const registry = await import("./spotTransferIntentRegistry");
    const firstKey = registry.acquireSpotTransferIntentKey(SCOPE, INTENT);

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    expect(registry.acquireSpotTransferIntentKey(SCOPE, INTENT)).toBe(firstKey);
    vi.useRealTimers();
  });

  it("canonicalizes equivalent decimal amount text", async () => {
    const registry = await import("./spotTransferIntentRegistry");
    const firstKey = registry.acquireSpotTransferIntentKey(SCOPE, INTENT);

    expect(registry.acquireSpotTransferIntentKey(SCOPE, { ...INTENT, amount: "1.000" })).toBe(firstKey);
  });

  it("retains uncertain HTTP timeouts but clears definitive client failures", async () => {
    const registry = await import("./spotTransferIntentRegistry");

    expect(registry.shouldRetainSpotTransferIntent({ status: 0 })).toBe(true);
    expect(registry.shouldRetainSpotTransferIntent({ status: 408 })).toBe(true);
    expect(registry.shouldRetainSpotTransferIntent({ status: 409 })).toBe(false);
  });

  it("persists unresolved intents in durable browser storage", async () => {
    const registry = await import("./spotTransferIntentRegistry");
    registry.acquireSpotTransferIntentKey(SCOPE, INTENT);

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain("wallet-party");
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, String(value)),
  };
}

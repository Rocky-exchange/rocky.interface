import { beforeEach, describe, expect, it, vi } from "vitest";

const SCOPE = { sessionParty: "session-party", walletProvider: "rocky" };
const INTENT = { asset: "USDA" as const, amount: "5", destinationParty: "wallet-party" };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("withdrawal intent registry", () => {
  it("reuses an ambiguous withdrawal key after reload", async () => {
    const firstRegistry = await import("./withdrawalIntentRegistry");
    const firstKey = firstRegistry.acquireWithdrawalIntentKey(SCOPE, INTENT);
    firstRegistry.settleWithdrawalIntent(SCOPE, { ...INTENT, idempotency_key: firstKey }, "ambiguous");
    expect(firstRegistry.hasPendingWithdrawalIntent(SCOPE, INTENT)).toBe(true);

    vi.resetModules();
    const reloadedRegistry = await import("./withdrawalIntentRegistry");

    expect(reloadedRegistry.acquireWithdrawalIntentKey(SCOPE, INTENT)).toBe(firstKey);
  });

  it("canonicalizes amount text and isolates identity and payload", async () => {
    const registry = await import("./withdrawalIntentRegistry");
    const firstKey = registry.acquireWithdrawalIntentKey(SCOPE, INTENT);
    expect(localStorage.getItem("rocky_pending_withdrawal_intents_v1")).not.toContain("wallet-party");

    expect(registry.acquireWithdrawalIntentKey(SCOPE, { ...INTENT, amount: "5.000" })).toBe(firstKey);
    expect(registry.acquireWithdrawalIntentKey(SCOPE, { ...INTENT, amount: "6" })).not.toBe(firstKey);
    expect(registry.acquireWithdrawalIntentKey({ ...SCOPE, sessionParty: "other" }, INTENT)).not.toBe(firstKey);
  });

  it("retains network, 408, and server failures only", async () => {
    const registry = await import("./withdrawalIntentRegistry");

    expect(registry.shouldRetainWithdrawalIntent(new Error("lost"))).toBe(true);
    expect(registry.shouldRetainWithdrawalIntent({ status: 408 })).toBe(true);
    expect(registry.shouldRetainWithdrawalIntent({ status: 503 })).toBe(true);
    expect(registry.shouldRetainWithdrawalIntent({ status: 409 })).toBe(false);
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

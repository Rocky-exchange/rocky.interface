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
  vi.stubGlobal("sessionStorage", createMemoryStorage());
});

describe("spot transfer intent registry", () => {
  it("reuses an ambiguous transfer key after a lost response and reload", async () => {
    const firstRegistry = await import("./spotTransferIntentRegistry");
    const firstKey = firstRegistry.acquireSpotTransferIntentKey(SCOPE, INTENT);
    firstRegistry.settleSpotTransferIntent(SCOPE, { ...INTENT, idempotency_key: firstKey }, "ambiguous");

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

  it("expires retained transfer keys after fifteen minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T00:00:00Z"));
    const registry = await import("./spotTransferIntentRegistry");
    const firstKey = registry.acquireSpotTransferIntentKey(SCOPE, INTENT);

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    expect(registry.acquireSpotTransferIntentKey(SCOPE, INTENT)).not.toBe(firstKey);
    vi.useRealTimers();
  });

  it("bounds the persisted registry", async () => {
    const registry = await import("./spotTransferIntentRegistry");
    for (let index = 1; index <= 70; index += 1) {
      registry.acquireSpotTransferIntentKey(SCOPE, { ...INTENT, amount: String(index) });
    }

    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as { entries?: unknown[] };
    expect(persisted.entries).toHaveLength(64);
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

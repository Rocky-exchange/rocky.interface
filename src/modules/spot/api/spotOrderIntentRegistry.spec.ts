import { beforeEach, describe, expect, it, vi } from "vitest";

const SCOPE = { accountKey: "spot-key-alice" };
const MARKET_INTENT = {
  symbol: "CETH-USDA",
  side: "BUY" as const,
  type: "MARKET" as const,
  quantity: "0.5",
};

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  vi.stubGlobal("localStorage", createMemoryStorage());
  vi.stubGlobal("sessionStorage", createMemoryStorage());
});

describe("spot order intent registry", () => {
  it("reuses an ambiguous market-order key after reload", async () => {
    const firstRegistry = await import("./spotOrderIntentRegistry");
    const firstKey = firstRegistry.acquireSpotOrderIntentKey(SCOPE, MARKET_INTENT);
    firstRegistry.settleSpotOrderIntent(SCOPE, { ...MARKET_INTENT, newClientOrderId: firstKey }, "ambiguous");

    vi.resetModules();
    const reloadedRegistry = await import("./spotOrderIntentRegistry");

    expect(reloadedRegistry.acquireSpotOrderIntentKey(SCOPE, MARKET_INTENT)).toBe(firstKey);
  });

  it("keeps an unresolved market-order key beyond fifteen minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T00:00:00Z"));
    const firstRegistry = await import("./spotOrderIntentRegistry");
    const firstKey = firstRegistry.acquireSpotOrderIntentKey(SCOPE, MARKET_INTENT);
    firstRegistry.settleSpotOrderIntent(SCOPE, { ...MARKET_INTENT, newClientOrderId: firstKey }, "ambiguous");

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    vi.resetModules();
    const reloadedRegistry = await import("./spotOrderIntentRegistry");

    expect(reloadedRegistry.acquireSpotOrderIntentKey(SCOPE, MARKET_INTENT)).toBe(firstKey);
  });

  it("stores only hashed intent identity and the generated client id", async () => {
    const registry = await import("./spotOrderIntentRegistry");
    registry.acquireSpotOrderIntentKey(SCOPE, MARKET_INTENT);

    const stored = localStorage.getItem("rocky_pending_spot_order_intents_v1");
    expect(stored).not.toBeNull();
    expect(stored).not.toContain(SCOPE.accountKey);
    expect(stored).not.toContain(MARKET_INTENT.symbol);
    expect(stored).not.toContain(MARKET_INTENT.quantity);
    expect(sessionStorage.getItem("rocky_pending_spot_order_intents_v1")).toBeNull();
  });

  it("reuses the in-memory key when durable browser storage is unavailable", async () => {
    const unavailableStorage = createMemoryStorage();
    unavailableStorage.setItem = () => {
      throw new Error("storage unavailable");
    };
    vi.stubGlobal("localStorage", unavailableStorage);
    const registry = await import("./spotOrderIntentRegistry");

    const firstKey = registry.acquireSpotOrderIntentKey(SCOPE, MARKET_INTENT);

    expect(registry.acquireSpotOrderIntentKey(SCOPE, MARKET_INTENT)).toBe(firstKey);
  });

  it("retains network, HTTP 408, and 5xx failures but clears explicit 4xx", async () => {
    const registry = await import("./spotOrderIntentRegistry");

    expect(registry.shouldRetainSpotOrderIntent(new TypeError("response lost"))).toBe(true);
    expect(registry.shouldRetainSpotOrderIntent({ status: 0 })).toBe(true);
    expect(registry.shouldRetainSpotOrderIntent({ status: 408 })).toBe(true);
    expect(registry.shouldRetainSpotOrderIntent({ status: 503 })).toBe(true);
    expect(registry.shouldRetainSpotOrderIntent({ status: 400 })).toBe(false);
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

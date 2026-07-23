import { beforeEach, describe, expect, it, vi } from "vitest";

const SCOPE = { party: "session-party", provider: "rocky" };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("redeem intent registry", () => {
  it("reuses an ambiguous redemption request id after reload", async () => {
    const firstRegistry = await import("./redeemIntentRegistry");
    const firstId = firstRegistry.acquireRedeemRequestId(SCOPE, "rocky-2026");
    firstRegistry.settleRedeemIntent(SCOPE, "ROCKY-2026", firstId, "ambiguous");

    vi.resetModules();
    const reloadedRegistry = await import("./redeemIntentRegistry");

    expect(reloadedRegistry.acquireRedeemRequestId(SCOPE, "ROCKY-2026")).toBe(firstId);
  });

  it("isolates codes and session identities", async () => {
    const registry = await import("./redeemIntentRegistry");
    const firstId = registry.acquireRedeemRequestId(SCOPE, "ROCKY-2026");
    expect(localStorage.getItem("rocky_pending_bonus_redeem_intents_v1")).not.toContain("ROCKY-2026");

    expect(registry.acquireRedeemRequestId(SCOPE, "OTHER-2026")).not.toBe(firstId);
    expect(registry.acquireRedeemRequestId({ ...SCOPE, party: "other" }, "ROCKY-2026")).not.toBe(firstId);
  });

  it("retains only uncertain failures", async () => {
    const registry = await import("./redeemIntentRegistry");

    expect(registry.shouldRetainRedeemIntent(new Error("lost"))).toBe(true);
    expect(registry.shouldRetainRedeemIntent({ status: 0 })).toBe(true);
    expect(registry.shouldRetainRedeemIntent({ status: 408 })).toBe(true);
    expect(registry.shouldRetainRedeemIntent({ status: 503 })).toBe(true);
    expect(registry.shouldRetainRedeemIntent({ status: 409 })).toBe(false);
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

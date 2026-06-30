import { describe, it, expect, beforeEach, vi } from "vitest";
import { persistExchangeSession, getExchangeSessionToken, exchangeSessionHeaders } from "./session";

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("canton-wallet session", () => {
  it("persists the session token and emits a bearer header", () => {
    persistExchangeSession(
      { user_id: "u", binding_id: "b", provider: "loop", party_id: "p", session_token: "T", expires_at: "" } as any,
      { displayName: "x" } as any,
    );
    expect(getExchangeSessionToken()).toBe("T");
    expect(exchangeSessionHeaders()).toMatchObject({ Authorization: "Bearer T" });
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

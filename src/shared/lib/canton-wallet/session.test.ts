import { describe, it, expect, beforeEach, vi } from "vitest";
import { createExchangeSession, persistExchangeSession, getExchangeSessionToken, exchangeSessionHeaders } from "./session";

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

  it("creates exchange sessions with provider proofs instead of wallet backend auth", async () => {
    const requests: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      requests.push({ url, body });
      if (url === "/v1/wallet/challenge") {
        return jsonResponse({
          challenge_id: "challenge-1",
          message: "Rocky Exchange login challenge",
        });
      }
      if (url === "/v1/wallet/verify") {
        return jsonResponse({
          user_id: "user-1",
          binding_id: "binding-1",
          provider: "rocky",
          party_id: "party-1",
          session_token: "exchange-token",
          expires_at: "2026-07-01T00:00:00Z",
        });
      }
      return jsonResponse({ error: "unexpected request" }, false);
    }));

    const session = await createExchangeSession(
      {
        provider: "rocky",
        partyId: "party-1",
        displayName: "Rocky Account",
        metadata: { source: "rocky-wallet-sdk" },
      },
      async (message) => `signed:${message}`,
    );

    expect(session.session_token).toBe("exchange-token");
    expect(requests.map((request) => request.url)).toEqual([
      "/v1/wallet/challenge",
      "/v1/wallet/verify",
    ]);
    expect(requests[0].body).toMatchObject({
      provider: "rocky",
      party_id: "party-1",
    });
    expect(requests[1].body).toMatchObject({
      challenge_id: "challenge-1",
      provider: "rocky",
      party_id: "party-1",
      proof: "signed:Rocky Exchange login challenge",
      metadata: { source: "rocky-wallet-sdk" },
    });
    expect(JSON.stringify(requests)).not.toContain("/v1/auth");
  });
});

function jsonResponse(data: unknown, ok = true) {
  return {
    ok,
    json: async () => data,
  } as Response;
}

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

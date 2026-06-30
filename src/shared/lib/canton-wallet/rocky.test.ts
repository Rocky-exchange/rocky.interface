import { beforeEach, describe, expect, it, vi } from "vitest";

import { connectRockyWallet, createRockyConnectionFromAuth } from "./rocky";
import { getExchangeSessionToken, getMtcAuthToken } from "./session";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createMemoryStorage());
});

describe("rocky wallet auth", () => {
  it("creates an exchange session from Rocky login auth data", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path === "/api/auth") {
        return jsonResponse({
          token: "rocky-token",
          user_id: "user-1",
          party: "party-1",
          username: "alice",
          email: "alice@example.com",
        });
      }
      if (path === "/api/wallet/challenge") {
        return jsonResponse({ challenge_id: "challenge-1", message: "sign me" });
      }
      if (path === "/api/wallet/verify") {
        return jsonResponse({
          user_id: "user-1",
          binding_id: "binding-1",
          provider: "rocky",
          party_id: "party-1",
          session_token: "exchange-token",
          expires_at: "2030-01-01T00:00:00Z",
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await connectRockyWallet({
      mode: "login",
      email: " alice@example.com ",
      password: "secret",
    });

    expect(result.preapprovalRequired).toBe(false);
    expect(getExchangeSessionToken()).toBe("exchange-token");
    expect(getMtcAuthToken()).toBe("rocky-token");
    expect(localStorage.getItem("mtc_party")).toBe("party-1");
    expect(localStorage.getItem("mtc_username")).toBe("alice");
    expect(localStorage.getItem("mtc_login_method")).toBe("rocky");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("builds a Rocky connection result from auth payload", () => {
    expect(
      createRockyConnectionFromAuth(
        {
          token: "proof-token",
          user_id: "user-2",
          party: "party-2",
          username: "bob",
          email: "bob@example.com",
        },
        "rocky-login",
      ),
    ).toMatchObject({
      provider: "rocky",
      userId: "user-2",
      partyId: "party-2",
      proof: "proof-token",
      displayName: "bob",
      email: "bob@example.com",
      metadata: { source: "rocky-login" },
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

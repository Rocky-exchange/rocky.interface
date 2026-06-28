import { describe, it, expect, beforeEach } from "vitest";
import { persistExchangeSession, getExchangeSessionToken, exchangeSessionHeaders } from "./session";

beforeEach(() => localStorage.clear());

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

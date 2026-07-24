import { describe, it, expect } from "vitest";
import { perpDisplayQuote } from "./displayQuote";

describe("perpDisplayQuote", () => {
  it("maps USDC/USDCX/empty to CUSD (no USDC pairs shown)", () => {
    expect(perpDisplayQuote("USDC")).toBe("CUSD");
    expect(perpDisplayQuote("usdc")).toBe("CUSD");
    expect(perpDisplayQuote("USDCX")).toBe("CUSD");
    expect(perpDisplayQuote(null)).toBe("CUSD");
    expect(perpDisplayQuote(undefined)).toBe("CUSD");
    expect(perpDisplayQuote("")).toBe("CUSD");
  });
  it("passes through a genuinely different quote", () => {
    expect(perpDisplayQuote("BTC")).toBe("BTC");
  });
});

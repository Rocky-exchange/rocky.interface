import { describe, it, expect } from "vitest";
import { perpDisplayQuote } from "./displayQuote";

describe("perpDisplayQuote", () => {
  it("maps USDC/USDCX/empty to USDA (no USDC pairs shown)", () => {
    expect(perpDisplayQuote("USDC")).toBe("USDA");
    expect(perpDisplayQuote("usdc")).toBe("USDA");
    expect(perpDisplayQuote("USDCX")).toBe("USDA");
    expect(perpDisplayQuote(null)).toBe("USDA");
    expect(perpDisplayQuote(undefined)).toBe("USDA");
    expect(perpDisplayQuote("")).toBe("USDA");
  });
  it("passes through a genuinely different quote", () => {
    expect(perpDisplayQuote("BTC")).toBe("BTC");
  });
});

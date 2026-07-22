import { describe, expect, it } from "vitest";

import { SPOT_MARKETS, resolveSpotMarket, toSpotDisplayAsset } from "./spotMarkets";

describe("SPOT_MARKETS", () => {
  it("maps USDA routes to the backend USDCx symbols", () => {
    expect(SPOT_MARKETS.map(({ routeSymbol, apiSymbol }) => ({ routeSymbol, apiSymbol }))).toEqual([
      { routeSymbol: "CBTC-USDA", apiSymbol: "CBTC-USDCX" },
      { routeSymbol: "CETH-USDA", apiSymbol: "CETH-USDCX" },
    ]);
  });
});

describe("resolveSpotMarket", () => {
  it("resolves routes case-insensitively and defaults safely", () => {
    expect(resolveSpotMarket("cbtc-usda").routeSymbol).toBe("CBTC-USDA");
    expect(resolveSpotMarket("  cbtc-usda  ").apiSymbol).toBe("CBTC-USDCX");
    expect(resolveSpotMarket("unknown").routeSymbol).toBe("CBTC-USDA");
    expect(resolveSpotMarket(undefined).routeSymbol).toBe("CBTC-USDA");
  });

  it("resolves the non-default CETH market", () => {
    expect(resolveSpotMarket("  ceth-usda  ").apiSymbol).toBe("CETH-USDCX");
  });
});

describe("toSpotDisplayAsset", () => {
  it("maps backend quote capitalization to USDA while preserving other assets", () => {
    expect(toSpotDisplayAsset("USDCx")).toBe("USDA");
    expect(toSpotDisplayAsset("USDCX")).toBe("USDA");
    expect(toSpotDisplayAsset("CBTC")).toBe("CBTC");
  });
});

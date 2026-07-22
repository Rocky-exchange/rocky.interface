import { describe, expect, it } from "vitest";

import { SPOT_MARKETS, resolveSpotMarket, toSpotDisplayAsset } from "./spotMarkets";

describe("SPOT_MARKETS", () => {
  it("maps USDA routes to the backend USDA symbols", () => {
    expect(SPOT_MARKETS.map(({ routeSymbol, apiSymbol }) => ({ routeSymbol, apiSymbol }))).toEqual([
      { routeSymbol: "CBTC-USDA", apiSymbol: "CBTC-USDA" },
      { routeSymbol: "CETH-USDA", apiSymbol: "CETH-USDA" },
    ]);
  });

  it("uses the approved CBTC display capitalization", () => {
    expect(resolveSpotMarket("CBTC-USDA").displayBase).toBe("CBTC");
  });

  it("uses the approved cETH display capitalization", () => {
    expect(resolveSpotMarket("CETH-USDA").displayBase).toBe("cETH");
  });
});

describe("resolveSpotMarket", () => {
  it("resolves routes case-insensitively and defaults safely", () => {
    expect(resolveSpotMarket("cbtc-usda").routeSymbol).toBe("CBTC-USDA");
    expect(resolveSpotMarket("  cbtc-usda  ").apiSymbol).toBe("CBTC-USDA");
    expect(resolveSpotMarket("unknown").routeSymbol).toBe("CBTC-USDA");
    expect(resolveSpotMarket(undefined).routeSymbol).toBe("CBTC-USDA");
  });

  it("resolves the non-default CETH market", () => {
    expect(resolveSpotMarket("  ceth-usda  ").apiSymbol).toBe("CETH-USDA");
  });
});

describe("toSpotDisplayAsset", () => {
  it("returns the backend asset label unchanged (already public: USDA/CBTC/cETH/CC)", () => {
    expect(toSpotDisplayAsset("USDA")).toBe("USDA");
    expect(toSpotDisplayAsset("CBTC")).toBe("CBTC");
    expect(toSpotDisplayAsset("cETH")).toBe("cETH");
  });
});

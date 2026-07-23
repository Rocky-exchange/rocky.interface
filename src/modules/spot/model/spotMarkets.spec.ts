import { describe, expect, it } from "vitest";

import { SPOT_MARKETS, resolveSpotMarket, toSpotDisplayAsset } from "./spotMarkets";

describe("SPOT_MARKETS", () => {
  it("maps every route to its backend symbol (apiSymbol == routeSymbol)", () => {
    expect(SPOT_MARKETS.map(({ routeSymbol, apiSymbol }) => ({ routeSymbol, apiSymbol }))).toEqual([
      { routeSymbol: "CBTC-USDA", apiSymbol: "CBTC-USDA" },
      { routeSymbol: "CETH-USDA", apiSymbol: "CETH-USDA" },
      { routeSymbol: "CC-USDA", apiSymbol: "CC-USDA" },
      { routeSymbol: "CETH-CBTC", apiSymbol: "CETH-CBTC" },
    ]);
  });

  it("lists CC-USDA so it appears in the market dropdown", () => {
    const cc = resolveSpotMarket("CC-USDA");
    expect(cc.routeSymbol).toBe("CC-USDA");
    expect(cc.displayBase).toBe("CC");
    expect(cc.displayQuote).toBe("USDA");
    expect(cc.chartSource).toBe("native"); // no Binance listing
  });

  it("lists the crypto-quoted CETH-CBTC pair", () => {
    const m = resolveSpotMarket("CETH-CBTC");
    expect(m.routeSymbol).toBe("CETH-CBTC");
    expect(m.displayBase).toBe("cETH");
    expect(m.displayQuote).toBe("CBTC");
    expect(m.apiBase).toBe("CETH");
    expect(m.apiQuote).toBe("CBTC");
    expect(m.chartSource).toBe("native");
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

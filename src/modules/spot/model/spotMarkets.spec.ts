import { describe, expect, it } from "vitest";

import { SPOT_MARKETS, resolveSpotMarket, toSpotDisplayAsset } from "./spotMarkets";

describe("SPOT_MARKETS", () => {
  it("maps every route to its backend symbol (apiSymbol == routeSymbol)", () => {
    expect(SPOT_MARKETS.map(({ routeSymbol, apiSymbol }) => ({ routeSymbol, apiSymbol }))).toEqual([
      { routeSymbol: "CBTC-CUSD", apiSymbol: "CBTC-CUSD" },
      { routeSymbol: "CETH-CUSD", apiSymbol: "CETH-CUSD" },
      { routeSymbol: "CC-CUSD", apiSymbol: "CC-CUSD" },
      { routeSymbol: "CETH-CBTC", apiSymbol: "CETH-CBTC" },
    ]);
  });

  it("lists CC-CUSD so it appears in the market dropdown", () => {
    const cc = resolveSpotMarket("CC-CUSD");
    expect(cc.routeSymbol).toBe("CC-CUSD");
    expect(cc.displayBase).toBe("CC");
    expect(cc.displayQuote).toBe("CUSD");
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
    expect(resolveSpotMarket("CBTC-CUSD").displayBase).toBe("CBTC");
  });

  it("uses the approved cETH display capitalization", () => {
    expect(resolveSpotMarket("CETH-CUSD").displayBase).toBe("cETH");
  });
});

describe("resolveSpotMarket", () => {
  it("resolves routes case-insensitively and defaults safely", () => {
    expect(resolveSpotMarket("cbtc-cusd").routeSymbol).toBe("CBTC-CUSD");
    expect(resolveSpotMarket("  cbtc-cusd  ").apiSymbol).toBe("CBTC-CUSD");
    expect(resolveSpotMarket("unknown").routeSymbol).toBe("CBTC-CUSD");
    expect(resolveSpotMarket(undefined).routeSymbol).toBe("CBTC-CUSD");
  });

  it("resolves the non-default CETH market", () => {
    expect(resolveSpotMarket("  ceth-cusd  ").apiSymbol).toBe("CETH-CUSD");
  });
});

describe("toSpotDisplayAsset", () => {
  it("returns the backend asset label unchanged (already public: CUSD/CBTC/cETH/CC)", () => {
    expect(toSpotDisplayAsset("CUSD")).toBe("CUSD");
    expect(toSpotDisplayAsset("CBTC")).toBe("CBTC");
    expect(toSpotDisplayAsset("cETH")).toBe("cETH");
  });
});

export type SpotMarket = {
  routeSymbol: string;
  apiSymbol: string;
  displayBase: string;
  displayQuote: "USDA";
  apiBase: string;
  apiQuote: "USDCx";
  chartSymbol: "BTCUSDT" | "ETHUSDT";
};

export const SPOT_MARKETS = [
  {
    routeSymbol: "CBTC-USDA",
    apiSymbol: "CBTC-USDCX",
    displayBase: "CBTC",
    displayQuote: "USDA",
    apiBase: "CBTC",
    apiQuote: "USDCx",
    chartSymbol: "BTCUSDT",
  },
  {
    routeSymbol: "CETH-USDA",
    apiSymbol: "CETH-USDCX",
    displayBase: "cETH",
    displayQuote: "USDA",
    apiBase: "CETH",
    apiQuote: "USDCx",
    chartSymbol: "ETHUSDT",
  },
] as const satisfies readonly SpotMarket[];

const DEFAULT_SPOT_MARKET = SPOT_MARKETS[0];

export function resolveSpotMarket(routeSymbol?: string): SpotMarket {
  const normalizedRouteSymbol = routeSymbol?.trim().toUpperCase();
  return SPOT_MARKETS.find((market) => market.routeSymbol === normalizedRouteSymbol) ?? DEFAULT_SPOT_MARKET;
}

export function toSpotDisplayAsset(asset: string): string {
  return asset.trim().toUpperCase() === "USDCX" ? "USDA" : asset;
}

export type SpotMarket = {
  routeSymbol: string;
  apiSymbol: string;
  displayBase: string;
  displayQuote: "USDA";
  apiBase: string;
  apiQuote: "USDA";
  chartSymbol: "BTCUSDT" | "ETHUSDT";
};

// The backend (post usda_rename migration) keys every spot endpoint on the
// "-USDA" symbol; apiSymbol == routeSymbol. The legacy quote form is retired.
export const SPOT_MARKETS = [
  {
    routeSymbol: "CBTC-USDA",
    apiSymbol: "CBTC-USDA",
    displayBase: "CBTC",
    displayQuote: "USDA",
    apiBase: "CBTC",
    apiQuote: "USDA",
    chartSymbol: "BTCUSDT",
  },
  {
    routeSymbol: "CETH-USDA",
    apiSymbol: "CETH-USDA",
    displayBase: "cETH",
    displayQuote: "USDA",
    apiBase: "CETH",
    apiQuote: "USDA",
    chartSymbol: "ETHUSDT",
  },
] as const satisfies readonly SpotMarket[];

const DEFAULT_SPOT_MARKET = SPOT_MARKETS[0];

export function resolveSpotMarket(routeSymbol?: string): SpotMarket {
  const normalizedRouteSymbol = routeSymbol?.trim().toUpperCase();
  return SPOT_MARKETS.find((market) => market.routeSymbol === normalizedRouteSymbol) ?? DEFAULT_SPOT_MARKET;
}

// Spot balances come back from the backend already labeled with their public
// asset ("USDA", "CBTC", "cETH", "CC"), so no display translation is needed.
export function toSpotDisplayAsset(asset: string): string {
  return asset;
}

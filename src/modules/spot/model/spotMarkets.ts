export type SpotMarket = {
  routeSymbol: string;
  apiSymbol: string;
  displayBase: string;
  displayQuote: string;
  apiBase: string;
  apiQuote: string;
  // Binance reference symbol used for the chart when `chartSource === "binance"`.
  // Pairs with no Binance listing (CC, and crypto-quoted pairs like CETH-CBTC)
  // use `chartSource: "native"` and the chart reads Rocky's own /api/v3/klines
  // keyed on `apiSymbol` instead — no third-party call. `chartSymbol` then just
  // mirrors the route symbol.
  chartSymbol: string;
  chartSource: "binance" | "native";
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
    chartSource: "binance",
  },
  {
    routeSymbol: "CETH-USDA",
    apiSymbol: "CETH-USDA",
    displayBase: "cETH",
    displayQuote: "USDA",
    apiBase: "CETH",
    apiQuote: "USDA",
    chartSymbol: "ETHUSDT",
    chartSource: "binance",
  },
  {
    routeSymbol: "CC-USDA",
    apiSymbol: "CC-USDA",
    displayBase: "CC",
    displayQuote: "USDA",
    apiBase: "CC",
    apiQuote: "USDA",
    // Canton Coin has no Binance spot listing → chart off our own klines.
    chartSymbol: "CC-USDA",
    chartSource: "native",
  },
  {
    routeSymbol: "CETH-CBTC",
    apiSymbol: "CETH-CBTC",
    displayBase: "cETH",
    displayQuote: "CBTC",
    apiBase: "CETH",
    apiQuote: "CBTC",
    // First crypto-quoted pair (cETH/CBTC ≈ ETH/BTC) → chart off our own klines.
    chartSymbol: "CETH-CBTC",
    chartSource: "native",
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

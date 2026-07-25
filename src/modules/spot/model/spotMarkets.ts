export type SpotMarket = {
  routeSymbol: string;
  apiSymbol: string;
  displayBase: string;
  displayQuote: string;
  apiBase: string;
  apiQuote: string;
  // Reference symbol used for the chart. `binance` reads spot klines,
  // `binance-futures` reads USD-M futures klines (matching rocky-bot's pricing
  // feed), and `native` reads Rocky's own /api/v3/klines.
  chartSymbol: string;
  chartSource: "binance" | "binance-futures" | "native";
};

// The backend keys every spot endpoint on the "-CUSD" symbol;
// apiSymbol == routeSymbol. The former USDA quote form is retired.
export const SPOT_MARKETS = [
  {
    routeSymbol: "CBTC-CUSD",
    apiSymbol: "CBTC-CUSD",
    displayBase: "CBTC",
    displayQuote: "CUSD",
    apiBase: "CBTC",
    apiQuote: "CUSD",
    chartSymbol: "BTCUSDT",
    chartSource: "binance",
  },
  {
    routeSymbol: "CETH-CUSD",
    apiSymbol: "CETH-CUSD",
    displayBase: "cETH",
    displayQuote: "CUSD",
    apiBase: "CETH",
    apiQuote: "CUSD",
    chartSymbol: "ETHUSDT",
    chartSource: "binance-futures",
  },
  {
    routeSymbol: "CC-CUSD",
    apiSymbol: "CC-CUSD",
    displayBase: "CC",
    displayQuote: "CUSD",
    apiBase: "CC",
    apiQuote: "CUSD",
    // Canton Coin has no Binance spot listing; use the same Binance Futures
    // CCUSDT feed that drives Rocky's market maker.
    chartSymbol: "CCUSDT",
    chartSource: "binance-futures",
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
// asset ("CUSD", "CBTC", "cETH", "CC"), so no display translation is needed.
export function toSpotDisplayAsset(asset: string): string {
  return asset;
}

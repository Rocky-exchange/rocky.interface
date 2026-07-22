export const SPOT_MARKETS = [
  { symbol: "CBTC-USDA", base: "CBTC", quote: "USDA" },
  { symbol: "CETH-USDA", base: "cETH", quote: "USDA" },
  { symbol: "CC-USDA", base: "CC", quote: "USDA" },
] as const;

export function spotMarketAssetIconSymbol(symbol: string): string {
  const marketAsset = SPOT_MARKETS.find(
    (market) => market.base.toLowerCase() === symbol.toLowerCase()
  )?.base;
  const normalized = (marketAsset || symbol).toLowerCase();

  if (normalized === "cbtc" || normalized === "btc") return "btc";
  if (normalized === "ceth" || normalized === "eth") return "eth";
  if (normalized === "usda") return "usdc";
  return normalized;
}

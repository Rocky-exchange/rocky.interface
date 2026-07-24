export const SPOT_MARKETS = [
  { symbol: "CBTC-CUSD", base: "CBTC", quote: "CUSD" },
  { symbol: "CETH-CUSD", base: "cETH", quote: "CUSD" },
  { symbol: "CC-CUSD", base: "CC", quote: "CUSD" },
] as const;

export function spotMarketAssetIconSymbol(symbol: string): string {
  const marketAsset = SPOT_MARKETS.find(
    (market) => market.base.toLowerCase() === symbol.toLowerCase()
  )?.base;
  const normalized = (marketAsset || symbol).toLowerCase();

  if (normalized === "cbtc" || normalized === "btc") return "btc";
  if (normalized === "ceth" || normalized === "eth") return "eth";
  if (normalized === "cusd") return "cusd";
  return normalized;
}

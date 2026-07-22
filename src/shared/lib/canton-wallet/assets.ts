export type CantonFundsAsset = "CC" | "USDA" | "CBTC" | "cETH";
export type CantonFundsApiAsset = "CC" | "USDC" | "CBTC" | "cETH";

export type CantonFundingAsset = {
  symbol: CantonFundsAsset;
  apiSymbol: CantonFundsApiAsset;
  instrumentAdmin: string | null;
  instrumentId: string | null;
};

export const CANTON_FUNDING_ASSETS: readonly CantonFundingAsset[] = [
  {
    symbol: "USDA",
    apiSymbol: "USDC",
    instrumentAdmin:
      "party-28dc4516-b5ca-44ff-86c7-2107e90a6807::1220b8301e18aa8a401d6e34e6c20f8b0243183c514373bca8f1b6b9270246341a9e",
    instrumentId: "3574b536-cad1-4074-9b64-859398713ba0",
  },
  {
    symbol: "CBTC",
    apiSymbol: "CBTC",
    instrumentAdmin: "cbtc-network::12205af3b949a04776fc48cdcc05a060f6bda2e470632935f375d1049a8546a3b262",
    instrumentId: "CBTC",
  },
  {
    symbol: "cETH",
    apiSymbol: "cETH",
    instrumentAdmin: "rails-cethMain-1::12200350ba6e96e3b701c3048b5aa013a8c1c08833e8ebf54339cff581055c29003a",
    instrumentId: "cETH",
  },
  { symbol: "CC", apiSymbol: "CC", instrumentAdmin: null, instrumentId: null },
] as const;

export function getCantonFundingAsset(symbol: CantonFundsAsset): CantonFundingAsset {
  const asset = CANTON_FUNDING_ASSETS.find((item) => item.symbol === symbol);
  if (!asset) throw new Error(`Unsupported Canton funding asset: ${symbol}`);
  return asset;
}

export function walletFacingAssetSymbol(value: string | null | undefined): CantonFundsAsset | null {
  const normalized = (value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]/g, "");
  if (!normalized) return null;
  if (normalized === "CC" || normalized.includes("CANTONCOIN") || normalized.includes("AMULET")) return "CC";
  if (normalized === "CBTC") return "CBTC";
  if (normalized === "CETH") return "cETH";
  if (
    normalized === "USDC" ||
    normalized === "USDA" ||
    normalized.includes("USDA") ||
    normalized.includes("USDCX") ||
    normalized === "3574B536CAD140749B64859398713BA0"
  )
    return "USDA";
  return null;
}

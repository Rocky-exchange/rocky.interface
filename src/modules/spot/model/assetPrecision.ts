import BigNumber from "bignumber.js";

export type SpotAssetPrecisions = Record<string, number>;

export const DEFAULT_SPOT_ASSET_PRECISIONS: SpotAssetPrecisions = {
  CUSD: 10,
  CBTC: 8,
  CETH: 18,
  CC: 10,
};

function normalizedAsset(asset: string): string {
  const normalized = asset.trim().toUpperCase();
  return normalized === "USDC" || normalized === "USDCX" ? "CUSD" : normalized;
}

export function spotAssetPrecision(
  asset: string,
  precisions: SpotAssetPrecisions = DEFAULT_SPOT_ASSET_PRECISIONS,
): number {
  const normalized = normalizedAsset(asset);
  return precisions[normalized] ?? DEFAULT_SPOT_ASSET_PRECISIONS[normalized] ?? 8;
}

export function truncateSpotAssetAmount(
  value: string,
  asset: string,
  precisions: SpotAssetPrecisions = DEFAULT_SPOT_ASSET_PRECISIONS,
): BigNumber | null {
  const parsed = new BigNumber(value);
  if (!parsed.isFinite()) return null;
  return parsed.decimalPlaces(spotAssetPrecision(asset, precisions), BigNumber.ROUND_DOWN);
}

export function formatSpotAssetAmount(
  value: string,
  asset: string,
  precisions: SpotAssetPrecisions = DEFAULT_SPOT_ASSET_PRECISIONS,
): string {
  const truncated = truncateSpotAssetAmount(value, asset, precisions);
  return truncated ? truncated.toFormat() : "—";
}

export function hasSpotAssetPrecision(
  value: string,
  asset: string,
  precisions: SpotAssetPrecisions = DEFAULT_SPOT_ASSET_PRECISIONS,
): boolean {
  const parsed = new BigNumber(value);
  const truncated = truncateSpotAssetAmount(value, asset, precisions);
  return Boolean(truncated && parsed.eq(truncated));
}

import useSWR from "swr";

import { spotApi, type SupportedAsset } from "../api/spotClient";
import {
  DEFAULT_SPOT_ASSET_PRECISIONS,
  type SpotAssetPrecisions,
} from "../model/assetPrecision";

export function buildSpotAssetPrecisions(assets: SupportedAsset[] | undefined): SpotAssetPrecisions {
  const next = { ...DEFAULT_SPOT_ASSET_PRECISIONS };
  for (const asset of assets ?? []) {
    const walletSymbol = asset.metadata?.wallet_symbol?.trim();
    const displaySymbol =
      walletSymbol || (asset.symbol.toUpperCase() === "USDC" ? "USDA" : asset.symbol);
    if (Number.isInteger(asset.decimals) && asset.decimals >= 0) {
      next[displaySymbol.toUpperCase()] = asset.decimals;
    }
  }
  return next;
}

export function useSpotAssetPrecisions(): SpotAssetPrecisions {
  const { data } = useSWR("spot-asset-precisions", () => spotApi.assets(), {
    fallbackData: { assets: [], margin_assets: [] },
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  return buildSpotAssetPrecisions(data.assets);
}

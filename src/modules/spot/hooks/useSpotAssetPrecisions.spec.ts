import { describe, expect, it } from "vitest";

import { buildSpotAssetPrecisions } from "./useSpotAssetPrecisions";

describe("buildSpotAssetPrecisions", () => {
  it("maps backend USDC metadata to the public USDA symbol", () => {
    const precisions = buildSpotAssetPrecisions([
      {
        symbol: "USDC",
        decimals: 10,
        enabled: true,
        metadata: { wallet_symbol: "USDA" },
      },
    ]);

    expect(precisions.USDA).toBe(10);
  });

  it("keeps canonical precision seeds while metadata is loading", () => {
    expect(buildSpotAssetPrecisions(undefined)).toMatchObject({
      USDA: 10,
      CBTC: 8,
      CETH: 18,
      CC: 10,
    });
  });
});

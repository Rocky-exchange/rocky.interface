import { describe, expect, it } from "vitest";

import {
  DEFAULT_SPOT_ASSET_PRECISIONS,
  formatSpotAssetAmount,
  hasSpotAssetPrecision,
} from "./assetPrecision";

describe("spot asset precision", () => {
  it("truncates USDA to ten decimals without rounding", () => {
    expect(formatSpotAssetAmount("1.1453822379697668", "USDA")).toBe("1.1453822379");
    expect(formatSpotAssetAmount("1.99999999999", "USDA")).toBe("1.9999999999");
  });

  it("removes insignificant zeroes", () => {
    expect(formatSpotAssetAmount("20.0000000000", "USDA")).toBe("20");
    expect(formatSpotAssetAmount("0.0000000000", "USDA")).toBe("0");
  });

  it("uses the canonical precision before metadata loads", () => {
    expect(DEFAULT_SPOT_ASSET_PRECISIONS.USDA).toBe(10);
  });

  it("validates transfer input scale", () => {
    expect(hasSpotAssetPrecision("1.1453822379", "USDA")).toBe(true);
    expect(hasSpotAssetPrecision("1.14538223791", "USDA")).toBe(false);
  });
});

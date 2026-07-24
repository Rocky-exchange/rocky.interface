import { describe, expect, it } from "vitest";

import {
  DEFAULT_SPOT_ASSET_PRECISIONS,
  formatSpotAssetAmount,
  hasSpotAssetPrecision,
} from "./assetPrecision";

describe("spot asset precision", () => {
  it("truncates CUSD to ten decimals without rounding", () => {
    expect(formatSpotAssetAmount("1.1453822379697668", "CUSD")).toBe("1.1453822379");
    expect(formatSpotAssetAmount("1.99999999999", "CUSD")).toBe("1.9999999999");
  });

  it("removes insignificant zeroes", () => {
    expect(formatSpotAssetAmount("20.0000000000", "CUSD")).toBe("20");
    expect(formatSpotAssetAmount("0.0000000000", "CUSD")).toBe("0");
  });

  it("uses the canonical precision before metadata loads", () => {
    expect(DEFAULT_SPOT_ASSET_PRECISIONS.CUSD).toBe(10);
  });

  it("validates transfer input scale", () => {
    expect(hasSpotAssetPrecision("1.1453822379", "CUSD")).toBe(true);
    expect(hasSpotAssetPrecision("1.14538223791", "CUSD")).toBe(false);
  });
});

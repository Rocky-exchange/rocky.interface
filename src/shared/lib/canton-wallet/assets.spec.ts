import { describe, expect, it } from "vitest";

import { CANTON_FUNDING_ASSETS, getCantonFundingAsset, walletFacingAssetSymbol } from "./assets";

describe("Canton funding assets", () => {
  it("exposes CUSD as the only dollar funding asset with its registry identity", () => {
    expect(CANTON_FUNDING_ASSETS.map(({ symbol }) => symbol)).toEqual(["CUSD", "CBTC", "cETH", "CC"]);
    expect(getCantonFundingAsset("CUSD")).toMatchObject({
      apiSymbol: "CUSD",
      instrumentAdmin:
        "party-28dc4516-b5ca-44ff-86c7-2107e90a6807::1220b8301e18aa8a401d6e34e6c20f8b0243183c514373bca8f1b6b9270246341a9e",
      instrumentId: "481871d4-ca56-42a8-b2d3-4b7d28742946",
    });
    expect(walletFacingAssetSymbol("481871d4-ca56-42a8-b2d3-4b7d28742946")).toBe("CUSD");
    expect(walletFacingAssetSymbol("3574b536-cad1-4074-9b64-859398713ba0")).toBeNull();
  });
});

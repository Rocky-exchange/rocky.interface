import { describe, expect, it } from "vitest";

import { normalizeRockyWalletBalance } from "./balances";

describe("normalizeRockyWalletBalance", () => {
  it("does not report a USDCx balance as CUSD", () => {
    const rows = normalizeRockyWalletBalance([
      {
        symbol: "USDCx",
        instrument_admin:
          "decentralized-usdc-interchain-rep::12208115f1e168dd7e792320be9c4ca720c751a02a3053c7606e1c1cd3dad9bf60ef",
        instrument_id: "USDCx",
        balance: "14.3357",
      },
      {
        symbol: "3574b536-cad1-4074-9b64-859398713ba0",
        instrument_admin:
          "party-28dc4516-b5ca-44ff-86c7-2107e90a6807::1220b8301e18aa8a401d6e34e6c20f8b0243183c514373bca8f1b6b9270246341a9e",
        instrument_id: "3574b536-cad1-4074-9b64-859398713ba0",
        balance: "0",
      },
    ]);

    expect(rows.find((row) => row.symbol === "CUSD")?.amount).toBeNull();
  });
});

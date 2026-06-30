import { describe, expect, it } from "vitest";

import { disabledSdk } from "sdk/utils/testUtil";

// Integration test against live Arbitrum mainnet (RPC + Subsquid). Skipped in CI;
// run manually when verifying upstream GMX SDK compatibility.
describe.skip("Trades", () => {
  it("should be able to get positions", async () => {
    const { marketsInfoData, tokensData } = await disabledSdk.markets.getMarketsInfo();

    const trades = await disabledSdk.trades.getTradeHistory({
      forAllAccounts: false,
      pageSize: 50,
      marketsInfoData,
      tokensData,
      pageIndex: 0,
    });

    expect(trades).toBeDefined();
  });
});

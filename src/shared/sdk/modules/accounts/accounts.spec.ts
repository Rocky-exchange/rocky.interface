import { describe, expect, it } from "vitest";

import { disabledSdk } from "sdk/utils/testUtil";

describe("Accounts", () => {
  it("should be able to get delegates", async () => {
    const delegates = await disabledSdk.accounts.getGovTokenDelegates();
    expect(delegates).toBeDefined();
  });
});

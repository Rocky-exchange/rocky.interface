import { describe, expect, it } from "vitest";

import { abbreviateWalletAddress } from "./addressFormat";

describe("abbreviateWalletAddress", () => {
  it("uses the wallet modal middle-abbreviation contract", () => {
    expect(abbreviateWalletAddress("rockywallet-joe::1220abcdefghijklmnopqrstuvwxyz", 30)).toBe(
      "rockywallet-j...nopqrstuvwxyz",
    );
    expect(abbreviateWalletAddress("short-party", 30)).toBe("short-party");
  });
});

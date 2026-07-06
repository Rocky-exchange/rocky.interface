import { describe, expect, it } from "vitest";

import { getWalletProviderLogo } from "./walletLogos";

describe("wallet provider logos", () => {
  it("maps every wallet provider to its own logo asset", () => {
    expect(getWalletProviderLogo("rocky")).toMatchObject({
      alt: "Rocky Wallet",
      fit: "cover",
    });
    expect(getWalletProviderLogo("rocky").src).toContain("rocky-wallet");

    expect(getWalletProviderLogo("loop")).toMatchObject({
      alt: "Loop Wallet",
      fit: "contain",
    });
    expect(getWalletProviderLogo("loop").src).toContain("loop-wallet");

    expect(getWalletProviderLogo("console")).toMatchObject({
      alt: "Console Wallet",
      fit: "cover",
    });
    expect(getWalletProviderLogo("console").src).toContain("console-wallet-icon");
  });
});

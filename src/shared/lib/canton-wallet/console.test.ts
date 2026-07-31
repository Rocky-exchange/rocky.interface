import { beforeEach, describe, expect, it, vi } from "vitest";

const consoleWalletMocks = vi.hoisted(() => ({
  checkExtensionAvailability: vi.fn(),
  connect: vi.fn(),
  getPrimaryAccount: vi.fn(),
  signMessage: vi.fn(),
}));

vi.mock("@console-wallet/dapp-sdk", () => ({
  consoleWallet: consoleWalletMocks,
}));

import { connectConsoleWallet } from "./console";

describe("Console Wallet authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleWalletMocks.checkExtensionAvailability.mockResolvedValue({ status: "installed" });
    consoleWalletMocks.connect.mockResolvedValue({ isConnected: true });
    consoleWalletMocks.getPrimaryAccount.mockResolvedValue({
      partyId: `rocky::${"a".repeat(68)}`,
      networkId: "CANTON_NETWORK",
      hint: "Rocky Console",
      publicKey: "11".repeat(32),
      namespace: "a".repeat(68),
      signingProviderId: "console",
    });
    consoleWalletMocks.signMessage.mockResolvedValue("22".repeat(64));
  });

  it("uses the Console extension's live-supported base64 signing payload", async () => {
    const wallet = await connectConsoleWallet();
    const message = "Rocky Exchange wallet verification\nNonce: 123";

    await expect(wallet.signMessage?.(message)).resolves.toBe("22".repeat(64));
    expect(consoleWalletMocks.signMessage).toHaveBeenCalledWith({
      message: {
        base64: encodeUtf8Base64(message),
      },
    });
  });
});

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

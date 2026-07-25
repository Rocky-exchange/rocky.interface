import { beforeEach, describe, expect, it, vi } from "vitest";

const sendProvider = vi.hoisted(() => ({
  isInstalled: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getPrimaryAccount: vi.fn(),
  signMessage: vi.fn(),
  ledgerApi: vi.fn(),
}));

vi.mock("@partylayer/adapter-send", () => ({
  SEND_INSTALL_URL: "https://sigilry.org",
  SEND_SIGNING_METHOD: "webauthn-prf",
  SendProvider: class {
    isInstalled = sendProvider.isInstalled;
    connect = sendProvider.connect;
    disconnect = sendProvider.disconnect;
    getPrimaryAccount = sendProvider.getPrimaryAccount;
    signMessage = sendProvider.signMessage;
    ledgerApi = sendProvider.ledgerApi;
  },
}));

import { connectSendWallet, fetchSendWalletHoldings, sendWalletAdapter } from "./send";

describe("Send wallet adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendProvider.isInstalled.mockResolvedValue(true);
    sendProvider.connect.mockResolvedValue({
      isConnected: true,
      network: { networkId: "canton:mainnet" },
    });
    sendProvider.getPrimaryAccount.mockResolvedValue({
      partyId: "send-user::1220send",
      hint: "Send User",
      publicKey: "base64-spki",
      namespace: "1220send",
      networkId: "canton:mainnet",
      signingProviderId: "webauthn-prf",
    });
    sendProvider.signMessage.mockResolvedValue({ signature: "3044deadbeef" });
    sendProvider.disconnect.mockResolvedValue(null);
  });

  it("connects over the Send announcement channel and exposes a verifiable session", async () => {
    const wallet = await connectSendWallet();

    expect(sendProvider.isInstalled).toHaveBeenCalledTimes(1);
    expect(sendProvider.connect).toHaveBeenCalledTimes(1);
    expect(wallet.connection).toEqual({
      provider: "send",
      partyId: "send-user::1220send",
      walletAddress: "send-user::1220send",
      alias: "Send User",
      displayName: "Send User",
      metadata: {
        source: "partylayer-send-adapter",
        publicKey: "base64-spki",
        namespace: "1220send",
        networkId: "canton:mainnet",
        signingProviderId: "webauthn-prf",
        signingMethod: "webauthn-prf",
      },
    });

    await expect(wallet.signMessage?.("challenge")).resolves.toBe("3044deadbeef");
    expect(sendProvider.signMessage).toHaveBeenCalledWith("challenge");
  });

  it("disconnects the Send provider through the same adapter instance", async () => {
    await sendWalletAdapter.disconnect();
    expect(sendProvider.disconnect).toHaveBeenCalledTimes(1);
  });

  it("loads Token Standard holdings through Send's ledger API", async () => {
    sendProvider.ledgerApi
      .mockResolvedValueOnce({ response: JSON.stringify({ offset: 418 }) })
      .mockResolvedValueOnce({
        response: JSON.stringify([
          {
            contractEntry: {
              JsActiveContract: {
                createdEvent: {
                  contractId: "00holding",
                  interfaceViews: [
                    {
                      viewValue: {
                        owner: "send-user::1220send",
                        amount: "2.75",
                        instrumentId: {
                          admin: "cbtc-network::1220admin",
                          id: "CBTC",
                        },
                        lock: null,
                      },
                    },
                  ],
                },
              },
            },
          },
        ]),
      });

    await expect(fetchSendWalletHoldings("send-user::1220send")).resolves.toEqual([
      {
        contract_id: "00holding",
        instrument_id: {
          admin: "cbtc-network::1220admin",
          id: "CBTC",
        },
        total_unlocked_coin: "2.75",
      },
    ]);
    expect(sendProvider.ledgerApi).toHaveBeenNthCalledWith(1, {
      requestMethod: "get",
      resource: "/v2/state/ledger-end",
    });
    expect(sendProvider.ledgerApi).toHaveBeenNthCalledWith(2, {
      requestMethod: "post",
      resource: "/v2/state/active-contracts",
      body: {
        activeAtOffset: 418,
        eventFormat: {
          filtersByParty: {
            "send-user::1220send": { cumulative: [] },
          },
          verbose: true,
        },
      },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendProvider = vi.hoisted(() => ({
  isInstalled: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getPrimaryAccount: vi.fn(),
  signMessage: vi.fn(),
  ledgerApi: vi.fn(),
  prepareExecuteAndWait: vi.fn(),
}));

vi.mock("@partylayer/adapter-send", () => ({
  SEND_SIGNING_METHOD: "webauthn-prf",
  SendNotInstalledError: class extends Error {},
  SendProvider: class {
    isInstalled = sendProvider.isInstalled;
    connect = sendProvider.connect;
    disconnect = sendProvider.disconnect;
    getPrimaryAccount = sendProvider.getPrimaryAccount;
    signMessage = sendProvider.signMessage;
    ledgerApi = sendProvider.ledgerApi;
    prepareExecuteAndWait = sendProvider.prepareExecuteAndWait;
  },
}));

vi.mock("./session", () => ({
  exchangeSessionHeaders: () => ({ Authorization: "Bearer exchange-session" }),
}));

import {
  connectSendWallet,
  fetchSendWalletHoldings,
  sendWalletAdapter,
  submitSendWalletTransfer,
} from "./send";

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
    sendProvider.prepareExecuteAndWait.mockResolvedValue({
      tx: {
        status: "executed",
        commandId: "send-transfer-command",
        payload: {
          updateId: "1220update",
          completionOffset: 420,
        },
      },
    });
  });

  it("connects over the Send announcement channel and exposes a verifiable session", async () => {
    const wallet = await connectSendWallet();

    expect(sendProvider.connect).toHaveBeenCalledTimes(1);
    expect(wallet.connection).toEqual({
      provider: "send",
      partyId: "send-user::1220send",
      walletAddress: "send-user::1220send",
      alias: "Send User",
      displayName: "sendwallet",
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

  it("does not reject an installed wallet when the short detection probe misses its announcement", async () => {
    sendProvider.isInstalled.mockResolvedValue(false);

    await expect(connectSendWallet()).resolves.toMatchObject({
      connection: {
        provider: "send",
        partyId: "send-user::1220send",
      },
    });
    expect(sendProvider.isInstalled).not.toHaveBeenCalled();
    expect(sendProvider.connect).toHaveBeenCalledTimes(1);
  });

  it("disconnects the Send provider through the same adapter instance", async () => {
    await sendWalletAdapter.disconnect();
    expect(sendProvider.disconnect).toHaveBeenCalledTimes(1);
  });

  it("loads Token Standard holdings through Send's ledger API", async () => {
    sendProvider.ledgerApi
      .mockResolvedValueOnce({ offset: 418 })
      .mockResolvedValueOnce([
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
      ]);

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
        filter: {
          filtersByParty: {
            "send-user::1220send": {
              cumulative: [
                {
                  identifierFilter: {
                    InterfaceFilter: {
                      value: {
                        interfaceId:
                          "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding",
                        includeInterfaceView: true,
                        includeCreatedEventBlob: false,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        verbose: false,
      },
    });
  });

  it("submits CUSD through the Token Standard transfer factory and opens Send approval", async () => {
    vi.setSystemTime(new Date("2026-07-25T06:30:00.000Z"));
    sendProvider.ledgerApi
      .mockResolvedValueOnce({ offset: 418 })
      .mockResolvedValueOnce([
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: "00cusdholding",
                interfaceViews: [
                  {
                    viewValue: {
                      owner: "send-user::1220send",
                      amount: "0.20",
                      instrumentId: {
                        admin:
                          "party-28dc4516-b5ca-44ff-86c7-2107e90a6807::1220b8301e18aa8a401d6e34e6c20f8b0243183c514373bca8f1b6b9270246341a9e",
                        id: "481871d4-ca56-42a8-b2d3-4b7d28742946",
                      },
                      lock: null,
                    },
                  },
                ],
              },
            },
          },
        },
      ]);
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          factoryId: "00transferfactory",
          transferKind: "direct",
          choiceContext: {
            choiceContextData: {
              values: {
                "sender-credential": {
                  tag: "AV_ContractId",
                  value: "00sendercredential",
                },
              },
            },
            disclosedContracts: [
              {
                templateId: "#package:Module:Template",
                contractId: "00disclosed",
                createdEventBlob: "blob",
                domainId: "sync",
                packageName: "splice-api-token-transfer-instruction-v1",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitSendWalletTransfer({
        from: "send-user::1220send",
        to: "Rocky::1220rocky",
        token: "CUSD",
        amount: "0.20",
        memo: "rocky:deposit:reference",
      }),
    ).resolves.toMatchObject({
      status: "executed",
      updateId: "1220update",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v0/registrars/party-28dc4516-b5ca-44ff-86c7-2107e90a6807%3A%3A1220b8301e18aa8a401d6e34e6c20f8b0243183c514373bca8f1b6b9270246341a9e/registry/transfer-instruction/v1/transfer-factory",
      ),
      expect.objectContaining({ method: "POST" }),
    );
    const factoryBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(factoryBody.choiceArguments.transfer).toMatchObject({
      sender: "send-user::1220send",
      receiver: "Rocky::1220rocky",
      amount: "0.20",
      inputHoldingCids: ["00cusdholding"],
      meta: {
        values: {
          "splice.lfdecentralizedtrust.org/reason": "rocky:deposit:reference",
        },
      },
    });

    expect(sendProvider.prepareExecuteAndWait).toHaveBeenCalledTimes(1);
    const submission = sendProvider.prepareExecuteAndWait.mock.calls[0][0];
    expect(submission.actAs).toEqual(["send-user::1220send"]);
    expect(submission.commands).toHaveLength(1);
    expect(submission.commands[0].ExerciseCommand).toMatchObject({
      templateId:
        "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory",
      contractId: "00transferfactory",
      choice: "TransferFactory_Transfer",
    });
    const choiceArgument = submission.commands[0].ExerciseCommand.choiceArgument;
    const transferValue = choiceArgument.record.fields.find(
      (field: { label: string }) => field.label === "transfer",
    ).value;
    const metaValue = transferValue.record.fields.find(
      (field: { label: string }) => field.label === "meta",
    ).value;
    const metadataValues = metaValue.record.fields.find(
      (field: { label: string }) => field.label === "values",
    ).value;
    expect(metadataValues).toEqual({
      textMap: {
        entries: [
          {
            key: "splice.lfdecentralizedtrust.org/reason",
            value: { text: "rocky:deposit:reference" },
          },
        ],
      },
    });
    expect(submission.disclosedContracts).toEqual([
      {
        contractId: "00disclosed",
        createdEventBlob: "blob",
        synchronizerId: "sync",
      },
    ]);
  });

  it("routes CC through Rocky's authenticated Scan transfer factory instead of Utilities", async () => {
    sendProvider.ledgerApi
      .mockResolvedValueOnce({ offset: 419 })
      .mockResolvedValueOnce([
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: "00cc-holding",
                interfaceViews: [
                  {
                    viewValue: {
                      owner: "send-user::1220send",
                      amount: "20",
                      instrumentId: {
                        admin: "dso::1220admin",
                        id: "Amulet",
                      },
                      lock: null,
                    },
                  },
                ],
              },
            },
          },
        },
      ]);
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) !== "/v1/deposits/send/transfer-factory") {
        return new Response(JSON.stringify({ error: "Instrument configuration not found" }), {
          status: 404,
        });
      }
      return new Response(
        JSON.stringify({
          factoryId: "00cc-transfer-factory",
          transferKind: "direct",
          choiceContext: {
            choiceContextData: { values: {} },
            disclosedContracts: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitSendWalletTransfer({
        from: "send-user::1220send",
        to: "Rocky::1220rocky",
        token: "CC",
        amount: "6",
        memo: "rocky:deposit:cc-reference",
      }),
    ).resolves.toMatchObject({
      status: "executed",
      updateId: "1220update",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/deposits/send/transfer-factory",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

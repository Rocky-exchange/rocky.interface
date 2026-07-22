import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CantonFundsError,
  fetchCantonFundsHistory,
  fetchFundingAccountBalance,
  fetchPlatformAccountBalance,
  fetchPlatformAccountBalances,
  fetchPendingUsdaOffers,
  fetchSpotTransferHistory,
  fetchUsdaAutoAccept,
  platformDepositApiAsset,
  requestDepositReference,
  submitCantonWalletDeposit,
  setUsdaAutoAccept,
  submitPlatformWithdrawal,
  transferSpotBalance,
  type CantonFundsAsset,
} from "./funds";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createMemoryStorage());
  localStorage.setItem("rocky_exchange_session", "exchange-token");
});

describe("canton wallet funds", () => {
  it("maps all funding assets to backend account symbols", () => {
    expect((["USDA", "CBTC", "cETH", "CC"] as CantonFundsAsset[]).map(platformDepositApiAsset)).toEqual([
      "USDC",
      "CBTC",
      "cETH",
      "CC",
    ]);
  });

  it("requests a USDA deposit reference with exchange session auth", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        asset: "USDC",
        target_party_id: "target-party",
        deposit_ref: "dep-1",
        reason_metadata_key: "splice.lfdecentralizedtrust.org/reason",
        expires_at: "2030-01-01T00:00:00Z",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const reference = await requestDepositReference({ asset: "USDA", amount: "12.50" });

    expect(reference.deposit_ref).toBe("dep-1");
    expect(fetchMock).toHaveBeenCalledWith("/v1/deposits/reference", expect.objectContaining({ method: "POST" }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: "Bearer exchange-token",
      "content-type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      asset: "USDC",
      amount_expected: "12.50",
    });
  });

  it("submits Rocky deposits through the local wallet SDK transfer flow", async () => {
    const provider = createRockyWalletProvider();
    window.rockyWallet = provider;
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === "/v1/account/me/CC") {
        return jsonResponse({ asset: "CC", available: fetchMock.mock.calls.length > 1 ? "1.5" : "0", locked: "0" });
      }
      if (String(url) === "/v1/deposits/reference") {
        return jsonResponse({
          asset: "CC",
          target_party_id: "target-party",
          deposit_ref: "dep-1",
          reason_metadata_key: "splice.lfdecentralizedtrust.org/reason",
          expires_at: "2030-01-01T00:00:00Z",
        });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitCantonWalletDeposit({
      provider: "rocky",
      walletParty: "party-1",
      asset: "CC",
      amount: "1.5",
    });

    expect(fetchMock).toHaveBeenCalledWith("/v1/deposits/reference", expect.objectContaining({ method: "POST" }));
    expect(provider.sendTransfer).toHaveBeenCalledWith({
      symbol: "CC",
      to: "target-party",
      amount: "1.5",
      memo: "dep-1",
    });
    expect(result.wallet_transfer).toBe("rocky_wallet_submitted");
    expect(result.platform_credit_status).toBe("confirmed");
    expect(result.platform_available).toBe("1.5");
  });

  it("submits explicit USDA contract-to-spot transfers with exchange session auth", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        asset: "USDA",
        direction: "toSpot",
        amount: "1",
        fundingAvailable: "0",
        spotFree: "1",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transferSpotBalance({ asset: "USDA", amount: "1", direction: "toSpot" })
    ).resolves.toMatchObject({ spotFree: "1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/spot/transfer",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer exchange-token" }),
      })
    );
  });

  it("loads persistent user spot transfer history", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        transfers: [
          {
            eventId: "event-1",
            asset: "USDA",
            amount: "1",
            direction: "toSpot",
            createdAt: "2026-07-22T08:00:00Z",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSpotTransferHistory()).resolves.toEqual({
      transfers: [
        {
          eventId: "event-1",
          asset: "USDA",
          amount: "1",
          direction: "toSpot",
          createdAt: "2026-07-22T08:00:00Z",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/spot/transfers",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer exchange-token" }),
      })
    );
  });

  it("disconnects and clears the wallet when the exchange session is invalid", async () => {
    const provider = createRockyWalletProvider();
    window.rockyWallet = provider;
    localStorage.setItem("rocky_exchange_session", "stale-token");
    localStorage.setItem("mtc_login_method", "rocky");
    localStorage.setItem("mtc_party", "party-1");
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) => jsonResponse({ error: "invalid session" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestDepositReference({ asset: "USDA", amount: "0.2" })).rejects.toMatchObject({
      message: "invalid session",
      status: 401,
    });

    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("rocky_exchange_session")).toBeNull();
    expect(localStorage.getItem("mtc_party")).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/v1/deposits/reference"]);
  });

  it("preserves the wallet session for unrelated unauthorized responses", async () => {
    const provider = createRockyWalletProvider();
    window.rockyWallet = provider;
    localStorage.setItem("mtc_login_method", "rocky");
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) => jsonResponse({ error: "permission denied" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestDepositReference({ asset: "CC", amount: "1" })).rejects.toMatchObject({
      message: "permission denied",
      status: 401,
    });

    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(localStorage.getItem("rocky_exchange_session")).toBe("exchange-token");
  });

  it("returns pending deposit metadata when platform credit is delayed", async () => {
    vi.useFakeTimers();
    const provider = createRockyWalletProvider();
    window.rockyWallet = provider;
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === "/v1/account/me/USDC") {
        return jsonResponse({ asset: "USDC", available: "0", locked: "0" });
      }
      if (String(url) === "/v1/deposits/reference") {
        return jsonResponse({
          asset: "USDC",
          target_party_id: "target-party",
          deposit_ref: "dep-delayed",
          reason_metadata_key: "splice.lfdecentralizedtrust.org/reason",
          expires_at: "2030-01-01T00:00:00Z",
        });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = submitCantonWalletDeposit({
      provider: "rocky",
      walletParty: "party-1",
      asset: "USDA",
      amount: "0.2",
    });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.platform_credit_status).toBe("pending");
    expect(result.platform_previous_balance).toBe("0");
    expect(result.deposit_ref).toBe("dep-delayed");
  });

  it("submits withdrawals to the connected wallet party", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        withdrawal_id: "wid-1",
        status: "submitted",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitPlatformWithdrawal({
      asset: "USDA",
      amount: "5",
      destinationParty: " party-1 ",
      idempotencyKey: "idempotency-1",
    });

    expect(result.withdrawal_id).toBe("wid-1");
    expect(fetchMock).toHaveBeenCalledWith("/v1/withdrawals", expect.objectContaining({ method: "POST" }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      asset: "USDA",
      amount: "5",
      dest_user_handle_party: "party-1",
      idempotency_key: "idempotency-1",
    });
  });

  it("reads the platform balance used for withdrawals", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ available: "0.4" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlatformAccountBalance("CC")).resolves.toBe(0.4);
    expect(fetchMock).toHaveBeenCalledWith("/v1/account/me/CC", {
      headers: { Authorization: "Bearer exchange-token" },
    });
  });

  it("maps USDA platform balances to the USDC backend account", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ available: "0.1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlatformAccountBalance("USDA")).resolves.toBe(0.1);
    expect(fetchMock).toHaveBeenCalledWith("/v1/account/me/USDC", {
      headers: { Authorization: "Bearer exchange-token" },
    });
  });

  it("reads the USDA futures account balance separately from spot", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ available: "8.5", spot_free: "1.25" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFundingAccountBalance()).resolves.toBe(8.5);
    expect(fetchMock).toHaveBeenCalledWith("/v1/account/me/USDC", {
      headers: { Authorization: "Bearer exchange-token" },
    });
  });

  it("loads all funding asset spot balances and preserves partial results", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const asset = String(url).split("/").pop();
      if (asset === "cETH") throw new Error("temporary network failure");
      return jsonResponse({ spot_free: asset === "USDC" ? "1" : asset === "CBTC" ? "0.1" : "2" });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlatformAccountBalances()).resolves.toEqual({
      USDA: 1,
      CBTC: 0.1,
      cETH: null,
      CC: 2,
    });
  });

  it("accepts camel-case and nested spot balance responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ spotFree: "0.000031" }))
      .mockResolvedValueOnce(jsonResponse({ data: { spot_free: "0.0001" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlatformAccountBalance("CBTC")).resolves.toBe(0.000031);
    await expect(fetchPlatformAccountBalance("cETH")).resolves.toBe(0.0001);
  });

  it("loads deposit and withdrawal history with exchange session auth", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      if (String(url) === "/v1/deposits") {
        return jsonResponse({
          deposits: [
            {
              deposit_id: "deposit-1",
              asset: "USDC",
              amount_expected: "0.2",
              status: "credited",
            },
          ],
        });
      }
      if (String(url) === "/v1/withdrawals") {
        return jsonResponse({
          withdrawals: [
            {
              withdrawal_id: "withdrawal-1",
              asset: "USDC",
              amount: "0.1",
              status: "settled",
              fee_amount: "1",
              fee_wallet_symbol: "USDA",
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCantonFundsHistory()).resolves.toEqual({
      deposits: [
        {
          deposit_id: "deposit-1",
          asset: "USDC",
          amount_expected: "0.2",
          status: "credited",
        },
      ],
      withdrawals: [
        {
          withdrawal_id: "withdrawal-1",
          asset: "USDC",
          amount: "0.1",
          status: "settled",
          fee_amount: "1",
          fee_wallet_symbol: "USDA",
        },
      ],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/v1/deposits", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/v1/withdrawals", expect.objectContaining({ method: "GET" }));
    expect(headerValue(fetchMock.mock.calls[0][1]?.headers, "Authorization")).toBe("Bearer exchange-token");
    expect(headerValue(fetchMock.mock.calls[1][1]?.headers, "Authorization")).toBe("Bearer exchange-token");
  });

  it("surfaces withdrawal API error messages from non-error fields", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ message: "Insufficient balance for this withdraw." }, 409)
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitPlatformWithdrawal({
        asset: "CC",
        amount: "5",
        destinationParty: "party-1",
        idempotencyKey: "idempotency-1",
      })
    ).rejects.toMatchObject({
      message: "Insufficient balance for this withdraw.",
      status: 409,
    });
  });

  it("uses a withdrawal-specific fallback for empty 409 responses", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response("", { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitPlatformWithdrawal({
        asset: "CC",
        amount: "5",
        destinationParty: "party-1",
        idempotencyKey: "idempotency-1",
      })
    ).rejects.toMatchObject({
      message: "Withdrawal could not be submitted. Check available platform balance and retry.",
      status: 409,
    });
  });

  it("requires an exchange session before funds actions", async () => {
    localStorage.removeItem("rocky_exchange_session");

    await expect(requestDepositReference({ asset: "CC", amount: "10" })).rejects.toBeInstanceOf(CantonFundsError);
    await expect(requestDepositReference({ asset: "CC", amount: "10" })).rejects.toMatchObject({
      code: "not_logged_in",
    });
  });

  it("reads and writes Rocky USDA auto-accept settings", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/v1/wallet/usda/auto-accept" && init?.method === "PUT") {
        return jsonResponse({ enabled: true });
      }
      return jsonResponse({ enabled: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUsdaAutoAccept()).resolves.toMatchObject({ enabled: false });
    await expect(setUsdaAutoAccept(true)).resolves.toMatchObject({ enabled: true });

    const putInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(putInit.method).toBe("PUT");
    expect(JSON.parse(putInit.body as string)).toEqual({ enabled: true });
  });

  it("does not try to list pending USDA offers for non-Console wallets", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPendingUsdaOffers({ provider: "rocky", party: "party-1" })).resolves.toEqual({
      offers: [],
      listingAvailable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createRockyWalletProvider() {
  return {
    isRockyWallet: true,
    version: "1.0.2",
    connect: vi.fn(async () => ({
      isConnected: true,
      account: {
        partyId: "party-1",
        displayName: "alice",
        networkId: "CANTON_NETWORK",
      },
    })),
    disconnect: vi.fn(async () => ({ status: true })),
    getPrimaryAccount: vi.fn(async () => ({
      partyId: "party-1",
      displayName: "alice",
      networkId: "CANTON_NETWORK",
    })),
    getActiveNetwork: vi.fn(async () => ({ id: "CANTON_NETWORK" })),
    getCoinsBalance: vi.fn(),
    signMessage: vi.fn(async () => "rocky-signature"),
    submitCommands: vi.fn(),
    getAssetCatalog: vi.fn(async () => [
      {
        asset_id: null,
        asset_type: "canton_coin" as const,
        symbol: "CC",
        name: "Canton Coin",
        display_alias: "CC",
        registry_name: null,
        decimals: 10,
        enabled: true,
        can_send: true,
        instrument_admin: null,
        instrument_id: null,
      },
      {
        asset_id: "usda-asset",
        asset_type: "token_standard" as const,
        symbol: "USDCx",
        name: "USDA",
        display_alias: "USDA",
        registry_name: null,
        decimals: 6,
        enabled: true,
        can_send: true,
        instrument_admin:
          "party-28dc4516-b5ca-44ff-86c7-2107e90a6807::1220b8301e18aa8a401d6e34e6c20f8b0243183c514373bca8f1b6b9270246341a9e",
        instrument_id: "3574b536-cad1-4074-9b64-859398713ba0",
      },
    ]),
    sendTransfer: vi.fn(async () => ({ status: true, transferId: "transfer-1" })),
    getNodeOffers: vi.fn(),
    submitInstructionChoice: vi.fn(),
  };
}

function headerValue(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) || undefined;
  if (Array.isArray(headers)) {
    const header = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return header?.[1];
  }
  const record = headers as Record<string, string>;
  return record[name] || record[name.toLowerCase()];
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

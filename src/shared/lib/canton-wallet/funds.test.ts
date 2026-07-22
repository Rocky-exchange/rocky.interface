import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CantonFundsError,
  fetchCantonFundsHistory,
  fetchPlatformAccountBalance,
  fetchPendingUsdaOffers,
  fetchUsdaAutoAccept,
  requestDepositReference,
  submitCantonWalletDeposit,
  setUsdaAutoAccept,
  submitPlatformWithdrawal,
} from "./funds";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createMemoryStorage());
  localStorage.setItem("rocky_exchange_session", "exchange-token");
});

describe("canton wallet funds", () => {
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
      from: "party-1",
      to: "target-party",
      token: "CC",
      amount: "1.5",
      expireDate: expect.any(String),
      memo: "dep-1",
      waitForFinalization: 5000,
    });
    expect(result.wallet_transfer).toBe("rocky_wallet_submitted");
    expect(result.platform_credit_status).toBe("confirmed");
    expect(result.platform_available).toBe("1.5");
  });

  it("renews stale Rocky exchange sessions before submitting wallet deposits", async () => {
    const provider = createRockyWalletProvider();
    window.rockyWallet = provider;
    localStorage.setItem("rocky_exchange_session", "stale-token");

    let refreshedBalanceReads = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = String(url);
      const auth = headerValue(init?.headers, "Authorization");

      if (requestUrl === "/v1/account/me/USDC") {
        if (auth === "Bearer stale-token") {
          return jsonResponse({ error: "invalid session" }, 401);
        }
        refreshedBalanceReads += 1;
        return jsonResponse({
          asset: "USDC",
          available: refreshedBalanceReads > 1 ? "0.2" : "0",
          locked: "0",
        });
      }

      if (requestUrl === "/v1/deposits/reference") {
        if (auth === "Bearer stale-token") {
          return jsonResponse({ error: "invalid session" }, 401);
        }
        return jsonResponse({
          asset: "USDC",
          target_party_id: "target-party",
          deposit_ref: "dep-2",
          reason_metadata_key: "splice.lfdecentralizedtrust.org/reason",
          expires_at: "2030-01-01T00:00:00Z",
        });
      }

      if (requestUrl === "/v1/wallet/challenge") {
        return jsonResponse({
          challenge_id: "challenge-1",
          message: "Rocky Exchange login challenge",
        });
      }

      if (requestUrl === "/v1/wallet/verify") {
        return jsonResponse({
          user_id: "user-1",
          binding_id: "binding-1",
          provider: "rocky",
          party_id: "party-1",
          session_token: "refreshed-token",
          expires_at: "2030-01-01T00:00:00Z",
        });
      }

      return jsonResponse({ error: "unexpected" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitCantonWalletDeposit({
      provider: "rocky",
      walletParty: "party-1",
      asset: "USDA",
      amount: "0.2",
    });

    const depositReferenceCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/v1/deposits/reference");
    expect(depositReferenceCalls).toHaveLength(2);
    expect(headerValue(depositReferenceCalls[0][1]?.headers, "Authorization")).toBe("Bearer stale-token");
    expect(headerValue(depositReferenceCalls[1][1]?.headers, "Authorization")).toBe("Bearer refreshed-token");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/v1/account/me/USDC",
      "/v1/deposits/reference",
      "/v1/wallet/challenge",
      "/v1/wallet/verify",
      "/v1/deposits/reference",
      "/v1/account/me/USDC",
      "/v1/account/me/USDC",
    ]);
    expect(provider.connect).toHaveBeenCalledWith({
      name: "Rocky Exchange",
      target: "local",
    });
    expect(provider.signMessage).toHaveBeenCalled();
    expect(provider.sendTransfer).toHaveBeenCalledWith({
      from: "party-1",
      to: "target-party",
      token: "USDA",
      amount: "0.2",
      expireDate: expect.any(String),
      memo: "dep-2",
      waitForFinalization: 5000,
    });
    expect(localStorage.getItem("rocky_exchange_session")).toBe("refreshed-token");
    expect(result.wallet_transfer).toBe("rocky_wallet_submitted");
    expect(result.platform_credit_status).toBe("confirmed");
    expect(result.platform_available).toBe("0.2");
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
    version: "0.1.0",
    connect: vi.fn(async () => ({
      isConnected: true,
      account: {
        partyId: "party-1",
        displayName: "alice",
        networkId: "CANTON_NETWORK",
      },
    })),
    getPrimaryAccount: vi.fn(async () => ({
      partyId: "party-1",
      displayName: "alice",
      networkId: "CANTON_NETWORK",
    })),
    getActiveNetwork: vi.fn(async () => ({ id: "CANTON_NETWORK" })),
    getCoinsBalance: vi.fn(),
    signMessage: vi.fn(async () => "rocky-signature"),
    submitCommands: vi.fn(),
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

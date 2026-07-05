import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CantonFundsError,
  fetchPlatformAccountBalance,
  fetchPendingUsdcxOffers,
  fetchUsdcxAutoAccept,
  requestDepositReference,
  submitCantonWalletDeposit,
  setUsdcxAutoAccept,
  submitPlatformWithdrawal,
} from "./funds";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createMemoryStorage());
  localStorage.setItem("rocky_exchange_session", "exchange-token");
});

describe("canton wallet funds", () => {
  it("requests a USDCx deposit reference with exchange session auth", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        asset: "USDC",
        target_party_id: "target-party",
        deposit_ref: "dep-1",
        reason_metadata_key: "splice.lfdecentralizedtrust.org/reason",
        expires_at: "2030-01-01T00:00:00Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const reference = await requestDepositReference({ asset: "USDCx", amount: "12.50" });

    expect(reference.deposit_ref).toBe("dep-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/deposits/reference",
      expect.objectContaining({ method: "POST" }),
    );
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

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/deposits/reference",
      expect.objectContaining({ method: "POST" }),
    );
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

  it("submits withdrawals to the connected wallet party", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        withdrawal_id: "wid-1",
        status: "submitted",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitPlatformWithdrawal({
      asset: "USDCx",
      amount: "5",
      destinationParty: " party-1 ",
      idempotencyKey: "idempotency-1",
    });

    expect(result.withdrawal_id).toBe("wid-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/withdrawals",
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      asset: "USDCx",
      amount: "5",
      dest_user_handle_party: "party-1",
      idempotency_key: "idempotency-1",
    });
  });

  it("reads the platform balance used for withdrawals", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ available: "0.4" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlatformAccountBalance("CC")).resolves.toBe(0.4);
    expect(fetchMock).toHaveBeenCalledWith("/v1/account/me/CC", {
      headers: { Authorization: "Bearer exchange-token" },
    });
  });

  it("maps USDCx platform balances to the USDC backend account", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ available: "0.1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlatformAccountBalance("USDCx")).resolves.toBe(0.1);
    expect(fetchMock).toHaveBeenCalledWith("/v1/account/me/USDC", {
      headers: { Authorization: "Bearer exchange-token" },
    });
  });

  it("surfaces withdrawal API error messages from non-error fields", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ message: "Insufficient balance for this withdraw." }, 409),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitPlatformWithdrawal({
        asset: "CC",
        amount: "5",
        destinationParty: "party-1",
        idempotencyKey: "idempotency-1",
      }),
    ).rejects.toMatchObject({
      message: "Insufficient balance for this withdraw.",
      status: 409,
    });
  });

  it("uses a withdrawal-specific fallback for empty 409 responses", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response("", { status: 409 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitPlatformWithdrawal({
        asset: "CC",
        amount: "5",
        destinationParty: "party-1",
        idempotencyKey: "idempotency-1",
      }),
    ).rejects.toMatchObject({
      message: "Withdrawal could not be submitted. Check available platform balance and retry.",
      status: 409,
    });
  });

  it("requires an exchange session before funds actions", async () => {
    localStorage.removeItem("rocky_exchange_session");

    await expect(requestDepositReference({ asset: "CC", amount: "10" })).rejects.toBeInstanceOf(
      CantonFundsError,
    );
    await expect(requestDepositReference({ asset: "CC", amount: "10" })).rejects.toMatchObject({
      code: "not_logged_in",
    });
  });

  it("reads and writes Rocky USDCx auto-accept settings", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/v1/wallet/usdcx/auto-accept" && init?.method === "PUT") {
        return jsonResponse({ enabled: true });
      }
      return jsonResponse({ enabled: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUsdcxAutoAccept()).resolves.toMatchObject({ enabled: false });
    await expect(setUsdcxAutoAccept(true)).resolves.toMatchObject({ enabled: true });

    const putInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(putInit.method).toBe("PUT");
    expect(JSON.parse(putInit.body as string)).toEqual({ enabled: true });
  });

  it("does not try to list pending USDCx offers for non-Console wallets", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPendingUsdcxOffers({ provider: "rocky", party: "party-1" })).resolves.toEqual({
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
    getPrimaryAccount: vi.fn(async () => ({
      partyId: "party-1",
      displayName: "alice",
      networkId: "CANTON_NETWORK",
    })),
    getActiveNetwork: vi.fn(async () => ({ id: "CANTON_NETWORK" })),
    getCoinsBalance: vi.fn(),
    signMessage: vi.fn(),
    submitCommands: vi.fn(),
    sendTransfer: vi.fn(async () => ({ status: true, transferId: "transfer-1" })),
    getNodeOffers: vi.fn(),
    submitInstructionChoice: vi.fn(),
  };
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

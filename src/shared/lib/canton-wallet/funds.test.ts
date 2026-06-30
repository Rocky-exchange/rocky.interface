import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CantonFundsError,
  fetchPendingUsdcxOffers,
  fetchUsdcxAutoAccept,
  requestDepositReference,
  requestRockyWalletPreapproval,
  setUsdcxAutoAccept,
  submitPlatformWithdrawal,
  submitRockyWalletDeposit,
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
      "/api/deposits/reference",
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

  it("surfaces Rocky Wallet authorization-required deposits as a typed error", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ error: "rocky_wallet_authorization_required" }, 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitRockyWalletDeposit({ asset: "CC", amount: "1" })).rejects.toMatchObject({
      name: "CantonFundsError",
      status: 401,
      code: "rocky_wallet_authorization_required",
    });
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
      "/api/withdrawals",
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

  it("requests a Rocky Wallet preapproval authorization URL", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        authorize_url: "https://wallet.example/authorize",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestRockyWalletPreapproval({ returnTo: "/trade?market=BTC" })).resolves.toBe(
      "https://wallet.example/authorize",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ return_to: "/trade?market=BTC" });
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
      if (String(url) === "/api/wallet/usdcx/auto-accept" && init?.method === "PUT") {
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

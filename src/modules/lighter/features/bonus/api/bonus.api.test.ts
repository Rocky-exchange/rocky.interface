import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  BonusApiError,
  checkBonusOrder,
  fetchBonusBalanceInfo,
  fetchBonusHistory,
  fetchBonusStatus,
  recallBonusForWithdraw,
  redeemBonusCode,
} from "./bonus.api";
import type {
  BonusBalanceInfoResponse,
  BonusHistoryResponse,
  BonusHistoryRow,
  BonusLifecycleStatus,
  BonusOrderDecision,
  BonusStatusResponse,
} from "./bonus.types";

const fetchMock = vi.fn();

describe("bonus API", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the canonical status URL and Rocky exchange session", async () => {
    localStorage.setItem("rocky_exchange_session", "session-1");
    const responseBody = {
      has_bonus: false,
      bonus_account_id: "",
      status: "",
      grant_tier: "",
      bonus_initial: "",
      bonus_balance: "",
      bonus_locked_in_margin: "",
      bonus_consumed_total: "",
      bonus_recalled_total: "",
      max_leverage: 0,
      granted_at: "",
      expires_at: "",
    };
    fetchMock.mockResolvedValue(jsonResponse(responseBody));

    const result = await fetchBonusStatus();

    expect(result).toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/bonus/status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer session-1" }),
      })
    );
  });

  it("models every success response field required by the wire contract", () => {
    expectTypeOf<BonusStatusResponse>().toEqualTypeOf<{
      has_bonus: boolean;
      bonus_account_id: string;
      status: BonusLifecycleStatus | "";
      grant_tier: string;
      bonus_initial: string;
      bonus_balance: string;
      bonus_locked_in_margin: string;
      bonus_consumed_total: string;
      bonus_recalled_total: string;
      max_leverage: number;
      granted_at: string;
      expires_at: string;
    }>();
    expectTypeOf<BonusBalanceInfoResponse>().toEqualTypeOf<{
      total_available: string;
      available: string;
      locked: string;
      principal_free: string;
      principal_locked: string;
      bonus_free: string;
      bonus_locked: string;
      effective_withdrawable: string;
      status: BonusLifecycleStatus | "";
    }>();
    expectTypeOf<BonusHistoryRow>().toEqualTypeOf<{
      id: string;
      event_type: string;
      total_cost: string;
      bonus_share: string;
      principal_share: string;
      attribution_rule: string;
      source_trade_id: string;
      source_funding_id: string;
      occurred_at: string;
    }>();
    expectTypeOf<BonusHistoryResponse>().toEqualTypeOf<{
      rows: BonusHistoryRow[];
      next_cursor: string;
    }>();
    expectTypeOf<BonusOrderDecision>().toEqualTypeOf<{
      decision: "pass" | "reject";
      reason_code: string;
      message: string;
      bonus_balance: string;
      total_available: string;
      bonus_ratio_pct: string;
      net_direction: string;
    }>();
  });

  it("requests balance info from the canonical authenticated endpoint", async () => {
    localStorage.setItem("rocky_exchange_session", "session-1");
    fetchMock.mockResolvedValue(
      jsonResponse({
        total_available: "125.5",
        available: "100.5",
        locked: "25",
        principal_free: "60.5",
        principal_locked: "15",
        bonus_free: "40",
        bonus_locked: "10",
        effective_withdrawable: "60.5",
        status: "active",
      })
    );

    await fetchBonusBalanceInfo();

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/bonus/balance-info",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer session-1" }),
      })
    );
  });

  it("URL-encodes the history cursor", async () => {
    localStorage.setItem("rocky_exchange_session", "session-1");
    fetchMock.mockResolvedValue(jsonResponse({ rows: [], next_cursor: "" }));

    await fetchBonusHistory({ limit: 20, before: "cursor/one" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/bonus/history?limit=20&before=cursor%2Fone",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("sends the complete check-order body with a lowercase side", async () => {
    localStorage.setItem("rocky_exchange_session", "session-1");
    fetchMock.mockResolvedValue(
      jsonResponse({
        decision: "pass",
        reason_code: "",
        message: "",
        bonus_balance: "50",
        total_available: "100",
        bonus_ratio_pct: "50",
        net_direction: "long",
      })
    );

    await checkBonusOrder({
      symbol: "BTC-PERP",
      side: "BUY",
      is_opening: true,
      leverage: 5,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/bonus/check-order",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          symbol: "BTC-PERP",
          side: "buy",
          is_opening: true,
          leverage: 5,
        }),
      })
    );
  });

  it("normalizes the redeem code and preserves the request ID", async () => {
    localStorage.setItem("rocky_exchange_session", "session-1");
    fetchMock.mockResolvedValue(
      jsonResponse({
        bonus_account_id: "bonus-1",
        amount: "100",
        granted_at: "2026-07-22T00:00:00Z",
        expires_at: "2026-07-29T00:00:00Z",
        replayed: false,
      })
    );

    await redeemBonusCode({ code: "  launch-1  ", request_id: "redeem-request-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/bonus/redeem-code",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "LAUNCH-1", request_id: "redeem-request-1" }),
      })
    );
  });

  it("sends only the recall request ID", async () => {
    localStorage.setItem("rocky_exchange_session", "session-1");
    fetchMock.mockResolvedValue(
      jsonResponse({
        recalled_amount: "12.5",
        bonus_balance_after: "10",
        bonus_locked_after: "10",
        effective_withdrawable: "50",
        replayed: false,
      })
    );

    await recallBonusForWithdraw({ request_id: "recall-request-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/bonus/recall-for-withdraw",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ request_id: "recall-request-1" }),
      })
    );
  });

  it("maps a structured 409 response to BonusApiError", async () => {
    localStorage.setItem("rocky_exchange_session", "session-1");
    const responseBody = {
      error: "code_not_redeemable",
      message: "The code is unavailable, expired, used, or assigned to another user.",
    };
    fetchMock.mockResolvedValue(jsonResponse(responseBody, 409));

    const error = await redeemBonusCode({ code: "TAKEN", request_id: "redeem-request-2" }).catch((reason) => reason);

    expect(error).toBeInstanceOf(BonusApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "code_not_redeemable",
      message: "The code is unavailable, expired, used, or assigned to another user.",
      data: responseBody,
    });
  });

  it("uses one safe error for empty and non-JSON 503 responses", async () => {
    localStorage.setItem("rocky_exchange_session", "session-1");
    const rawResponseText = "upstream database at db.internal:5432 is unavailable";
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(
      new Response(rawResponseText, {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );

    const emptyResponseError = await fetchBonusStatus().catch((reason) => reason);
    const nonJsonResponseError = await fetchBonusStatus().catch((reason) => reason);

    for (const error of [emptyResponseError, nonJsonResponseError]) {
      expect(error).toBeInstanceOf(BonusApiError);
      expect(error).toMatchObject({
        status: 503,
        code: "bonus_request_failed",
        message: "Bonus request failed",
        data: {},
      });
      expect(JSON.stringify(error)).not.toContain(rawResponseText);
      expect(error.message).not.toContain(rawResponseText);
    }
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

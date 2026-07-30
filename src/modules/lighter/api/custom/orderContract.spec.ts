import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateOrderRequest } from "../types";
import { cancelOrder, closePosition, createOrder, getAccountTrades, getOrders, getPositions } from "./client";

const UNIT_18 = 10n ** 18n;
const UNIT_30 = 10n ** 30n;
const store = new Map<string, string>();
let orderSubmit: typeof import("./usePrimitOrderSubmit");

function buildRequest(overrides: Record<string, unknown> = {}): CreateOrderRequest {
  const buildCreateOrderRequest = (
    orderSubmit as unknown as {
      buildCreateOrderRequest: (params: Record<string, unknown>) => { request: CreateOrderRequest };
    }
  ).buildCreateOrderRequest;

  return buildCreateOrderRequest({
    symbol: "BTC-USD",
    isLong: true,
    isIncrease: true,
    sizeDeltaUsd: (125n * UNIT_18) / 100n,
    indexTokenDecimals: 18,
    triggerPrice: 100n * UNIT_30,
    orderType: 1,
    apiOrderTypeOverride: "limit",
    leverage: 10,
    clientOrderId: "client-42",
    ...overrides,
  }).request;
}

describe("Rocky order request contract", () => {
  beforeAll(async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    });
    orderSubmit = await import("./usePrimitOrderSubmit");
  });

  afterAll(() => {
    store.clear();
  });

  beforeEach(() => {
    localStorage.setItem("rocky_exchange_session", "test-exchange-session");
    localStorage.setItem("mtc_token", "legacy-mtc-session");
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    [true, "BUY"],
    [false, "SELL"],
  ])("builds the exact native LIMIT body for isLong=%s", (isLong, side) => {
    expect(buildRequest({ isLong })).toEqual({
      symbol: "BTC-PERP",
      side,
      price: "100.000000",
      qty: "1.25000000",
      leverage: 10,
      idempotency_key: "client-42",
    });
  });

  it.each(["BTC-USD", "BTC-USDT", "BTC-USDC", "BTC-CUSD", "BTC-PERP"])(
    "normalizes %s to the Rocky-native perpetual symbol",
    (symbol) => {
      expect(buildRequest({ symbol }).symbol).toBe("BTC-PERP");
    }
  );

  it.each([
    [true, undefined, "100.500000"],
    [false, undefined, "99.500000"],
    [true, "0.01", "101.000000"],
    [false, "0.01", "99.000000"],
  ])("crosses MARKET price for isLong=%s and maxSlippage=%s", (isLong, maxSlippage, expectedPrice) => {
    expect(
      buildRequest({
        isLong,
        apiOrderTypeOverride: "market",
        orderType: 0,
        triggerPrice: undefined,
        acceptablePrice: 100n * UNIT_30,
        maxSlippage,
      })
    ).toEqual({
      symbol: "BTC-PERP",
      side: isLong ? "BUY" : "SELL",
      price: expectedPrice,
      qty: "1.25000000",
      leverage: 10,
      idempotency_key: "client-42",
    });
  });

  it.each([undefined, 0n, -1n])(
    "rejects MARKET reference price %s before making a network request",
    (acceptablePrice) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      expect(() => {
        const request = buildRequest({
          apiOrderTypeOverride: "market",
          orderType: 0,
          triggerPrice: undefined,
          acceptablePrice,
        });
        void createOrder(1, request, "party-1");
      }).toThrow(/reference price/i);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("uses the custom client id, otherwise generates a unique non-empty id per logical submit", () => {
    expect(buildRequest().idempotency_key).toBe("client-42");

    const first = buildRequest({ clientOrderId: undefined }).idempotency_key;
    const second = buildRequest({ clientOrderId: undefined }).idempotency_key;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  it("does not leak reduce-only or any other legacy fields into the native request", () => {
    expect(buildRequest({ reduceOnly: true })).toEqual({
      symbol: "BTC-PERP",
      side: "BUY",
      price: "100.000000",
      qty: "1.25000000",
      leverage: 10,
      idempotency_key: "client-42",
    });
  });

  it("sends only native fields and normalizes Rocky's sparse response", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ order_id: "order-7" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = buildRequest();

    await expect(createOrder(1, request, "party-1")).resolves.toMatchObject({
      order_id: "order-7",
      status: "open",
      filled_amount: "0",
      remaining_amount: "1.25000000",
      average_price: null,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      symbol: "BTC-PERP",
      side: "BUY",
      price: "100.000000",
      qty: "1.25000000",
      leverage: 10,
      idempotency_key: "client-42",
    });
  });

  it("uses only the exchange session when a scoped legacy JWT also exists", async () => {
    localStorage.setItem("primit_jwt_token_1_party-1", "legacy-user-token");
    localStorage.setItem("primit_jwt_expiry_1_party-1", String(Math.floor(Date.now() / 1000) + 3600));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ order_id: "exchange-order" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await createOrder(1, buildRequest(), "party-1");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-exchange-session");
  });

  it("does not let an invalid legacy MTC token override the exchange session", async () => {
    localStorage.setItem("mtc_token", "invalid-legacy-token");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ order_id: "exchange-order" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await createOrder(1, buildRequest(), "party-1");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-exchange-session");
  });

  it("keeps cancel, close, order, and position requests on the exchange session", async () => {
    localStorage.setItem("primit_jwt_token_1_party-1", "legacy-user-token");
    localStorage.setItem("primit_jwt_expiry_1_party-1", String(Math.floor(Date.now() / 1000) + 3600));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = new URL(String(input), "https://rocky.test").pathname;
      if (path === "/v1/orders/order-1") return jsonResponse({ order_id: "order-1", status: "cancelled" });
      if (path === "/v1/orders") return jsonResponse({ order_id: "close-1" });
      if (path === "/v1/orders/me") return jsonResponse({ orders: [] });
      if (path === "/v1/positions/me") {
        return jsonResponse({ positions: [], total_unrealized_pnl: "0", total_collateral: "0" });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await cancelOrder(1, "order-1", { signature: "canton-session", timestamp: 1 }, "party-1");
    await closePosition(
      1,
      "position-1",
      { symbol: "BTC-PERP", side: "long", qty: "0.5", markPrice: "100", leverage: 20 },
      "party-1"
    );
    await getOrders(1, "party-1");
    await getPositions(1, "party-1");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-exchange-session");
    }
  });

  it("normalizes Rocky's native array responses for positions, trades, and orders", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "https://rocky.test").pathname;
      if (path === "/v1/positions/me") {
        return jsonResponse([
          {
            user_id: "user-1",
            symbol: "BTC-PERP",
            qty: "0.00060709",
            entry_price: "63239.61",
            locked_margin: "3.83921348349",
            realized_pnl: "0",
          },
        ]);
      }
      if (path === "/v1/trades/me") {
        return jsonResponse([
          {
            trade_id: "trade-1",
            user_id: "user-1",
            symbol: "BTC-PERP",
            side: "BUY",
            price: "63239.61",
            qty: "0.00060709",
            fee: "0.01919606741745",
            ts: "2026-07-28T03:15:07.432264Z",
          },
        ]);
      }
      if (path === "/v1/orders/me") return jsonResponse([]);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const positions = await getPositions(1, "party-1");
    const trades = await getAccountTrades(1, "party-1");
    const orders = await getOrders(1, "party-1");

    expect(positions.positions).toEqual([
      expect.objectContaining({
        position_id: "user-1:BTC-PERP",
        symbol: "BTC-PERP",
        side: "long",
        amount: "0.00060709",
        collateral_amount: "3.83921348349",
      }),
    ]);
    expect(trades.trades).toEqual([
      expect.objectContaining({
        id: "trade-1",
        side: "buy",
        amount: "0.00060709",
        timestamp: "2026-07-28T03:15:07.432264Z",
      }),
    ]);
    expect(orders).toEqual({ orders: [] });
  });

  it("calculates live unrealized PnL for a native short position", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), "https://rocky.test").pathname;
      if (path === "/v1/positions/me") {
        return jsonResponse([
          {
            user_id: "user-short",
            symbol: "BTC-PERP",
            qty: "-0.0001",
            entry_price: "64376.83",
            locked_margin: "0.50",
            realized_pnl: "0",
          },
        ]);
      }
      if (path === "/v1/markets/BTC-PERP/ticker") {
        return jsonResponse({
          symbol: "BTC-PERP",
          last_price: "64473.30",
          mark_price: "64473.30",
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getPositions(1, "party-1");

    expect(response.positions).toEqual([
      expect.objectContaining({
        side: "short",
        entry_price: "64376.83",
        mark_price: "64473.30",
        unrealized_pnl: "-0.009647",
        unrealized_pnl_percent: "-0.019294",
      }),
    ]);
  });

  it("fails safely before fetch when the exchange session is missing", async () => {
    localStorage.removeItem("rocky_exchange_session");
    localStorage.setItem("primit_jwt_token_1_party-1", "legacy-user-token");
    localStorage.setItem("primit_jwt_expiry_1_party-1", String(Math.floor(Date.now() / 1000) + 3600));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(createOrder(1, buildRequest(), "party-1")).rejects.toThrow(/Canton wallet session required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps one generated idempotency key through the same network call", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ order_id: "order-generated" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = buildRequest({ clientOrderId: undefined });
    const generatedKey = request.idempotency_key;

    await createOrder(1, request, "party-1");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body)).idempotency_key).toBe(generatedKey);
  });

  it("submits close-position through the same exact native transport", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ order_id: "close-1" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await closePosition(
      1,
      "position-1",
      { symbol: "BTC-PERP", side: "long", qty: "0.5", markPrice: "100", leverage: 20 },
      "party-1"
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      symbol: "BTC-PERP",
      side: "SELL",
      price: "99.50000000",
      qty: "0.5",
      leverage: 20,
      idempotency_key: expect.any(String),
    });
    expect(body.idempotency_key).not.toBe("");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

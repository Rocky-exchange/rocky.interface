import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateOrderRequest } from "../types";
import { closePosition, createOrder } from "./client";

const UNIT_18 = 10n ** 18n;
const UNIT_30 = 10n ** 30n;
const store = new Map<string, string>();
const sessionStore = new Map<string, string>();
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
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => sessionStore.get(key) ?? null,
        setItem: (key: string, value: string) => sessionStore.set(key, value),
        removeItem: (key: string) => sessionStore.delete(key),
        clear: () => sessionStore.clear(),
      },
    });
    orderSubmit = await import("./usePrimitOrderSubmit");
  });

  afterAll(() => {
    store.clear();
  });

  beforeEach(() => {
    localStorage.setItem("mtc_token", "test-session");
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

  it("uses the custom client id without replacing it", () => {
    expect(buildRequest().idempotency_key).toBe("client-42");
  });

  it("reuses one generated id for the same pending intent and separates different payloads", () => {
    const first = buildRequest({ clientOrderId: undefined, triggerPrice: 101n * UNIT_30 }).idempotency_key;
    const retry = buildRequest({ clientOrderId: undefined, triggerPrice: 101n * UNIT_30 }).idempotency_key;
    const different = buildRequest({ clientOrderId: undefined, triggerPrice: 102n * UNIT_30 }).idempotency_key;

    expect(first).toBeTruthy();
    expect(retry).toBe(first);
    expect(different).not.toBe(first);
  });

  it.each([{ reduceOnly: true }, { closePosition: true }])(
    "rejects unsupported closing option %j before fetch",
    (option) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      expect(() => buildRequest(option)).toThrow(/Close Position/i);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([{ tpPrice: "110" }, { slPrice: "90" }, { tpPrice: "110", slPrice: "90" }])(
    "rejects unsupported attached protection %j before fetch",
    (option) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      expect(() => buildRequest(option)).toThrow(/attached Take Profit.*Stop Loss/i);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["BTC-PERP", "BTC-PERP"],
    ["BTCUSDT", "BTC-PERP"],
    ["BTC-USD", "BTC-PERP"],
    ["BTCUSD", "BTC-PERP"],
  ])("normalizes %s to the idempotent Rocky symbol %s", (symbol, expected) => {
    expect(buildRequest({ symbol }).symbol).toBe(expected);
  });

  it.each(["1", "1.1", "0", "-0.1", "not-a-number"])(
    "rejects unsafe maxSlippage %s without producing a SELL price of zero",
    (maxSlippage) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      expect(() =>
        buildRequest({
          isLong: false,
          apiOrderTypeOverride: "market",
          orderType: 0,
          triggerPrice: undefined,
          acceptablePrice: 100n * UNIT_30,
          maxSlippage,
        })
      ).toThrow(/maxSlippage/i);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("reuses the id after an ambiguous network failure, then clears it after success", async () => {
    const firstRequest = buildRequest({ clientOrderId: undefined, triggerPrice: 103n * UNIT_30 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("connection reset")));

    await expect(createOrder(1, firstRequest, "party-1")).rejects.toThrow("connection reset");
    const retryRequest = buildRequest({ clientOrderId: undefined, triggerPrice: 103n * UNIT_30 });
    expect(retryRequest.idempotency_key).toBe(firstRequest.idempotency_key);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ order_id: "retry-ok" }))
    );
    await createOrder(1, retryRequest, "party-1");
    const nextIntent = buildRequest({ clientOrderId: undefined, triggerPrice: 103n * UNIT_30 });
    expect(nextIntent.idempotency_key).not.toBe(firstRequest.idempotency_key);
  });

  it("reuses the id after a 5xx but clears it after an explicit 4xx", async () => {
    const serverFailureRequest = buildRequest({ clientOrderId: undefined, triggerPrice: 104n * UNIT_30 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "temporarily unavailable" }, 503))
    );
    await expect(createOrder(1, serverFailureRequest, "party-1")).rejects.toThrow();
    expect(buildRequest({ clientOrderId: undefined, triggerPrice: 104n * UNIT_30 }).idempotency_key).toBe(
      serverFailureRequest.idempotency_key
    );

    const clientFailureRequest = buildRequest({ clientOrderId: undefined, triggerPrice: 105n * UNIT_30 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "bad order" }, 400))
    );
    await expect(createOrder(1, clientFailureRequest, "party-1")).rejects.toThrow();
    expect(buildRequest({ clientOrderId: undefined, triggerPrice: 105n * UNIT_30 }).idempotency_key).not.toBe(
      clientFailureRequest.idempotency_key
    );
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

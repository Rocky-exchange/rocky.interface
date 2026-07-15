/**
 * spotClient: HMAC signing + fetch wire-shape unit tests.
 *
 * We stub global.fetch and Web Crypto (happy-dom's crypto.subtle works
 * out-of-the-box) so tests never hit the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FetchArgs = { url: string; init?: RequestInit };

function stubFetch(handler: (args: FetchArgs) => { status?: number; body: unknown }) {
  const calls: FetchArgs[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status = 200, body } = handler({ url, init });
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve({
      ok: status < 300,
      status,
      text: async () => payload,
      json: async () => (typeof body === "string" ? JSON.parse(payload) : body),
    } as unknown as Response);
  });
  return calls;
}

/**
 * The API_KEY/API_SECRET consts are read at module import time. To flip
 * them per-test, we must reset the module cache + re-import fresh.
 */
async function importFreshApi() {
  vi.resetModules();
  return await import("./spotClient");
}

describe("SPOT_MARKETS", () => {
  it("has exactly the v1 spot pairs — matches rocky-backend seed", async () => {
    const { SPOT_MARKETS } = await importFreshApi();
    expect(SPOT_MARKETS.map((m) => m.symbol)).toEqual(["CBTC-USDCX", "CETH-USDCX"]);
  });
});

describe("spotApi.depth (public)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SPOT_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /api/v3/depth with symbol + limit, no auth header", async () => {
    const calls = stubFetch(() => ({
      body: { lastUpdateId: 1, bids: [["500", "1"]], asks: [["501", "1"]] },
    }));
    const { spotApi } = await importFreshApi();
    const r = await spotApi.depth("CBTC-USDCX", 5);
    expect(r.bids).toEqual([["500", "1"]]);
    expect(calls[0].url).toBe("/api/v3/depth?symbol=CBTC-USDCX&limit=5");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers?.["X-MBX-APIKEY"]).toBeUndefined();
  });

  it("URL-encodes symbol", async () => {
    const calls = stubFetch(() => ({ body: { lastUpdateId: 1, bids: [], asks: [] } }));
    const { spotApi } = await importFreshApi();
    await spotApi.depth("CBTC/USDCX", 5);
    expect(calls[0].url).toContain("CBTC%2FUSDCX");
  });
});

describe("spotApi error handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws SpotApiError with Binance-shape code+msg", async () => {
    stubFetch(() => ({ status: 400, body: { code: -2010, msg: "insufficient balance" } }));
    const { spotApi } = await importFreshApi();
    await expect(spotApi.depth("CBTC-USDCX")).rejects.toMatchObject({
      code: -2010,
      // SpotApiError stores msg as the Error.message (via super()).
      message: "insufficient balance",
      name: "SpotApiError",
    });
  });

  it("wraps opaque HTTP errors into SpotApiError with status code fallback", async () => {
    stubFetch(() => ({ status: 502, body: "Bad Gateway" }));
    const { spotApi, SpotApiError } = await importFreshApi();
    await expect(spotApi.depth("CBTC-USDCX")).rejects.toBeInstanceOf(SpotApiError);
  });
});

describe("spotApi.trades / klines / ticker (public)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trades passes limit param", async () => {
    const calls = stubFetch(() => ({ body: [] }));
    const { spotApi } = await importFreshApi();
    await spotApi.trades("CBTC-USDCX", 30);
    expect(calls[0].url).toBe("/api/v3/trades?symbol=CBTC-USDCX&limit=30");
  });

  it("klines passes interval + limit", async () => {
    const calls = stubFetch(() => ({ body: [] }));
    const { spotApi } = await importFreshApi();
    await spotApi.klines("CETH-USDCX", "5m", 100);
    expect(calls[0].url).toBe("/api/v3/klines?symbol=CETH-USDCX&interval=5m&limit=100");
  });

  it("ticker uses /api/v3/ticker/24hr", async () => {
    const calls = stubFetch(() => ({
      body: { symbol: "CBTC-USDCX", lastPrice: "500", priceChangePercent: "0.5" },
    }));
    const { spotApi } = await importFreshApi();
    const t = await spotApi.ticker("CBTC-USDCX");
    expect(t.lastPrice).toBe("500");
    expect(calls[0].url).toBe("/api/v3/ticker/24hr?symbol=CBTC-USDCX");
  });
});

describe("spotApi signed endpoints", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SPOT_API_KEY", "alice_key");
    vi.stubEnv("VITE_SPOT_API_SECRET", "alice_secret_shhh");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("account: signed GET carries X-MBX-APIKEY + timestamp + signature", async () => {
    const calls = stubFetch(() => ({
      body: {
        accountType: "SPOT",
        canTrade: true,
        canWithdraw: false,
        canDeposit: false,
        updateTime: 0,
        balances: [{ asset: "USDCx", free: "10000", locked: "0" }],
        permissions: ["SPOT"],
      },
    }));
    const { spotApi } = await importFreshApi();
    const acct = await spotApi.account();
    expect(acct.accountType).toBe("SPOT");
    const url = calls[0].url;
    expect(url).toMatch(/^\/api\/v3\/account\?/);
    expect(url).toMatch(/timestamp=\d+/);
    expect(url).toMatch(/recvWindow=/);
    expect(url).toMatch(/signature=[0-9a-f]{64}/);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["X-MBX-APIKEY"]).toBe("alice_key");
  });

  it("placeOrder: POST /api/v3/order with body-shape params", async () => {
    const calls = stubFetch(() => ({
      body: { orderId: "abc", status: "NEW", symbol: "CBTC-USDCX" },
    }));
    const { spotApi } = await importFreshApi();
    await spotApi.placeOrder({
      symbol: "CBTC-USDCX",
      side: "BUY",
      type: "LIMIT",
      price: "500",
      quantity: "0.001",
    });
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].url).toContain("symbol=CBTC-USDCX");
    expect(calls[0].url).toContain("side=BUY");
    expect(calls[0].url).toContain("type=LIMIT");
    expect(calls[0].url).toContain("price=500");
    expect(calls[0].url).toContain("quantity=0.001");
  });

  it("cancelOrder: DELETE /api/v3/order", async () => {
    const calls = stubFetch(() => ({ body: { status: "CANCELED" } }));
    const { spotApi } = await importFreshApi();
    await spotApi.cancelOrder("CBTC-USDCX", "42");
    expect(calls[0].init?.method).toBe("DELETE");
    expect(calls[0].url).toContain("symbol=CBTC-USDCX");
    expect(calls[0].url).toContain("orderId=42");
  });

  it("openOrders: GET /api/v3/openOrders", async () => {
    const calls = stubFetch(() => ({ body: [] }));
    const { spotApi } = await importFreshApi();
    await spotApi.openOrders("CBTC-USDCX");
    expect(calls[0].url).toMatch(/^\/api\/v3\/openOrders\?/);
    expect(calls[0].url).toContain("symbol=CBTC-USDCX");
  });

  it("throws -401 SpotApiError when no session credentials are set", async () => {
    // No env fallback + no setSpotCredentials call → signedRequest must reject
    // with a wallet-connect hint rather than firing an unsigned HTTP call.
    vi.stubEnv("VITE_SPOT_API_KEY", "");
    vi.stubEnv("VITE_SPOT_API_SECRET", "");
    const { spotApi: freshApi, SpotApiError: FreshErr } = await importFreshApi();
    await expect(freshApi.account()).rejects.toBeInstanceOf(FreshErr);
    await expect(freshApi.account()).rejects.toMatchObject({ code: -401 });
  });
});

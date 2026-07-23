import { afterEach, describe, expect, it, vi } from "vitest";

import { getMarkets, getOrderbook, getTicker } from "./client";

describe("market data requests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shares an in-flight ticker request for the same market", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        symbol: "BTC-PERP",
        last_price: "62000",
        price_change_pct_24h: "0",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([getTicker(1, "BTC-USD"), getTicker(1, "BTC-USD")]);

    expect(first.last_price).toBe("62000");
    expect(second.last_price).toBe("62000");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("attaches a timeout abort signal to orderbook polling requests", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal as AbortSignal | undefined;
      if (!observedSignal) {
        return Promise.resolve(jsonResponse({ bids: [], asks: [] }));
      }
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = getOrderbook(1, "BTC-USD").catch((err) => err);
    await Promise.resolve();

    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(request).resolves.toMatchObject({ name: "AbortError" });
  });

  it("keeps the backend tick size on normalized markets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            symbol: "PEPE-PERP",
            base: "PEPE",
            quote: "USDA",
            tick_size: "0.00000001",
            min_qty: "1",
          },
        ])
      )
    );

    const result = await getMarkets(1);

    expect(result.markets[0]).toMatchObject({
      symbol: "PEPE-USD",
      tick_size: "0.00000001",
      price_decimals: 8,
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

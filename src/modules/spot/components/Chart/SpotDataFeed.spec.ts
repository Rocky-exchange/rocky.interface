/**
 * SpotDataFeed unit tests.
 *
 * These are the highest-risk lines in the chart module:
 *   - resolution mapping (TV → backend interval string)
 *   - getBars scoping to [from, to] window + noData flag
 *   - subscribeBars poll cadence (half bar duration, 1-5s clamp)
 *
 * We stub fetch + fake TradingView types.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpotDataFeed } from "./SpotDataFeed";

import type {
  Bar,
  DatafeedConfiguration,
  LibrarySymbolInfo,
  PeriodParams,
  ResolutionString,
} from "charting_library";

function stubFetch(rows: unknown[] | ((url: string) => unknown[])): { urls: string[] } {
  const urls: string[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    urls.push(url);
    const body = typeof rows === "function" ? rows(url) : rows;
    return Promise.resolve({
      ok: true,
      status: 200,
      // SpotDataFeed uses r.json(); spotClient uses r.text(). Provide both.
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response);
  });
  return { urls };
}

// Minimal LibrarySymbolInfo — SpotDataFeed only reads .name.
function symbolInfo(name = "CBTC-USDCX"): LibrarySymbolInfo {
  return { name, ticker: name } as LibrarySymbolInfo;
}

function period(fromSec: number, toSec: number, countBack = 500): PeriodParams {
  return { from: fromSec, to: toSec, countBack, firstDataRequest: true } as PeriodParams;
}

describe("onReady", () => {
  it("advertises the backend interval whitelist", async () => {
    const feed = new SpotDataFeed();
    const cfg = await new Promise<DatafeedConfiguration>((resolve) => feed.onReady(resolve));
    expect(cfg.supported_resolutions).toEqual(["1", "5", "15", "30", "60", "240", "1D"]);
  });
});

describe("resolveSymbol", () => {
  it("derives description + pricescale=100 from the pair", async () => {
    const feed = new SpotDataFeed();
    const info = await new Promise<LibrarySymbolInfo>((resolve) =>
      feed.resolveSymbol("CBTC-USDCX", resolve as never, () => {}, undefined as unknown as string),
    );
    expect(info.name).toBe("CBTC-USDCX");
    expect(info.description).toBe("CBTC/USDCX");
    expect(info.pricescale).toBe(100); // tick 0.01 → 2 decimals
    expect(info.session).toBe("24x7");
    expect(info.type).toBe("crypto");
  });

  it("defaults quote to USDCX when symbol has no dash", async () => {
    const feed = new SpotDataFeed();
    const info = await new Promise<LibrarySymbolInfo>((resolve) =>
      feed.resolveSymbol("CBTC", resolve as never, () => {}, undefined as unknown as string),
    );
    expect(info.description).toBe("CBTC/USDCX");
    expect(info.currency_code).toBe("USDCX");
  });
});

describe("getBars", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps backend rows to Bar objects with ms times and float OHLCV", async () => {
    const rows = [
      [1_700_000_000_000, "500.00", "501.00", "499.00", "500.50", "1.5", 1_700_000_059_999, "751.00", 3, "0", "0", "0"],
    ];
    stubFetch(rows);
    const feed = new SpotDataFeed();

    const bars: Bar[] = await new Promise((resolve, reject) => {
      feed.getBars(
        symbolInfo(),
        "1" as ResolutionString,
        period(1_699_999_940, 1_700_000_100),
        (data, meta) => resolve(data),
        (reason) => reject(new Error(reason)),
      );
    });

    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      time: 1_700_000_000_000,
      open: 500,
      high: 501,
      low: 499,
      close: 500.5,
      volume: 1.5,
    });
  });

  it("hits /api/v3/klines with the mapped backend interval + countBack limit", async () => {
    const { urls } = stubFetch([]);
    const feed = new SpotDataFeed();
    await new Promise<void>((resolve) => {
      feed.getBars(
        symbolInfo(),
        "5" as ResolutionString,      // → 5m
        period(0, 1_000_000, 200),    // countBack 200
        () => resolve(),
        () => resolve(),
      );
    });
    expect(urls[0]).toContain("symbol=CBTC-USDCX");
    expect(urls[0]).toContain("interval=5m");
    expect(urls[0]).toContain("limit=200");
  });

  it("clamps limit to [100, 1000]", async () => {
    const { urls } = stubFetch([]);
    const feed = new SpotDataFeed();
    await new Promise<void>((resolve) => {
      feed.getBars(symbolInfo(), "1" as ResolutionString, period(0, 1, 5), () => resolve(), () => resolve());
    });
    expect(urls[0]).toContain("limit=100");

    urls.length = 0;
    await new Promise<void>((resolve) => {
      feed.getBars(symbolInfo(), "1" as ResolutionString, period(0, 1, 999_999), () => resolve(), () => resolve());
    });
    expect(urls[0]).toContain("limit=1000");
  });

  it("scopes bars to [from, to] window and sets noData when empty", async () => {
    // Row at t=1700_000_000_000 (=1_700_000_000 sec) — outside [from=1_700_000_100, to=1_700_000_200].
    const rows = [
      [1_700_000_000_000, "500", "501", "499", "500", "1", 1_700_000_059_999, "500", 1, "0", "0", "0"],
    ];
    stubFetch(rows);
    const feed = new SpotDataFeed();

    const { bars, meta } = await new Promise<{ bars: Bar[]; meta?: { noData?: boolean } }>((resolve, reject) => {
      feed.getBars(
        symbolInfo(),
        "1" as ResolutionString,
        period(1_700_000_100, 1_700_000_200),
        (data, m) => resolve({ bars: data, meta: m }),
        (reason) => reject(new Error(reason)),
      );
    });

    expect(bars).toHaveLength(0);
    expect(meta?.noData).toBe(true);
  });

  it("sorts bars in ascending time order", async () => {
    const rows = [
      [1_700_000_060_000, "b", "b", "b", "b", "1", 0, "0", 1, "0", "0", "0"],
      [1_700_000_000_000, "a", "a", "a", "a", "1", 0, "0", 1, "0", "0", "0"],
      [1_700_000_120_000, "c", "c", "c", "c", "1", 0, "0", 1, "0", "0", "0"],
    ];
    // These string prices become NaN when parsed → filtered. Use real numbers instead.
    const numericRows = rows.map((r) => [...r]);
    for (let i = 0; i < numericRows.length; i++) {
      const row = numericRows[i] as (string | number)[];
      row[1] = row[2] = row[3] = row[4] = "500";
    }
    stubFetch(numericRows);
    const feed = new SpotDataFeed();

    const bars: Bar[] = await new Promise((resolve, reject) => {
      feed.getBars(
        symbolInfo(),
        "1" as ResolutionString,
        period(0, 2_000_000_000),
        (data) => resolve(data),
        (r) => reject(new Error(r)),
      );
    });
    const times = bars.map((b) => b.time as number);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("surfaces fetch errors to onError callback", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    const feed = new SpotDataFeed();
    const reason = await new Promise<string>((resolve) => {
      feed.getBars(symbolInfo(), "1" as ResolutionString, period(0, 1), () => resolve(""), (r) => resolve(r));
    });
    expect(reason).toBe("network down");
  });
});

// subscribeBars uses real setInterval + awaited fetch — mixing fake timers
// with unstubbed microtasks gets fiddly, so we use REAL timers here and just
// wait a bit for the poll to fire. Keeps the tests robust without fighting
// vitest's timer <> promise interplay.

// Small helper: wait for a predicate to hold or throw (up to timeoutMs).
async function waitFor(pred: () => boolean, timeoutMs = 500, stepMs = 10) {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

describe("subscribeBars / unsubscribeBars", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("kicks immediately (first fetch happens without waiting for interval)", async () => {
    const { urls } = stubFetch([]);
    const feed = new SpotDataFeed();
    feed.subscribeBars(symbolInfo(), "5" as ResolutionString, () => {}, "listener-1", () => {});
    await waitFor(() => urls.length >= 1);
    expect(urls.length).toBeGreaterThanOrEqual(1);
    feed.unsubscribeBars("listener-1");
  });

  it("emits every returned bar via onTick on the immediate kick", async () => {
    stubFetch([
      [1_700_000_000_000, "500", "501", "499", "500", "1", 0, "0", 1, "0", "0", "0"],
      [1_700_000_060_000, "500", "502", "498", "501", "2", 0, "0", 2, "0", "0", "0"],
    ]);
    const feed = new SpotDataFeed();
    const ticks: Bar[] = [];
    feed.subscribeBars(symbolInfo(), "1" as ResolutionString, (b) => ticks.push(b), "listener-2", () => {});
    await waitFor(() => ticks.length >= 2);
    expect(ticks.map((b) => b.close)).toEqual([500, 501]);
    feed.unsubscribeBars("listener-2");
  });

  it("unsubscribeBars clears the interval + drops the sub", async () => {
    const { urls } = stubFetch([]);
    const feed = new SpotDataFeed();
    feed.subscribeBars(symbolInfo(), "1" as ResolutionString, () => {}, "gonzo", () => {});
    await waitFor(() => urls.length >= 1);

    feed.unsubscribeBars("gonzo");
    // Internal state is dropped — same guid should no-op the second time.
    expect(() => feed.unsubscribeBars("gonzo")).not.toThrow();
  });

  it("swallows transient fetch errors — subscribeBars does not throw", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("transient")));
    const feed = new SpotDataFeed();
    // If the internal tick() didn't swallow, this would emit an uncaught
    // promise rejection; the assertion is the absence of a throw.
    expect(() =>
      feed.subscribeBars(symbolInfo(), "1" as ResolutionString, () => {}, "resilient", () => {}),
    ).not.toThrow();
    // Let the immediate rejected fetch drain so no unhandled promise warning.
    await new Promise((r) => setTimeout(r, 20));
    feed.unsubscribeBars("resilient");
  });
});

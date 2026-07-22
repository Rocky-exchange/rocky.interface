/**
 * TradingView IBasicDataFeed for spot pairs, backed EXCLUSIVELY by Rocky's
 * own `/api/v3/klines` (same-origin, aggregated from ledger.spot_trades).
 *
 * ⚠ Policy (founder, 2026-07-22): the frontend must NOT call any Binance
 * endpoint. An earlier revision charted from data-api.binance.vision; it
 * was CORS-blocked in production and is disallowed regardless. History
 * starts when the market's first trade printed — a young market simply
 * shows a short chart.
 *
 * Implements the minimum surface TradingView needs:
 *   onReady          — resolutions
 *   resolveSymbol    — one symbol per instance
 *   getBars          — historical bars from /api/v3/klines
 *   subscribeBars    — poll of the latest bar
 *   unsubscribeBars  — cancel that poll
 */

import type {
  Bar,
  DatafeedConfiguration,
  HistoryCallback,
  IBasicDataFeed,
  LibrarySymbolInfo,
  OnReadyCallback,
  PeriodParams,
  ResolutionString,
  ResolveCallback,
  SubscribeBarsCallback,
} from "charting_library";

// TradingView resolution → rocky-backend /api/v3/klines interval. Must stay
// within interval_to_seconds() in api-gateway spot/routes_market.rs.
const SUPPORTED_RESOLUTIONS = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
} as const;

// Price decimals per symbol (mirror ledger.markets tick_size):
// CBTC/CETH tick 0.01 → 2dp; CC tick 0.00001 → 5dp.
const PRICESCALE: Record<string, number> = {
  "CBTC-USDA": 100,
  "CETH-USDA": 100,
  "CC-USDA": 100000,
};

function tvToInterval(res: ResolutionString): string {
  return (SUPPORTED_RESOLUTIONS as Record<string, string>)[res] ?? "1m";
}

function intervalSeconds(interval: string): number {
  switch (interval) {
    case "1m":
      return 60;
    case "5m":
      return 300;
    case "15m":
      return 900;
    case "30m":
      return 1800;
    case "1h":
      return 3600;
    case "4h":
      return 14400;
    case "1d":
      return 86400;
    default:
      return 60;
  }
}

// Binance-shaped kline row (rocky-backend mirrors the wire format):
// [openMs, open, high, low, close, volume, closeMs, quoteVolume, count, ...]
type RawKline = [number, string, string, string, string, string, number, string, number, ...string[]];

// Same-origin Rocky spot klines (ledger.spot_trades aggregation) — the ONLY
// chart data source; no third-party endpoints.
const ROCKY_KLINES = "/api/v3/klines";

async function fetchKlines(rockySymbol: string, interval: string, limit: number): Promise<Bar[]> {
  // Clamp to the backend's 1..1000. Do NOT floor to 100 here: subscribeBars
  // intentionally asks for the last 2 bars only — flooring silently turned
  // that into 100 bars per poll, all of which got pushed through the
  // realtime callback and tripped TradingView's bar-time-order check
  // ("putToCacheNewBar: time violation" console flood).
  const params = new URLSearchParams({
    symbol: rockySymbol,
    interval,
    limit: String(Math.min(Math.max(limit, 1), 1000)),
  });
  const r = await fetch(`${ROCKY_KLINES}?${params.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`spot klines HTTP ${r.status}`);
  const rows = (await r.json()) as RawKline[];
  return rows
    .map((row) => ({
      time: row[0], // ms — TradingView expects ms
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: parseFloat(row[5]),
    }))
    .filter((b) => isFinite(b.open) && isFinite(b.close))
    .sort((a, b) => (a.time as number) - (b.time as number));
}

export class SpotDataFeed implements IBasicDataFeed {
  private subs = new Map<
    string,
    { cb: SubscribeBarsCallback; timer: number; interval: string; symbol: string; lastBarTime: number }
  >();

  onReady(callback: OnReadyCallback): void {
    // TradingView polls resolutions from here.
    const cfg: DatafeedConfiguration = {
      supported_resolutions: Object.keys(SUPPORTED_RESOLUTIONS) as ResolutionString[],
      exchanges: [{ value: "Rocky", name: "Rocky", desc: "Rocky Spot" }],
      symbols_types: [{ name: "crypto", value: "crypto" }],
    };
    setTimeout(() => callback(cfg), 0);
  }

  searchSymbols(): void {
    // No search UI for v1.
  }

  resolveSymbol(symbolName: string, onResolve: ResolveCallback): void {
    // symbolName === "CBTC-USDA" or "CETH-USDA"; description shown in the
    // symbol title area.
    const [base, quote] = symbolName.split("-");
    const info: LibrarySymbolInfo = {
      name: symbolName,
      ticker: symbolName,
      description: `${base}/${quote ?? "USDA"}`,
      type: "crypto",
      session: "24x7",
      timezone: "Etc/UTC",
      exchange: "Rocky",
      listed_exchange: "Rocky",
      format: "price",
      minmov: 1,
      pricescale: PRICESCALE[symbolName] ?? 100,
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: false,
      supported_resolutions: Object.keys(SUPPORTED_RESOLUTIONS) as ResolutionString[],
      volume_precision: 4,
      data_status: "streaming",
      currency_code: quote ?? "USDA",
    };
    setTimeout(() => onResolve(info), 0);
  }

  async getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: (reason: string) => void
  ): Promise<void> {
    try {
      const interval = tvToInterval(resolution);
      const limit = Math.min(Math.max(periodParams.countBack ?? 500, 100), 1000);
      // The backend has no endTime pagination — every fetch returns the
      // latest window. Scrolling further left than the market's first trade
      // scopes to empty → noData:true, which stops TradingView paginating.
      const bars = await fetchKlines(symbolInfo.name, interval, limit);
      const fromMs = periodParams.from * 1000;
      const toMs = periodParams.to * 1000;
      const scoped = bars.filter((b) => (b.time as number) >= fromMs && (b.time as number) <= toMs);
      const noData = scoped.length === 0;
      onResult(scoped, { noData });
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string
  ): void {
    const interval = tvToInterval(resolution);
    const secs = intervalSeconds(interval);
    const tick = async () => {
      try {
        // Pull the last 2 bars so we can emit both the still-updating current
        // bar and (occasionally) fill in the previous bar's final print.
        const bars = await fetchKlines(symbolInfo.name, interval, 2);
        const state = this.subs.get(listenerGuid);
        if (!state) return; // unsubscribed while the fetch was in flight
        for (const b of bars) {
          // TradingView requires realtime bars in non-decreasing time order;
          // never emit anything older than what we've already pushed.
          if ((b.time as number) >= state.lastBarTime) {
            onTick(b);
            state.lastBarTime = b.time as number;
          }
        }
      } catch (_error) {
        /* transient — try again next tick */
      }
    };
    // Poll roughly twice per bar (min 1s, max 5s) so the current candle
    // updates without hammering the backend.
    const pollMs = Math.max(1000, Math.min(5000, (secs * 1000) / 2));
    const timer = window.setInterval(tick, pollMs);
    this.subs.set(listenerGuid, {
      cb: onTick,
      timer,
      interval,
      symbol: symbolInfo.name,
      lastBarTime: 0,
    });
    // Kick immediately so the current candle appears without a 1s wait.
    void tick();
  }

  unsubscribeBars(listenerGuid: string): void {
    const s = this.subs.get(listenerGuid);
    if (s) {
      window.clearInterval(s.timer);
      this.subs.delete(listenerGuid);
    }
  }
}

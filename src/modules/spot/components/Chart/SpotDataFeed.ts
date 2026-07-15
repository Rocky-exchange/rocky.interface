/**
 * TradingView IBasicDataFeed for spot pairs, backed by rocky-backend
 * /api/v3/klines. Same-origin via the vite /api/v3 proxy in dev; behind
 * nginx in prod.
 *
 * Implements the minimum surface TradingView needs:
 *   onReady          — resolutions
 *   resolveSymbol    — one symbol per instance
 *   getBars          — historical /klines fetch
 *   subscribeBars    — 2s poll of the latest bar (spot lacks a WS today;
 *                      swap for the API's WS whenever it lands)
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

// rocky-backend interval whitelist — see build_klines_response in
// services/api-gateway/src/spot/routes_market.rs
const SUPPORTED_RESOLUTIONS = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
} as const;

type TVResolution = keyof typeof SUPPORTED_RESOLUTIONS;

function tvToBackend(res: ResolutionString): string {
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

// Backend row: [openMs, open, high, low, close, volume, closeMs, quoteVolume, count, ...]
type RawKline = [number, string, string, string, string, string, number, string, number, ...string[]];

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Bar[]> {
  const r = await fetch(`/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`klines HTTP ${r.status}`);
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
    // symbolName === "CBTC-USDCX" or "CETH-USDCX"; description shown in the
    // symbol title area.
    const [base, quote] = symbolName.split("-");
    const info: LibrarySymbolInfo = {
      name: symbolName,
      ticker: symbolName,
      description: `${base}/${quote ?? "USDCX"}`,
      type: "crypto",
      session: "24x7",
      timezone: "Etc/UTC",
      exchange: "Rocky",
      listed_exchange: "Rocky",
      format: "price",
      minmov: 1,
      // rocky-backend tick=0.01 for both pairs → 2 decimals.
      pricescale: 100,
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: false,
      supported_resolutions: Object.keys(SUPPORTED_RESOLUTIONS) as ResolutionString[],
      volume_precision: 4,
      data_status: "streaming",
      currency_code: quote ?? "USDCX",
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
      const interval = tvToBackend(resolution);
      // countBack is TradingView's request for N most recent bars.
      const limit = Math.min(Math.max(periodParams.countBack ?? 500, 100), 1000);
      const bars = await fetchKlines(symbolInfo.name, interval, limit);
      // Filter to the periodParams window; TradingView is strict about `to`.
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
    const interval = tvToBackend(resolution);
    const secs = intervalSeconds(interval);
    const tick = async () => {
      try {
        // Pull the last 2 bars so we can emit both the still-updating current
        // bar and (occasionally) fill in the previous bar's final print.
        const bars = await fetchKlines(symbolInfo.name, interval, 2);
        for (const b of bars) {
          onTick(b);
        }
        const state = this.subs.get(listenerGuid);
        if (state && bars.length) state.lastBarTime = bars[bars.length - 1].time as number;
      } catch {
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

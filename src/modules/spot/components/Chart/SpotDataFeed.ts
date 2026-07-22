/**
 * TradingView IBasicDataFeed for spot pairs, backed by Binance's public
 * spot data mirror `data-api.binance.vision`. Rocky's own /api/v3/klines
 * only reflects local wash trades — starting cold shows a stub chart. Perp
 * shows a full history because it's been accumulating for weeks; spot has
 * no such head start, so we source visualization from Binance's spot feed
 * (BTCUSDT / ETHUSDT) while local orderbook/trade panels still read our
 * own backend. This matches the perp chart pattern: reference third-party
 * price, execute against Rocky.
 *
 * Implements the minimum surface TradingView needs:
 *   onReady          — resolutions
 *   resolveSymbol    — one symbol per instance
 *   getBars          — historical /klines from Binance data-api mirror
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

// Binance interval strings. Superset of what rocky-backend accepts; safe
// because we're fetching from Binance directly here.
const SUPPORTED_RESOLUTIONS = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
} as const;

// Rocky spot symbol → Binance symbol for chart data.
const BINANCE_SYMBOL: Record<string, string> = {
  "CBTC-USDA": "BTCUSDT",
  "CETH-USDA": "ETHUSDT",
  "CC-USDA": "CCUSDT",
};

// Price decimals per symbol (mirror ledger.markets tick_size):
// CBTC/CETH tick 0.01 → 2dp; CC tick 0.00001 → 5dp.
const PRICESCALE: Record<string, number> = {
  "CBTC-USDA": 100,
  "CETH-USDA": 100,
  "CC-USDA": 100000,
};

function tvToBinance(res: ResolutionString): string {
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

// Binance row: [openMs, open, high, low, close, volume, closeMs, quoteVolume, count, ...]
type RawKline = [number, string, string, string, string, string, number, string, number, ...string[]];

const BINANCE_KLINES = "https://data-api.binance.vision/api/v3/klines";
// Same-origin Rocky spot klines (ledger.spot_trades aggregation). Used for
// symbols with no Binance spot mirror (CC has no CCUSDT spot market).
const ROCKY_KLINES = "/api/v3/klines";

async function fetchKlines(rockySymbol: string, interval: string, limit: number, endTimeMs?: number): Promise<Bar[]> {
  const binSym = BINANCE_SYMBOL[rockySymbol];
  // Clamp to Binance's 1..1000. Do NOT floor to 100 here: subscribeBars
  // intentionally asks for the last 2 bars only — flooring silently turned
  // that into 100 bars per poll, all of which got pushed through the
  // realtime callback and tripped TradingView's bar-time-order check
  // ("putToCacheNewBar: time violation" console flood).
  const params = new URLSearchParams({
    symbol: binSym ?? rockySymbol,
    interval,
    limit: String(Math.min(Math.max(limit, 1), 1000)),
  });
  // Rocky's own klines endpoint has no endTime pagination — older-history
  // requests just re-return the latest window; getBars scopes + reports
  // noData, which TradingView handles.
  if (binSym && endTimeMs && isFinite(endTimeMs)) params.set("endTime", String(endTimeMs));
  const url = binSym ? BINANCE_KLINES : ROCKY_KLINES;
  const r = await fetch(`${url}?${params.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`binance klines HTTP ${r.status}`);
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
      const interval = tvToBinance(resolution);
      const limit = Math.min(Math.max(periodParams.countBack ?? 500, 100), 1000);
      // On subsequent pagination (user scrolls left), pin endTime to
      // periodParams.to so Binance walks back from that point; on initial
      // load leave it off and the API returns the most-recent `limit` bars.
      const endTimeMs = periodParams.firstDataRequest ? undefined : periodParams.to * 1000;
      const bars = await fetchKlines(symbolInfo.name, interval, limit, endTimeMs);
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
    const interval = tvToBinance(resolution);
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

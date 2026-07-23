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

import { resolveSpotMarket } from "../../model/spotMarkets";

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
  "1W": "1w",
  "1M": "1M",
} as const;

function tvToBinance(res: ResolutionString): string {
  return (SUPPORTED_RESOLUTIONS as Record<string, string>)[res] ?? "1m";
}

function toBinanceSymbol(routeSymbol: string): string {
  const market = resolveSpotMarket(routeSymbol);
  const normalizedRouteSymbol = routeSymbol.trim().toUpperCase();
  return market.routeSymbol === normalizedRouteSymbol ? market.chartSymbol : routeSymbol.replace("-", "");
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
    case "1w":
      return 604800;
    case "1M":
      return 2592000;
    default:
      return 60;
  }
}

// Binance row: [openMs, open, high, low, close, volume, closeMs, quoteVolume, count, ...]
type RawKline = [number, string, string, string, string, string, number, string, number, ...string[]];

const BINANCE_KLINES = "https://data-api.binance.vision/api/v3/klines";

async function fetchKlines(rockySymbol: string, interval: string, limit: number, endTimeMs?: number): Promise<Bar[]> {
  const binSym = toBinanceSymbol(rockySymbol);
  const params = new URLSearchParams({
    symbol: binSym,
    interval,
    limit: String(Math.min(Math.max(limit, 100), 1000)),
  });
  if (endTimeMs && isFinite(endTimeMs)) params.set("endTime", String(endTimeMs));
  const r = await fetch(`${BINANCE_KLINES}?${params.toString()}`, {
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
    const market = resolveSpotMarket(symbolName);
    const normalizedSymbolName = symbolName.trim().toUpperCase();
    const isKnownMarket = market.routeSymbol === normalizedSymbolName;
    const [base, quote] = symbolName.split("-");
    const resolvedSymbolName = isKnownMarket ? market.routeSymbol : symbolName;
    const displayBase = isKnownMarket ? market.displayBase : base;
    const displayQuote = isKnownMarket ? market.displayQuote : (quote ?? "USDA");
    const info: LibrarySymbolInfo = {
      name: resolvedSymbolName,
      ticker: resolvedSymbolName,
      description: `${displayBase}/${displayQuote}`,
      type: "crypto",
      session: "24x7",
      timezone: "Etc/UTC",
      exchange: "Rocky",
      listed_exchange: "Rocky",
      format: "price",
      minmov: 1,
      // rocky-backend tick=0.01 for the currently routed public markets.
      pricescale: resolvedSymbolName === "CC-USDA" ? 100000 : 100,
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: true,
      supported_resolutions: Object.keys(SUPPORTED_RESOLUTIONS) as ResolutionString[],
      volume_precision: 4,
      data_status: "streaming",
      currency_code: displayQuote,
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
        if (!state) return;
        for (const b of bars) {
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

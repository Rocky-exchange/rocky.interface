/**
 * X10000 K-line DataFeed for TradingView
 *
 * This datafeed fetches candle data from the X10000 backend API
 * and subscribes to real-time K-line updates via WebSocket.
 */

import { getCandles, type Candle, type KlinePeriod } from "@/modules/cex/lib/api/custom/client";
import {
  getX10000WebSocketService,
  normalizeMarketSymbolToApiFormat,
  type WsKlineUpdate,
} from "@/modules/cex/lib/api/custom/websocket";
import {
  DatafeedErrorCallback,
  HistoryCallback,
  IBasicDataFeed,
  LibrarySymbolInfo,
  OnReadyCallback,
  PeriodParams,
  ResolutionString,
  ResolveCallback,
  SubscribeBarsCallback,
  type VisiblePlotsSet,
} from "charting_library";
import { getServerBaseUrl } from "config/backend";
import { SUPPORTED_RESOLUTIONS_V2 } from "config/tradingview";
import { Bar, FromOldToNewArray } from "domain/tradingview/types";
import { formatTimeInBarToMs } from "domain/tradingview/utils";

// Resolution string to backend period mapping
// Note: Backend only supports "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d"
// For weekly and monthly, we use "1d" as fallback
const RESOLUTION_TO_PERIOD: Record<string, KlinePeriod> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
  "1W": "1d", // Fallback to daily for weekly (backend doesn't support weekly)
  "1M": "1d", // Fallback to daily for monthly (backend doesn't support monthly)
};

// Resolution to seconds for time calculations
const RESOLUTION_TO_SECONDS: Record<string, number> = {
  "1": 60,
  "5": 60 * 5,
  "15": 60 * 15,
  "60": 60 * 60,
  "240": 60 * 60 * 4,
  "1D": 60 * 60 * 24,
  "1W": 60 * 60 * 24 * 7,
  "1M": 60 * 60 * 24 * 30,
};

/**
 * Parse symbol that may have multiplier prefix (e.g., "1@BTC" -> "BTC")
 */
function parseSymbolWithMultiplier(symbolName: string): string {
  if (symbolName.includes("@")) {
    const parts = symbolName.split("@");
    return parts[1] || symbolName;
  }
  return symbolName;
}

/**
 * Convert frontend symbol to backend symbol (BTC-USD)
 * Handles multiple formats: BTC, BTC/USD, BTCUSD, BTCUSDT, 1@BTC -> BTC-USD
 */
function convertSymbolToBackend(frontendSymbol: string): string {
  // First, remove multiplier prefix if present (e.g., "1@BTC" -> "BTC")
  let symbol = parseSymbolWithMultiplier(frontendSymbol);

  // Remove any USD/USDT suffix (with optional separator) first, then add -USD
  // Handles: BTC, BTC/USD, BTC-USD, BTCUSD, BTCUSDT
  const base = symbol
    .replace(/[-/]?USD[T]?$/i, "") // Remove -USD, /USD, USD, USDT suffix
    .replace(/[-/]$/, "") // Remove trailing - or /
    .toUpperCase();

  return `${base}-USD`;
}

/**
 * Convert Candle from API to TradingView Bar
 */
type VolumeMetric = "base" | "quote";

function getVolumeValue(
  source: Pick<Candle, "close" | "volume" | "quote_volume"> | Pick<WsKlineUpdate, "close" | "volume" | "quote_volume">,
  volumeMetric: VolumeMetric
): number {
  const baseVolume = parseFloat(source.volume);
  if (volumeMetric === "base") return baseVolume;

  const quoteVolume = parseFloat(source.quote_volume ?? "0");
  if (Number.isFinite(quoteVolume) && quoteVolume > 0) return quoteVolume;

  const close = parseFloat(source.close);
  return baseVolume * close;
}

function candleToBar(candle: Candle, volumeMetric: VolumeMetric): Bar {
  return {
    time: candle.time, // Keep as seconds, will be converted to ms later
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: getVolumeValue(candle, volumeMetric),
  };
}

/**
 * Convert WsKlineUpdate to TradingView Bar
 */
function wsKlineToBar(kline: WsKlineUpdate, volumeMetric: VolumeMetric): Bar {
  return {
    time: kline.time,
    open: parseFloat(kline.open),
    high: parseFloat(kline.high),
    low: parseFloat(kline.low),
    close: parseFloat(kline.close),
    volume: getVolumeValue(kline, volumeMetric),
  };
}

interface Subscription {
  symbol: string;
  backendSymbol: string;
  resolution: ResolutionString;
  period: KlinePeriod;
  callback: SubscribeBarsCallback;
  lastBar: Bar | null;
  unsubscribeWs: (() => void) | null;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export class X10000KlineDataFeed extends EventTarget implements IBasicDataFeed {
  private chainId: number;
  private subscriptions: Map<string, Subscription> = new Map();
  private wsConnected = false;
  private lastRequestTime: Map<string, number> = new Map();
  private readonly REQUEST_DEBOUNCE_MS = 1000; // Minimum 1 second between requests for same symbol+period

  constructor(
    chainId: number,
    private brandName = "X10000",
    private visiblePlotsSet: VisiblePlotsSet = "ohlcv",
    private volumeMetric: VolumeMetric = "base"
  ) {
    super();
    this.chainId = chainId;
    this.initWebSocket();
  }

  private initWebSocket(): void {
    const ws = getX10000WebSocketService(this.chainId);

    // Connect if not already connected
    if (!ws.isConnected()) {
      ws.connect();
    }

    ws.onConnect(() => {
      this.wsConnected = true;
      // Resubscribe all active subscriptions
      this.subscriptions.forEach((sub) => {
        ws.subscribeKline(sub.backendSymbol, sub.period);
      });
    });

    ws.onDisconnect(() => {
      this.wsConnected = false;
    });

    // Listen for kline updates
    ws.onKlineUpdate((channel, data) => {
      this.handleKlineUpdate(channel, data);
    });
  }

  private handleKlineUpdate(channel: string, data: WsKlineUpdate): void {
    // Channel format: kline:ETHUSDT:5m (after normalization)
    const parts = channel.split(":");
    if (parts.length !== 3) return;

    const [, apiSymbol, period] = parts; // apiSymbol is in ETHUSDT format

    // Find matching subscription
    // Note: sub.backendSymbol is in ETH-USD format, but channel uses ETHUSDT format
    // So we need to normalize sub.backendSymbol to match
    this.subscriptions.forEach((sub) => {
      const normalizedBackendSymbol = normalizeMarketSymbolToApiFormat(sub.backendSymbol);
      if (normalizedBackendSymbol === apiSymbol && sub.period === period) {
        const bar = wsKlineToBar(data, this.volumeMetric);

        // Debug: Log the volume from the WebSocket update
        // console.log(`[X10000KlineDataFeed] K-line update for ${apiSymbol} ${period}:`, {
        //   rawVolume: data.volume,
        //   parsedVolume: bar.volume,
        //   time: bar.time,
        //   open: bar.open,
        //   high: bar.high,
        //   low: bar.low,
        //   close: bar.close,
        // });

        // Update last bar
        sub.lastBar = bar;

        // Notify TradingView (convert time to ms)
        // formatTimeInBarToMs uses spread operator, so volume should be preserved
        const barWithMs = formatTimeInBarToMs(bar);

        // Ensure volume is explicitly included and is a valid number
        // TradingView requires volume to be a number (not undefined/null)
        const volumeValue = typeof bar.volume === "number" && !isNaN(bar.volume) ? bar.volume : 0;
        const barToSend: Bar = {
          time: barWithMs.time,
          open: barWithMs.open,
          high: barWithMs.high,
          low: barWithMs.low,
          close: barWithMs.close,
          volume: volumeValue, // Explicitly include volume, ensure it's a valid number
        };

        // Debug: Log the bar object being sent to TradingView
        // console.log(`[X10000KlineDataFeed] Sending bar to TradingView:`, barToSend);

        sub.callback(barToSend);
      }
    });
  }

  searchSymbols(): void {
    // Not implemented for X10000
  }

  resolveSymbol(symbolName: string, onResolve: ResolveCallback): void {
    // For X10000, symbolName may be "BTC", "1@BTC", etc.
    // Parse out the actual symbol
    const parsedSymbol = parseSymbolWithMultiplier(symbolName);
    const priceDecimals = 2; // Default price decimals

    const symbolInfo: LibrarySymbolInfo = {
      name: parsedSymbol, // Use parsed symbol without multiplier
      type: "crypto",
      description: `${parsedSymbol}/USD`,
      ticker: parsedSymbol,
      session: "24x7",
      minmov: 1,
      timezone: "Etc/UTC",
      has_intraday: true,
      has_daily: true,
      currency_code: "USD",
      data_status: "streaming",
      visible_plots_set: this.visiblePlotsSet,
      exchange: this.brandName,
      listed_exchange: this.brandName,
      format: "price",
      pricescale: Math.max(1, 10 ** priceDecimals),
    };

    setTimeout(() => {
      onResolve(symbolInfo);
    }, 0);
  }

  async getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: DatafeedErrorCallback
  ): Promise<void> {
    const period = RESOLUTION_TO_PERIOD[resolution];
    if (!period) {
      onError(`Unsupported resolution: ${resolution}`);
      return;
    }

    // Convert symbol to backend format
    const backendSymbol = convertSymbolToBackend(symbolInfo.name);
    const countBack = Math.min(periodParams.countBack, 10000);
    const to = periodParams.to; // Request end time in seconds

    // Create a unique key for this request to implement debouncing
    const requestKey = `${backendSymbol}:${period}:${countBack}`;
    const now = Date.now();
    const lastRequest = this.lastRequestTime.get(requestKey);

    // Debounce: prevent too frequent requests for the same symbol+period
    if (lastRequest && now - lastRequest < this.REQUEST_DEBOUNCE_MS) {
      console.warn(
        `[X10000KlineDataFeed] Request debounced for ${requestKey}, last request was ${now - lastRequest}ms ago`
      );
      // Return empty result to prevent infinite loop, but don't mark as noData
      // This will prevent TradingView from continuously requesting
      onResult([], { noData: false });
      return;
    }

    // Update last request time
    this.lastRequestTime.set(requestKey, now);

    try {
      // Don't pass start/end to API, let it return the most recent candles
      // We'll filter them based on the requested time range
      const response = await getCandles(this.chainId, backendSymbol, {
        period,
        limit: countBack,
        start: periodParams.from * 1000, // Convert seconds to milliseconds
        end: periodParams.to * 1000, // Convert seconds to milliseconds
      });

      if (!response.candles || response.candles.length === 0) {
        // Only set noData if the requested time is in the past
        // If requesting future data, don't set noData
        const isRequestingPastData = to < Date.now() / 1000;
        onResult([], { noData: isRequestingPastData });
        return;
      }

      // Convert candles to bars (API returns old to new order)
      const allBars: FromOldToNewArray<Bar> = response.candles.map((candle) => {
        const bar = candleToBar(candle, this.volumeMetric);
        const barWithMs = formatTimeInBarToMs(bar);

        // Ensure volume is explicitly included
        const barToReturn: Bar = {
          time: barWithMs.time,
          open: barWithMs.open,
          high: barWithMs.high,
          low: barWithMs.low,
          close: barWithMs.close,
          volume: bar.volume ?? 0, // Explicitly include volume
        };

        return barToReturn;
      });

      // Filter bars to only include those within the requested time range
      // TradingView expects bars up to and including the 'to' time
      const barsToReturn: FromOldToNewArray<Bar> = [];
      for (const bar of allBars) {
        // Convert bar.time (ms) to seconds for comparison
        const barTimeSeconds = bar.time / 1000;
        if (barTimeSeconds <= to) {
          barsToReturn.push(bar);
        } else {
          // Bars are in chronological order, so we can break once we exceed 'to'
          break;
        }
      }

      // Debug: Log first bar to verify volume is included
      if (barsToReturn.length > 0) {
        console.log(`[X10000KlineDataFeed] getBars - First bar:`, {
          time: barsToReturn[0].time,
          open: barsToReturn[0].open,
          high: barsToReturn[0].high,
          low: barsToReturn[0].low,
          close: barsToReturn[0].close,
          volume: barsToReturn[0].volume,
        });
      }

      // Calculate offset: how many bars before the requested time range
      // This helps determine if we've reached the beginning of available data
      const resolutionSeconds = RESOLUTION_TO_SECONDS[resolution] || 60;
      const offset = Math.trunc(Math.max((Date.now() / 1000 - to) / resolutionSeconds, 0));

      // Set noData only when:
      // 1. We've requested too much historical data (offset + countBack >= 10_000), OR
      // 2. We got fewer bars than requested AND we're requesting past data
      // This prevents TradingView from continuously requesting more data when there's none
      const isRequestingPastData = to < Date.now() / 1000;
      const hasReachedLimit = offset + countBack >= 10_000;
      const hasInsufficientData = barsToReturn.length < countBack && isRequestingPastData;
      const noData = hasReachedLimit || hasInsufficientData;

      onResult(barsToReturn, {
        noData,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[X10000KlineDataFeed] Error fetching candles:`, error);
      // Remove the request time on error to allow retry after debounce period
      this.lastRequestTime.delete(requestKey);
      onError(String(error));
    }
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string
  ): void {
    const period = RESOLUTION_TO_PERIOD[resolution];
    if (!period) {
      // eslint-disable-next-line no-console
      console.error(`[X10000KlineDataFeed] Unsupported resolution: ${resolution}`);
      return;
    }

    const backendSymbol = convertSymbolToBackend(symbolInfo.name);

    // Store subscription
    const subscription: Subscription = {
      symbol: symbolInfo.name,
      backendSymbol,
      resolution,
      period,
      callback: onTick,
      lastBar: null,
      unsubscribeWs: null,
      pollTimer: null,
    };

    this.subscriptions.set(listenerGuid, subscription);

    // Live updates via REST polling (no WebSocket backend).
    const poll = async () => {
      try {
        const response = await getCandles(this.chainId, backendSymbol, { period, limit: 2 });
        const candles = response.candles;
        if (!candles || candles.length === 0) return;
        const latest = candles[candles.length - 1];
        const bar = formatTimeInBarToMs(candleToBar(latest, this.volumeMetric));
        subscription.callback({
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume ?? 0,
        });
      } catch {
        // ignore transient poll errors
      }
    };
    subscription.pollTimer = setInterval(poll, 3000);
    void poll();
  }

  unsubscribeBars(listenerGuid: string): void {
    const subscription = this.subscriptions.get(listenerGuid);
    if (!subscription) return;

    // Stop REST polling
    if (subscription.pollTimer) {
      clearInterval(subscription.pollTimer);
      subscription.pollTimer = null;
    }
    if (subscription.unsubscribeWs) {
      subscription.unsubscribeWs();
    }

    this.subscriptions.delete(listenerGuid);
  }

  onReady(callback: OnReadyCallback): void {
    setTimeout(() => {
      callback({
        supported_resolutions: Object.keys(SUPPORTED_RESOLUTIONS_V2) as ResolutionString[],
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
      });
    }, 0);
  }

  destroy(): void {
    // Unsubscribe all
    this.subscriptions.forEach((_, guid) => {
      this.unsubscribeBars(guid);
    });
    this.subscriptions.clear();
  }

  // Utility method to get backend URL (for debugging)
  getBackendUrl(): string {
    return getServerBaseUrl(this.chainId);
  }
}

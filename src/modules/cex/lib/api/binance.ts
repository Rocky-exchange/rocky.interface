/**
 * Binance Futures data source for market data:
 *   - K-line candles (REST + WS kline streams)
 *   - Orderbook / depth (REST + WS partial-depth streams)
 *   - Recent trades (REST + WS aggregate trade streams)
 *
 * REST base: https://fapi.binance.com
 * WS base:   wss://fstream.binance.com/ws
 */

export interface BinanceCandle {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quote_volume?: string;
  trade_count?: number;
  is_final?: boolean;
}

export interface BinanceCandlesResponse {
  symbol: string;
  period: string;
  candles: BinanceCandle[];
}

export interface BinanceWsKlineUpdate {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quote_volume?: string;
  trade_count?: number;
  is_final?: boolean;
}

export interface BinanceOrderbookResponse {
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
}

export interface BinanceWsOrderbookUpdate {
  symbol: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: number;
}

export interface BinanceTrade {
  id: string;
  symbol: string;
  price: string;
  amount: string;
  side: "buy" | "sell";
  timestamp: number;
}

export interface BinanceTradesResponse {
  symbol: string;
  trades: BinanceTrade[];
}

export interface BinanceWsTradeUpdate {
  symbol: string;
  id: string;
  price: string;
  amount: string;
  size: string;
  side: "buy" | "sell";
  timestamp: number;
}

const BINANCE_REST_BASE = "https://fapi.binance.com";
const BINANCE_WS_BASE = "wss://fstream.binance.com/ws";
const BINANCE_KLINE_MAX_LIMIT = 1500;
const BINANCE_DEPTH_ALLOWED_LIMITS = [5, 10, 20, 50, 100, 500, 1000] as const;
const BINANCE_TRADES_MAX_LIMIT = 1000;
const DEPTH_STREAM_LEVELS = 20;
const DEPTH_STREAM_INTERVAL = "100ms";

type RawBinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

interface RawBinanceDepth {
  lastUpdateId: number;
  E?: number;
  T?: number;
  bids: [string, string][];
  asks: [string, string][];
}

interface RawBinanceTrade {
  id: number;
  price: string;
  qty: string;
  quoteQty?: string;
  time: number;
  isBuyerMaker: boolean;
}

export async function fetchBinanceCandles(
  apiSymbol: string,
  params: { period: string; limit?: number; start?: number; end?: number }
): Promise<BinanceCandlesResponse> {
  const search = new URLSearchParams();
  const symbol = apiSymbol.toUpperCase();
  search.set("symbol", symbol);
  search.set("interval", params.period);
  if (params.limit !== undefined) {
    search.set("limit", Math.min(Math.max(1, params.limit), BINANCE_KLINE_MAX_LIMIT).toString());
  }
  if (params.start !== undefined) search.set("startTime", Math.floor(params.start).toString());
  if (params.end !== undefined) search.set("endTime", Math.floor(params.end).toString());

  const url = `${BINANCE_REST_BASE}/fapi/v1/klines?${search.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance klines ${res.status} for ${symbol} ${params.period}`);
  }
  const raw = (await res.json()) as RawBinanceKline[];

  const candles: BinanceCandle[] = raw.map((row) => ({
    time: Math.floor(row[0] / 1000),
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
    quote_volume: row[7],
    trade_count: row[8],
    is_final: true,
  }));

  return { symbol, period: params.period, candles };
}

function clampDepthLimit(limit: number): number {
  for (const allowed of BINANCE_DEPTH_ALLOWED_LIMITS) {
    if (limit <= allowed) return allowed;
  }
  return BINANCE_DEPTH_ALLOWED_LIMITS[BINANCE_DEPTH_ALLOWED_LIMITS.length - 1];
}

export async function fetchBinanceOrderbook(
  apiSymbol: string,
  limit = 100
): Promise<BinanceOrderbookResponse> {
  const symbol = apiSymbol.toUpperCase();
  const search = new URLSearchParams({ symbol, limit: String(clampDepthLimit(limit)) });
  const url = `${BINANCE_REST_BASE}/fapi/v1/depth?${search.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance depth ${res.status} for ${symbol}`);
  }
  const raw = (await res.json()) as RawBinanceDepth;
  const timestamp = raw.E ?? raw.T ?? Date.now();
  return {
    symbol,
    bids: (raw.bids ?? []).map(([p, q]) => [p, q] as [string, string]),
    asks: (raw.asks ?? []).map(([p, q]) => [p, q] as [string, string]),
    timestamp,
  };
}

export async function fetchBinanceTrades(
  apiSymbol: string,
  limit = 50
): Promise<BinanceTradesResponse> {
  const symbol = apiSymbol.toUpperCase();
  const effectiveLimit = Math.min(Math.max(1, limit), BINANCE_TRADES_MAX_LIMIT);
  const search = new URLSearchParams({ symbol, limit: String(effectiveLimit) });
  const url = `${BINANCE_REST_BASE}/fapi/v1/trades?${search.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance trades ${res.status} for ${symbol}`);
  }
  const raw = (await res.json()) as RawBinanceTrade[];
  const trades: BinanceTrade[] = raw
    .map((t) => ({
      id: String(t.id),
      symbol,
      price: t.price,
      amount: t.qty,
      side: t.isBuyerMaker ? ("sell" as const) : ("buy" as const),
      timestamp: t.time,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
  return { symbol, trades };
}

type KlineHandler = (channel: string, data: BinanceWsKlineUpdate) => void;
type OrderbookHandler = (data: BinanceWsOrderbookUpdate) => void;
type TradeHandler = (data: BinanceWsTradeUpdate) => void;

/**
 * Shared Binance Futures WebSocket connection that multiplexes kline, depth,
 * and aggregate trade streams.
 */
export class BinanceMarketStream {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000;
  private reconnectTimer: number | null = null;
  private msgId = 1;
  private subscriptions: Set<string> = new Set();

  private klineHandlers: Set<KlineHandler> = new Set();
  private orderbookHandlers: Set<OrderbookHandler> = new Set();
  private tradeHandlers: Set<TradeHandler> = new Set();

  subscribeKline(apiSymbol: string, period: string): void {
    this.addSubscription(this.klineStreamName(apiSymbol, period));
  }

  unsubscribeKline(apiSymbol: string, period: string): void {
    this.removeSubscription(this.klineStreamName(apiSymbol, period));
  }

  onKline(handler: KlineHandler): () => void {
    this.klineHandlers.add(handler);
    return () => {
      this.klineHandlers.delete(handler);
    };
  }

  subscribeOrderbook(apiSymbol: string): void {
    this.addSubscription(this.depthStreamName(apiSymbol));
  }

  unsubscribeOrderbook(apiSymbol: string): void {
    this.removeSubscription(this.depthStreamName(apiSymbol));
  }

  onOrderbook(handler: OrderbookHandler): () => void {
    this.orderbookHandlers.add(handler);
    return () => {
      this.orderbookHandlers.delete(handler);
    };
  }

  subscribeTrades(apiSymbol: string): void {
    this.addSubscription(this.aggTradeStreamName(apiSymbol));
  }

  unsubscribeTrades(apiSymbol: string): void {
    this.removeSubscription(this.aggTradeStreamName(apiSymbol));
  }

  onTrade(handler: TradeHandler): () => void {
    this.tradeHandlers.add(handler);
    return () => {
      this.tradeHandlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private klineStreamName(apiSymbol: string, period: string): string {
    return `${apiSymbol.toLowerCase()}@kline_${period}`;
  }

  private depthStreamName(apiSymbol: string): string {
    return `${apiSymbol.toLowerCase()}@depth${DEPTH_STREAM_LEVELS}@${DEPTH_STREAM_INTERVAL}`;
  }

  private aggTradeStreamName(apiSymbol: string): string {
    return `${apiSymbol.toLowerCase()}@aggTrade`;
  }

  private addSubscription(stream: string): void {
    if (this.subscriptions.has(stream)) {
      this.ensureConnected();
      return;
    }
    this.subscriptions.add(stream);
    this.ensureConnected();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe([stream]);
    }
  }

  private removeSubscription(stream: string): void {
    if (!this.subscriptions.has(stream)) return;
    this.subscriptions.delete(stream);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe([stream]);
    }
    if (this.subscriptions.size === 0) {
      this.closeSocket();
    }
  }

  private ensureConnected(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;
    this.connect();
  }

  private connect(): void {
    this.isConnecting = true;
    try {
      const ws = new WebSocket(BINANCE_WS_BASE);
      this.ws = ws;

      ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        if (this.subscriptions.size > 0) {
          this.sendSubscribe([...this.subscriptions]);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch {
          // ignore non-JSON frames
        }
      };

      ws.onerror = () => {
        // reconnect handled in onclose
      };

      ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        if (this.subscriptions.size > 0) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.isConnecting = false;
      console.error("[BinanceMarketStream] connect error:", err);
      if (this.subscriptions.size > 0) this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    const delay = this.baseReconnectDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5));
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private closeSocket(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.reconnectAttempts = 0;
  }

  private sendSubscribe(streams: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN || streams.length === 0) return;
    this.ws.send(JSON.stringify({ method: "SUBSCRIBE", params: streams, id: this.msgId++ }));
  }

  private sendUnsubscribe(streams: string[]): void {
    if (this.ws?.readyState !== WebSocket.OPEN || streams.length === 0) return;
    this.ws.send(JSON.stringify({ method: "UNSUBSCRIBE", params: streams, id: this.msgId++ }));
  }

  private handleMessage(msg: unknown): void {
    if (!msg || typeof msg !== "object") return;
    const m = msg as Record<string, unknown>;
    switch (m.e) {
      case "kline":
        this.emitKline(m);
        return;
      case "depthUpdate":
        this.emitOrderbook(m);
        return;
      case "aggTrade":
        this.emitAggTrade(m);
        return;
      default:
        return;
    }
  }

  private emitKline(m: Record<string, unknown>): void {
    const k = m.k as Record<string, unknown> | undefined;
    if (!k) return;
    const apiSymbol = String(m.s ?? "").toUpperCase();
    const period = String(k.i ?? "");
    if (!apiSymbol || !period) return;

    const channel = `kline:${apiSymbol}:${period}`;
    const data: BinanceWsKlineUpdate = {
      time: Math.floor(Number(k.t) / 1000),
      open: String(k.o),
      high: String(k.h),
      low: String(k.l),
      close: String(k.c),
      volume: String(k.v),
      quote_volume: k.q !== undefined ? String(k.q) : undefined,
      trade_count: typeof k.n === "number" ? (k.n as number) : undefined,
      is_final: Boolean(k.x),
    };
    this.klineHandlers.forEach((h) => {
      try {
        h(channel, data);
      } catch (err) {
        console.error("[BinanceMarketStream] kline handler error:", err);
      }
    });
  }

  private emitOrderbook(m: Record<string, unknown>): void {
    const apiSymbol = String(m.s ?? "").toUpperCase();
    if (!apiSymbol) return;
    const rawBids = (m.b as [string, string][] | undefined) ?? [];
    const rawAsks = (m.a as [string, string][] | undefined) ?? [];
    const timestamp = typeof m.E === "number" ? (m.E as number) : typeof m.T === "number" ? (m.T as number) : Date.now();
    const data: BinanceWsOrderbookUpdate = {
      symbol: apiSymbol,
      bids: rawBids.map(([price, size]) => ({ price, size })),
      asks: rawAsks.map(([price, size]) => ({ price, size })),
      timestamp,
    };
    this.orderbookHandlers.forEach((h) => {
      try {
        h(data);
      } catch (err) {
        console.error("[BinanceMarketStream] orderbook handler error:", err);
      }
    });
  }

  private emitAggTrade(m: Record<string, unknown>): void {
    const apiSymbol = String(m.s ?? "").toUpperCase();
    if (!apiSymbol) return;
    const price = String(m.p ?? "");
    const qty = String(m.q ?? "");
    const timestamp = typeof m.T === "number" ? (m.T as number) : Date.now();
    const id = String(m.a ?? `${apiSymbol}-${timestamp}-${price}-${qty}`);
    const isBuyerMaker = Boolean(m.m);
    const data: BinanceWsTradeUpdate = {
      symbol: apiSymbol,
      id,
      price,
      amount: qty,
      size: qty,
      side: isBuyerMaker ? "sell" : "buy",
      timestamp,
    };
    this.tradeHandlers.forEach((h) => {
      try {
        h(data);
      } catch (err) {
        console.error("[BinanceMarketStream] trade handler error:", err);
      }
    });
  }
}

let sharedStream: BinanceMarketStream | null = null;

export function getBinanceMarketStream(): BinanceMarketStream {
  if (!sharedStream) sharedStream = new BinanceMarketStream();
  return sharedStream;
}

// Backward-compat alias for the prior kline-only export.
export const getBinanceKlineStream = getBinanceMarketStream;
export type BinanceKlineStream = BinanceMarketStream;

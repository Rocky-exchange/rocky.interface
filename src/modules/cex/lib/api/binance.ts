/**
 * Binance Futures data source for K-line candles (REST) and kline streams (WebSocket).
 *
 * REST:  https://fapi.binance.com/fapi/v1/klines
 * WS:    wss://fstream.binance.com/ws/<symbol>@kline_<interval>
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

const BINANCE_REST_BASE = "https://fapi.binance.com";
const BINANCE_WS_BASE = "wss://fstream.binance.com/ws";
const BINANCE_MAX_LIMIT = 1500;

type RawBinanceKline = [
  number, // openTime ms
  string, // open
  string, // high
  string, // low
  string, // close
  string, // base volume
  number, // closeTime ms
  string, // quote volume
  number, // number of trades
  string, // taker buy base
  string, // taker buy quote
  string, // ignore
];

export async function fetchBinanceCandles(
  apiSymbol: string,
  params: { period: string; limit?: number; start?: number; end?: number }
): Promise<BinanceCandlesResponse> {
  const search = new URLSearchParams();
  const symbol = apiSymbol.toUpperCase();
  search.set("symbol", symbol);
  search.set("interval", params.period);
  if (params.limit !== undefined) {
    search.set("limit", Math.min(Math.max(1, params.limit), BINANCE_MAX_LIMIT).toString());
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

type KlineHandler = (channel: string, data: BinanceWsKlineUpdate) => void;

export class BinanceKlineStream {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000;
  private reconnectTimer: number | null = null;
  private msgId = 1;
  private subscriptions: Set<string> = new Set();
  private handlers: Set<KlineHandler> = new Set();

  subscribe(apiSymbol: string, period: string): void {
    const stream = this.streamName(apiSymbol, period);
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

  unsubscribe(apiSymbol: string, period: string): void {
    const stream = this.streamName(apiSymbol, period);
    if (!this.subscriptions.has(stream)) return;
    this.subscriptions.delete(stream);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendUnsubscribe([stream]);
    }
    if (this.subscriptions.size === 0) {
      this.closeSocket();
    }
  }

  onKline(handler: KlineHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private streamName(apiSymbol: string, period: string): string {
    return `${apiSymbol.toLowerCase()}@kline_${period}`;
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
      console.error("[BinanceKlineStream] connect error:", err);
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
    const m = msg as { e?: string; s?: string; k?: Record<string, unknown> };
    if (m.e !== "kline" || !m.k) return;
    const k = m.k;
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

    this.handlers.forEach((h) => {
      try {
        h(channel, data);
      } catch (err) {
        console.error("[BinanceKlineStream] handler error:", err);
      }
    });
  }
}

let sharedStream: BinanceKlineStream | null = null;

export function getBinanceKlineStream(): BinanceKlineStream {
  if (!sharedStream) sharedStream = new BinanceKlineStream();
  return sharedStream;
}

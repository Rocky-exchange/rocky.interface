/**
 * ZTDX WebSocket Service
 * 
 * 中心化的 ZTDX WebSocket 服务
 * 使用配置的 WebSocket URL
 */

import { getStoredToken } from "./client";

// WebSocket message types (re-export from main websocket for type compatibility)
export interface WsMessage {
  type: string;
  channel?: string;
  symbol?: string;
  data?: unknown;
}

export interface WsPositionUpdate {
  id: string;
  position_id?: string;
  symbol: string;
  side: "long" | "short";
  size: string;
  entry_price: string;
  mark_price: string;
  liquidation_price?: string;
  unrealized_pnl: string;
  leverage: number;
  margin?: string;
  updated_at?: number;
  event?: "opened" | "updated" | "closed" | "liquidated";
}

export interface WsOrderUpdate {
  id: string;
  order_id?: string;
  symbol: string;
  side: "long" | "short";
  order_type: string;
  price?: string;
  amount: string;
  size?: string;
  filled_amount?: string;
  filled_size?: string;
  status: string;
  updated_at?: number;
  event?: "created" | "filled" | "partially_filled" | "cancelled" | "rejected";
}

export interface WsBalanceUpdate {
  token: string;
  symbol: string;
  available: string;
  frozen: string;
  total: string;
  updated_at?: number;
}

export interface WsPriceUpdate {
  symbol: string;
  price: string;
  timestamp: number;
}

export interface WsOrderbookUpdate {
  symbol: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: number;
}

export interface WsTradeUpdate {
  symbol: string;
  id: string;
  price: string;
  amount: string;
  size?: string;
  side: "buy" | "sell";
  timestamp: number;
}

export interface WsTickerUpdate {
  symbol: string;
  last_price: string;
  price_change_24h: string;
  price_change_percent_24h: string;
  high_24h: string;
  low_24h: string;
  volume_24h: string;
  bid?: string;
  ask?: string;
  change_24h?: string;
  timestamp?: number;
}

export interface WsKlineUpdate {
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

/**
 * Normalize market symbol to API format
 * Converts various symbol formats (BTC-USD, BTC/USD, BTCUSD) to BTCUSDT
 */
export function normalizeMarketSymbolToApiFormat(symbol: string): string {
  const upper = symbol.toUpperCase();

  // Already in BTCUSDT format
  if (upper.includes("USDT")) return upper;

  // Convert BTC-USD / BTC/USD / BTCUSD to BTCUSDT
  if (upper.includes("-USD")) return upper.replace("-USD", "USDT");

  const cleaned = upper.replace("/", "").replace("-", "");
  if (cleaned.endsWith("USD")) return cleaned.replace(/USD$/, "USDT");

  // If just BTC, append USDT
  return `${cleaned}USDT`;
}

type MessageHandler = (message: WsMessage) => void;
type ErrorHandler = (error: Event) => void;
type ConnectionHandler = () => void;

// ZTDX WebSocket URL - use relative path in dev (proxied by Vite), full URL in production
// 使用统一的后端 URL 配置（根据链 ID 自动切换）
import { getX10000WsUrl } from "config/backend";

export class WebSocketService {
  private ws: WebSocket | null = null;
  private chainId: number;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions: Set<string> = new Set();
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private connectHandlers: Set<ConnectionHandler> = new Set();
  private disconnectHandlers: Set<ConnectionHandler> = new Set();
  private isConnecting = false;
  private heartbeatInterval: number | null = null;
  private heartbeatIntervalMs = 30000;
  private pongTimeout: number | null = null;
  private pongTimeoutMs = 10000;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  private getWsUrl(): string {
    // In development, use relative path /ws which will be proxied by Vite
    if (import.meta.env.DEV) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      return `${protocol}//${host}/ws`;
    }

    // In production, use configured URL based on chainId (根据链 ID 自动切换)
    const baseWsUrl = getX10000WsUrl(this.chainId);
    if (baseWsUrl) {
      // Ensure the URL ends with /ws
      if (baseWsUrl.endsWith("/ws")) {
        return baseWsUrl;
      } else {
        return `${baseWsUrl}/ws`;
      }
    }

    // Default fallback
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.getWsUrl());

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.connectHandlers.forEach((handler) => handler());
        // Try to get token (will use last address if available)
        const token = getStoredToken(null, this.chainId);
        if (token) {
          this.authenticate();
        }
        setTimeout(() => {
          this.subscriptions.forEach((sub) => {
            const isPrivateChannel = sub === "positions" || sub === "orders" || sub === "balance";
            this.sendSubscribe(sub, isPrivateChannel);
          });
        }, 100);
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch {
          console.error(" Failed to parse WebSocket message:", event.data);
        }
      };

      this.ws.onerror = (error) => {
        this.isConnecting = false;
        this.errorHandlers.forEach((handler) => handler(error));
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.stopHeartbeat();
        this.disconnectHandlers.forEach((handler) => handler());
        this.attemptReconnect();
      };
    } catch (error) {
      this.isConnecting = false;
      console.error(" WebSocket connection error:", error);
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.reconnectAttempts = this.maxReconnectAttempts;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private sendSubscribe(channel: string, requireAuth = false, address?: string | null): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const token = getStoredToken(address, this.chainId);
      if (requireAuth && token) {
        this.ws.send(JSON.stringify({ type: "subscribe", channel, token }));
      } else {
        this.ws.send(JSON.stringify({ type: "subscribe", channel }));
      }
    }
  }

  private sendUnsubscribe(channel: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", channel }));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.sendPing();
    this.heartbeatInterval = window.setInterval(() => {
      this.sendPing();
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.pongTimeout !== null) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private sendPing(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "ping" }));
        this.schedulePongTimeout();
      } catch (error) {
        console.error(" Failed to send ping:", error);
      }
    }
  }

  private schedulePongTimeout(): void {
    if (this.pongTimeout !== null) {
      clearTimeout(this.pongTimeout);
    }
    this.pongTimeout = window.setTimeout(() => {
      console.warn(" No pong received, connection may be dead. Reconnecting...");
      if (this.ws) {
        this.ws.close();
      }
    }, this.pongTimeoutMs);
  }

  private handlePong(): void {
    if (this.pongTimeout !== null) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private handleMessage(message: WsMessage): void {
    const { type, channel } = message;

    if (type === "pong") {
      this.handlePong();
      return;
    }

    const typeHandlers = this.messageHandlers.get(type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => handler(message));
    }

    if (channel) {
      const channelHandlers = this.messageHandlers.get(channel);
      if (channelHandlers) {
        channelHandlers.forEach((handler) => handler(message));
      }
    }

    const globalHandlers = this.messageHandlers.get("*");
    if (globalHandlers) {
      globalHandlers.forEach((handler) => handler(message));
    }
  }

  subscribePrices(symbols: string[]): void {
    symbols.forEach((symbol) => {
      const channel = `price:${symbol}`;
      this.subscriptions.add(channel);
      this.sendSubscribe(channel);
    });
  }

  subscribeOrderbook(symbol: string): void {
    const apiSymbol = normalizeMarketSymbolToApiFormat(symbol);
    const channel = `orderbook:${apiSymbol}`;
    this.subscriptions.add(channel);
    this.sendSubscribe(channel);
  }

  subscribeTrades(symbol: string): void {
    const apiSymbol = normalizeMarketSymbolToApiFormat(symbol);
    const channel = `trades:${apiSymbol}`;
    this.subscriptions.add(channel);
    this.sendSubscribe(channel);
  }

  subscribeTicker(symbol: string): void {
    const apiSymbol = normalizeMarketSymbolToApiFormat(symbol);
    const channel = `ticker:${apiSymbol}`;
    this.subscriptions.add(channel);
    this.sendSubscribe(channel);
  }

  subscribeAllTrades(): void {
    const channel = "trades:*";
    this.subscriptions.add(channel);
    this.sendSubscribe(channel);
  }

  unsubscribePrices(symbols: string[]): void {
    symbols.forEach((symbol) => {
      const channel = `price:${symbol}`;
      this.subscriptions.delete(channel);
      this.sendUnsubscribe(channel);
    });
  }

  unsubscribeOrderbook(symbol: string): void {
    const apiSymbol = normalizeMarketSymbolToApiFormat(symbol);
    const channel = `orderbook:${apiSymbol}`;
    this.subscriptions.delete(channel);
    this.sendUnsubscribe(channel);
  }

  unsubscribeTrades(symbol: string): void {
    const apiSymbol = normalizeMarketSymbolToApiFormat(symbol);
    const channel = `trades:${apiSymbol}`;
    this.subscriptions.delete(channel);
    this.sendUnsubscribe(channel);
  }

  unsubscribeTicker(symbol: string): void {
    const apiSymbol = normalizeMarketSymbolToApiFormat(symbol);
    const channel = `ticker:${apiSymbol}`;
    this.subscriptions.delete(channel);
    this.sendUnsubscribe(channel);
  }

  subscribeKline(symbol: string, period: string): void {
    // Normalize symbol to API format (ETH-USD -> ETHUSDT)
    const apiSymbol = normalizeMarketSymbolToApiFormat(symbol);
    const channel = `kline:${apiSymbol}:${period}`;
    this.subscriptions.add(channel);
    // Subscribe to K-line channel
    this.sendSubscribe(channel);
  }

  unsubscribeKline(symbol: string, period: string): void {
    // Normalize symbol to API format (ETH-USD -> ETHUSDT)
    const apiSymbol = normalizeMarketSymbolToApiFormat(symbol);
    const channel = `kline:${apiSymbol}:${period}`;
    this.subscriptions.delete(channel);
    // Unsubscribe from K-line channel
    this.sendUnsubscribe(channel);
  }

  authenticate(address?: string | null): void {
    const token = getStoredToken(address, this.chainId);
    if (token && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "auth", token }));
    }
  }

  authenticateWithSignature(address: string, signature: string, timestamp: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "auth",
          address,
          signature,
          timestamp,
        })
      );
    }
  }

  subscribePositions(address?: string | null): void {
    const channel = "positions";
    this.subscriptions.add(channel);
    this.sendSubscribe(channel, true, address);
  }

  subscribeOrders(address?: string | null): void {
    const channel = "orders";
    this.subscriptions.add(channel);
    this.sendSubscribe(channel, true, address);
  }

  subscribeBalances(address?: string | null): void {
    const channel = "balance";
    this.subscriptions.add(channel);
    this.sendSubscribe(channel, true, address);
  }

  unsubscribePositions(): void {
    const channel = "positions";
    this.subscriptions.delete(channel);
    this.sendUnsubscribe(channel);
  }

  unsubscribeOrders(): void {
    const channel = "orders";
    this.subscriptions.delete(channel);
    this.sendUnsubscribe(channel);
  }

  unsubscribeBalances(): void {
    const channel = "balance";
    this.subscriptions.delete(channel);
    this.sendUnsubscribe(channel);
  }

  unsubscribeAllTrades(): void {
    const channel = "trades:*";
    this.subscriptions.delete(channel);
    this.sendUnsubscribe(channel);
  }

  onMessage(typeOrChannel: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(typeOrChannel)) {
      this.messageHandlers.set(typeOrChannel, new Set());
    }
    this.messageHandlers.get(typeOrChannel)!.add(handler);

    return () => {
      this.messageHandlers.get(typeOrChannel)?.delete(handler);
    };
  }

  onPriceUpdate(handler: (data: WsPriceUpdate) => void): () => void {
    return this.onMessage("price", (msg) => {
      if (msg.data) {
        handler(msg.data as WsPriceUpdate);
      }
    });
  }

  onOrderbookUpdate(handler: (data: WsOrderbookUpdate) => void): () => void {
    return this.onMessage("orderbook", (msg) => {
      // Orderbook data can be either in msg.data or directly in msg
      const orderbookData = (msg.data || msg) as WsOrderbookUpdate;

      if (orderbookData && orderbookData.symbol) {
        // Convert [string, string][] format to Array<{ price: string; size: string }> if needed
        const normalizedData: WsOrderbookUpdate = {
          symbol: orderbookData.symbol,
          timestamp: orderbookData.timestamp,
          bids: Array.isArray(orderbookData.bids) && orderbookData.bids.length > 0
            ? Array.isArray(orderbookData.bids[0])
              ? (orderbookData.bids as [string, string][]).map(([price, size]) => ({ price, size }))
              : orderbookData.bids
            : [],
          asks: Array.isArray(orderbookData.asks) && orderbookData.asks.length > 0
            ? Array.isArray(orderbookData.asks[0])
              ? (orderbookData.asks as [string, string][]).map(([price, size]) => ({ price, size }))
              : orderbookData.asks
            : [],
        };

        handler(normalizedData);
      }
    });
  }

  onTradeUpdate(handler: (data: WsTradeUpdate) => void): () => void {
    return this.onMessage("trade", (msg) => {
      // Trade data can be either in msg.data or directly in msg (some backends do not wrap payload)
      const tradeData = (msg.data || msg) as WsTradeUpdate;
      if (tradeData && tradeData.symbol) {
        // Generate id if missing
        if (!tradeData.id) {
          tradeData.id = `${tradeData.symbol}:${tradeData.timestamp}:${tradeData.price}:${tradeData.amount}:${tradeData.side}`;
        }
        // Map "amount" to "size" for backward compatibility
        if (tradeData.amount && !tradeData.size) {
          tradeData.size = tradeData.amount;
        }
        handler(tradeData);
      }
    });
  }

  onTickerUpdate(handler: (data: WsTickerUpdate) => void): () => void {
    return this.onMessage("ticker", (msg) => {
      // Ticker data can be either in msg.data or directly in msg (some backends do not wrap payload)
      const tickerData = (msg.data || msg) as WsTickerUpdate;
      if (tickerData && tickerData.symbol) {
        handler(tickerData);
      }
    });
  }

  onKlineUpdate(handler: (channel: string, data: WsKlineUpdate) => void): () => void {
    // 后端 serde(tag="type", rename_all="snake_case") 把 KlineSnapshot 序列化为 "kline_snapshot",
    // 且 data 是单个 KlineData(不是数组)。早期实现监听 "klinesnapshot" + Array.isArray,两处都对不上,
    // 订阅后首个快照被静默丢掉,TVChart 只剩 REST 历史 → 看起来不动。
    const klineHandler = (msg: WsMessage) => {
      if (!msg.channel || !msg.data) return;
      if (msg.type === "kline_snapshot" || msg.type === "kline") {
        if (Array.isArray(msg.data)) {
          const candles = (msg.data as WsKlineUpdate[]).slice().sort((a, b) => {
            const timeA = a.time < 1e10 ? a.time : a.time / 1000;
            const timeB = b.time < 1e10 ? b.time : b.time / 1000;
            return timeA - timeB;
          });
          candles.forEach((candle) => handler(msg.channel!, candle));
        } else {
          handler(msg.channel, msg.data as WsKlineUpdate);
        }
      }
    };

    const unsubscribeKline = this.onMessage("kline", klineHandler);
    const unsubscribeSnapshot = this.onMessage("kline_snapshot", klineHandler);

    return () => {
      unsubscribeKline();
      unsubscribeSnapshot();
    };
  }

  onPositionUpdate(handler: (data: WsPositionUpdate) => void): () => void {
    return this.onMessage("position", (msg) => {
      if (msg.data) {
        const data = msg.data as WsPositionUpdate;
        if (data.id && !data.position_id) {
          data.position_id = data.id;
        }
        handler(data);
      }
    });
  }

  onOrderUpdate(handler: (data: WsOrderUpdate) => void): () => void {
    return this.onMessage("order", (msg) => {
      if (msg.data) {
        const data = msg.data as WsOrderUpdate;
        if (data.id && !data.order_id) {
          data.order_id = data.id;
        }
        if (data.amount && !data.size) {
          data.size = data.amount;
        }
        if (data.filled_amount && !data.filled_size) {
          data.filled_size = data.filled_amount;
        }
        handler(data);
      }
    });
  }

  onBalanceUpdate(handler: (data: WsBalanceUpdate) => void): () => void {
    return this.onMessage("balance", (msg) => {
      if (msg.data) {
        handler(msg.data as WsBalanceUpdate);
      }
    });
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => {
      this.connectHandlers.delete(handler);
    };
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => {
      this.disconnectHandlers.delete(handler);
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

// Singleton instances per chain
const wsInstances: Map<number, WebSocketService> = new Map();

export function getWebSocketService(chainId: number): WebSocketService {
  if (!wsInstances.has(chainId)) {
    wsInstances.set(chainId, new WebSocketService(chainId));
  }
  return wsInstances.get(chainId)!;
}

// Alias for backward compatibility
export function getX10000WebSocketService(chainId: number): WebSocketService {
  return getWebSocketService(chainId);
}

export function disconnectAllWebSockets(): void {
  wsInstances.forEach((ws) => ws.disconnect());
  wsInstances.clear();
}

// Alias for backward compatibility
export function disconnectAllX10000WebSockets(): void {
  disconnectAllWebSockets();
}


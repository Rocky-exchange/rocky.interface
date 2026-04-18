/**
 * Shared Types
 */

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type OrderStatus = 'pending' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
export type PositionSide = 'long' | 'short';

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minOrderSize: string;
  maxLeverage: number;
  makerFee: string;
  takerFee: string;
}

export interface OrderbookLevel {
  price: string;
  amount: string;
}

export interface Orderbook {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export interface Trade {
  id: string;
  symbol: string;
  price: string;
  amount: string;
  side: OrderSide;
  timestamp: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  size: string;
  entryPrice: string;
  markPrice: string;
  leverage: number;
  liquidationPrice: string;
  margin: string;
  unrealizedPnl: string;
  unrealizedPnlPercent: string;
  realizedPnl: string;
}

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: string | null;
  amount: string;
  filledAmount: string;
  leverage: number;
  status: OrderStatus;
  createdAt: number;
}

export interface Balance {
  token: string;
  available: string;
  frozen: string;
  total: string;
}

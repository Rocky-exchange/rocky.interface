/**
 * Market API
 */

import { apiClient, ApiResponse } from './client';

export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minOrderSize: string;
  maxLeverage: number;
  makerFee: string;
  takerFee: string;
}

export interface MarketsResponse {
  markets: Market[];
}

export interface OrderbookEntry {
  price: string;
  amount: string;
}

export interface OrderbookResponse {
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
  timestamp: number;
}

export interface TradeRecord {
  id: string;
  price: string;
  amount: string;
  side: string;
  timestamp: number;
}

export interface TradesResponse {
  symbol: string;
  trades: TradeRecord[];
}

export interface TickerResponse {
  symbol: string;
  lastPrice: string;
  priceChange24h: string;
  priceChangePercent24h: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  openInterest: string;
  fundingRate: string;
  nextFundingTime: number;
}

/**
 * Get all markets
 */
export async function getMarkets(): Promise<ApiResponse<MarketsResponse>> {
  return apiClient.get<MarketsResponse>('/markets');
}

/**
 * Get orderbook for a symbol
 */
export async function getOrderbook(symbol: string): Promise<ApiResponse<OrderbookResponse>> {
  return apiClient.get<OrderbookResponse>(`/markets/${symbol}/orderbook`);
}

/**
 * Get recent trades for a symbol
 */
export async function getTrades(symbol: string): Promise<ApiResponse<TradesResponse>> {
  return apiClient.get<TradesResponse>(`/markets/${symbol}/trades`);
}

/**
 * Get ticker for a symbol
 */
export async function getTicker(symbol: string): Promise<ApiResponse<TickerResponse>> {
  return apiClient.get<TickerResponse>(`/markets/${symbol}/ticker`);
}

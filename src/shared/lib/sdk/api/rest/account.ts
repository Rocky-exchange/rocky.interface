/**
 * Account API
 */

import { apiClient, ApiResponse } from './client';

export interface UserProfile {
  address: string;
  referralCode: string | null;
  referrerAddress: string | null;
  createdAt: string;
}

export interface Balance {
  token: string;
  available: string;
  frozen: string;
  total: string;
}

export interface BalancesResponse {
  balances: Balance[];
}

export interface Position {
  positionId: string;
  symbol: string;
  side: 'long' | 'short';
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

export interface PositionsResponse {
  positions: Position[];
}

export interface Order {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price: string | null;
  amount: string;
  filledAmount: string;
  leverage: number;
  status: 'pending' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
  createdAt: string;
}

export interface OrdersResponse {
  orders: Order[];
}

export interface Trade {
  id: string;
  symbol: string;
  side: string;
  price: string;
  amount: string;
  fee: string;
  realizedPnl: string;
  timestamp: number;
}

export interface TradesResponse {
  trades: Trade[];
}

/**
 * Get user profile
 */
export async function getProfile(): Promise<ApiResponse<UserProfile>> {
  return apiClient.get<UserProfile>('/account/profile');
}

/**
 * Get user balances
 */
export async function getBalances(): Promise<ApiResponse<BalancesResponse>> {
  return apiClient.get<BalancesResponse>('/account/balances');
}

/**
 * Get user positions
 */
export async function getPositions(): Promise<ApiResponse<PositionsResponse>> {
  return apiClient.get<PositionsResponse>('/account/positions');
}

/**
 * Get user orders
 */
export async function getOrders(
  status?: 'open' | 'closed' | 'all',
  symbol?: string
): Promise<ApiResponse<OrdersResponse>> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (symbol) params.set('symbol', symbol);

  const query = params.toString();
  return apiClient.get<OrdersResponse>(`/account/orders${query ? `?${query}` : ''}`);
}

/**
 * Get user trades
 */
export async function getTrades(symbol?: string): Promise<ApiResponse<TradesResponse>> {
  const query = symbol ? `?symbol=${symbol}` : '';
  return apiClient.get<TradesResponse>(`/account/trades${query}`);
}

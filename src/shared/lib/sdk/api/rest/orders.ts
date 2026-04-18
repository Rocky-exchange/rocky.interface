/**
 * Orders API
 */

import { apiClient, ApiResponse } from './client';

export interface CreateOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price?: string;
  amount: string;
  leverage: number;
  signature: string;
  timestamp: number;
}

export interface OrderResponse {
  orderId: string;
  status: string;
  createdAt: string;
}

export interface CancelOrderRequest {
  signature: string;
  timestamp: number;
}

export interface BatchCancelRequest {
  orderIds: string[];
  signature: string;
  timestamp: number;
}

export interface BatchCancelResponse {
  cancelled: string[];
  failed: string[];
}

/**
 * Create a new order
 */
export async function createOrder(
  request: CreateOrderRequest
): Promise<ApiResponse<OrderResponse>> {
  return apiClient.post<OrderResponse>('/orders', request);
}

/**
 * Cancel an order
 */
export async function cancelOrder(
  orderId: string,
  request: CancelOrderRequest
): Promise<ApiResponse<OrderResponse>> {
  return apiClient.delete<OrderResponse>(`/orders/${orderId}`, request);
}

/**
 * Batch cancel orders
 */
export async function batchCancelOrders(
  request: BatchCancelRequest
): Promise<ApiResponse<BatchCancelResponse>> {
  return apiClient.post<BatchCancelResponse>('/orders/batch', request);
}

/**
 * Helper to create order message for signing
 */
export function createOrderMessage(
  symbol: string,
  side: 'buy' | 'sell',
  orderType: 'limit' | 'market',
  price: string | undefined,
  amount: string,
  leverage: number,
  timestamp: number
): string {
  return JSON.stringify({
    action: 'create_order',
    symbol,
    side,
    orderType,
    price: price || '0',
    amount,
    leverage,
    timestamp,
  });
}

/**
 * Helper to create cancel message for signing
 */
export function createCancelMessage(orderId: string, timestamp: number): string {
  return JSON.stringify({
    action: 'cancel_order',
    orderId,
    timestamp,
  });
}

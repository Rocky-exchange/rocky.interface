/**
 * Withdraw API
 */

import { apiClient, ApiResponse } from './client';

export interface WithdrawRequest {
  token: string;
  amount: string;
  toAddress: string;
  signature: string;
  timestamp: number;
}

export interface WithdrawResponse {
  withdrawId: string;
  backendSignature: string;
  nonce: number;
  expiry: number;
  contractAddress: string;
}

export interface WithdrawRecord {
  id: string;
  token: string;
  amount: string;
  toAddress: string;
  status: string;
  txHash: string | null;
  createdAt: number;
}

export interface WithdrawHistoryResponse {
  withdrawals: WithdrawRecord[];
}

/**
 * Request withdrawal - get backend signature
 */
export async function requestWithdraw(
  request: WithdrawRequest
): Promise<ApiResponse<WithdrawResponse>> {
  return apiClient.post<WithdrawResponse>('/withdraw/request', request);
}

/**
 * Get withdrawal history
 */
export async function getWithdrawHistory(): Promise<ApiResponse<WithdrawHistoryResponse>> {
  return apiClient.get<WithdrawHistoryResponse>('/withdraw/history');
}

/**
 * Helper to create withdraw message for signing
 */
export function createWithdrawMessage(
  token: string,
  amount: string,
  toAddress: string,
  timestamp: number
): string {
  return JSON.stringify({
    action: 'withdraw',
    token,
    amount,
    toAddress,
    timestamp,
  });
}

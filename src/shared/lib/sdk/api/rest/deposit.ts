/**
 * Deposit API
 */

import { apiClient, ApiResponse } from './client';

export interface PrepareDepositRequest {
  token: string;
  amount: string;
}

export interface PrepareDepositResponse {
  contractAddress: string;
  tokenAddress: string;
  amount: string;
  estimatedGas: number;
}

export interface DepositRecord {
  id: string;
  token: string;
  amount: string;
  txHash: string;
  status: string;
  createdAt: number;
}

export interface DepositHistoryResponse {
  deposits: DepositRecord[];
}

/**
 * Prepare deposit - get contract call parameters
 */
export async function prepareDeposit(
  request: PrepareDepositRequest
): Promise<ApiResponse<PrepareDepositResponse>> {
  return apiClient.post<PrepareDepositResponse>('/deposit/prepare', request);
}

/**
 * Get deposit history
 */
export async function getDepositHistory(): Promise<ApiResponse<DepositHistoryResponse>> {
  return apiClient.get<DepositHistoryResponse>('/deposit/history');
}

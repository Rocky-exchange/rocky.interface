/**
 * Referral API
 */

import { apiClient, ApiResponse } from './client';

export interface CreateCodeRequest {
  signature: string;
  timestamp: number;
}

export interface CreateCodeResponse {
  code: string;
  createdAt: number;
}

export interface BindCodeRequest {
  code: string;
  signature: string;
  timestamp: number;
}

export interface BindCodeResponse {
  success: boolean;
  referrerAddress: string;
}

export interface ReferralActivity {
  refereeAddress: string;
  amount: string;
  token: string;
  createdAt: string;
}

export interface ReferralDashboard {
  code: string | null;
  totalReferrals: number;
  totalEarnings: string;
  pendingEarnings: string;
  recentActivity: ReferralActivity[];
}

export interface ClaimResponse {
  contractCalldata: string;
  amount: string;
}

/**
 * Create a new referral code
 */
export async function createReferralCode(
  request: CreateCodeRequest
): Promise<ApiResponse<CreateCodeResponse>> {
  return apiClient.post<CreateCodeResponse>('/referral/codes', request);
}

/**
 * Bind to a referral code
 */
export async function bindReferralCode(
  request: BindCodeRequest
): Promise<ApiResponse<BindCodeResponse>> {
  return apiClient.post<BindCodeResponse>('/referral/bind', request);
}

/**
 * Get referral dashboard
 */
export async function getReferralDashboard(): Promise<ApiResponse<ReferralDashboard>> {
  return apiClient.get<ReferralDashboard>('/referral/dashboard');
}

/**
 * Claim referral earnings
 */
export async function claimReferralEarnings(): Promise<ApiResponse<ClaimResponse>> {
  return apiClient.post<ClaimResponse>('/referral/claim', {});
}

/**
 * Helper to create referral code message for signing
 */
export function createReferralCodeMessage(timestamp: number): string {
  return JSON.stringify({
    action: 'create_referral_code',
    timestamp,
  });
}

/**
 * Helper to create bind referral message for signing
 */
export function createBindReferralMessage(code: string, timestamp: number): string {
  return JSON.stringify({
    action: 'bind_referral',
    code,
    timestamp,
  });
}

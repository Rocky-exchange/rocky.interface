/**
 * Authentication API
 */

import { apiClient, ApiResponse } from './client';

export interface NonceResponse {
  nonce: number;
  message: string;
}

export interface LoginRequest {
  address: string;
  signature: string;
  timestamp: number;
}

export interface LoginResponse {
  token: string;
  expiresAt: number;
}

/**
 * Get nonce for signing
 */
export async function getNonce(address: string): Promise<ApiResponse<NonceResponse>> {
  return apiClient.get<NonceResponse>(`/auth/nonce/${address}`);
}

/**
 * Login with wallet signature
 */
export async function login(request: LoginRequest): Promise<ApiResponse<LoginResponse>> {
  return apiClient.post<LoginResponse>('/auth/login', request);
}

/**
 * Full login flow with wallet
 */
export async function loginWithWallet(
  address: string,
  signMessage: (message: string) => Promise<string>
): Promise<string> {
  // Get nonce
  const nonceResponse = await getNonce(address);
  if (!nonceResponse.success || !nonceResponse.data) {
    throw new Error(nonceResponse.error?.message || 'Failed to get nonce');
  }

  // Sign message
  const signature = await signMessage(nonceResponse.data.message);

  // Login
  const loginResponse = await login({
    address,
    signature,
    timestamp: Math.floor(Date.now() / 1000),
  });

  if (!loginResponse.success || !loginResponse.data) {
    throw new Error(loginResponse.error?.message || 'Login failed');
  }

  // Store token
  const token = loginResponse.data.token;
  apiClient.setToken(token);
  localStorage.setItem('rocky_token', token);
  localStorage.setItem('rocky_token_expiry', loginResponse.data.expiresAt.toString());

  return token;
}

/**
 * Logout
 */
export function logout() {
  apiClient.clearToken();
  localStorage.removeItem('rocky_token');
  localStorage.removeItem('rocky_token_expiry');
}

/**
 * Restore session from localStorage
 */
export function restoreSession(): boolean {
  const token = localStorage.getItem('rocky_token');
  const expiry = localStorage.getItem('rocky_token_expiry');

  if (token && expiry) {
    const expiryTime = parseInt(expiry, 10);
    if (expiryTime > Math.floor(Date.now() / 1000)) {
      apiClient.setToken(token);
      return true;
    }
  }

  return false;
}

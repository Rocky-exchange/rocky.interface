/**
 * Rocky API Client
 * REST API client for the Rocky Trading Platform
 */

import { signTypedData, getAccount } from '@wagmi/core';

export interface ApiConfig {
  baseUrl: string;
  wsUrl: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  timestamp: number;
}

export class RockyApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl;
  }

  /**
   * Set authentication token
   */
  setToken(token: string) {
    this.token = token;
  }

  /**
   * Clear authentication token
   */
  clearToken() {
    this.token = null;
  }

  /**
   * Make an authenticated request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.json();
  }

  /**
   * GET request
   */
  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path);
  }

  /**
   * POST request
   */
  async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body);
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, body);
  }
}

// Default API client instance
export const apiClient = new RockyApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'https://api.primit.xyz/v1',
  wsUrl: import.meta.env.VITE_WS_URL || 'wss://api.primit.xyz/v1',
});

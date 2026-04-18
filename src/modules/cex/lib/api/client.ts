import { getServerBaseUrl } from "config/backend";

import type {
  ApiError,
  NonceResponse,
  LoginRequest,
  LoginResponse,
  Market,
  Orderbook,
  Trade,
  Ticker,
  PriceResponse,
  FundingRate,
  FundingHistory,
  OnChainDashboard,
  ClaimableAmount,
  OperatorStatus,
  Position,
  Order,
  AccountBalance,
  CreateOrderRequest,
  OrderPreviewRequest,
  OrderPreviewResponse,
  BatchCancelRequest,
  BatchCancelResponse,
  ClosePositionRequest,
  CollateralRequest,
} from "./types";

const JWT_STORAGE_KEY = "rocky_jwt_token";
const JWT_EXPIRY_KEY = "rocky_jwt_expiry";

// ============================================
// Token Management
// ============================================
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(JWT_STORAGE_KEY);
  const expiry = localStorage.getItem(JWT_EXPIRY_KEY);
  if (token && expiry) {
    if (Date.now() < parseInt(expiry, 10) * 1000) {
      return token;
    }
    clearStoredToken();
  }
  return null;
}

export function setStoredToken(token: string, expiresAt: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(JWT_STORAGE_KEY, token);
  localStorage.setItem(JWT_EXPIRY_KEY, expiresAt.toString());
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(JWT_STORAGE_KEY);
  localStorage.removeItem(JWT_EXPIRY_KEY);
}

// Removed: isAuthenticated() - not used, use custom/client.ts version instead

// ============================================
// Core Fetch Wrapper
// ============================================
interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

async function apiFetch<T>(chainId: number, path: string, options: FetchOptions = {}): Promise<T> {
  const baseUrl = getServerBaseUrl(chainId);
  const url = `${baseUrl}/api/v1${path}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (options.requireAuth) {
    const token = getStoredToken();
    if (!token) {
      throw new Error("Authentication required");
    }
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: ApiError;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = {
        error: "request_failed",
        message: `Request failed with status ${response.status}`,
      };
    }

    throw errorData;
  }

  return response.json();
}

// ============================================
// Auth API
// ============================================
export async function getNonce(chainId: number, address: string): Promise<NonceResponse> {
  return apiFetch<NonceResponse>(chainId, `/auth/nonce/${address}`);
}

export async function login(chainId: number, request: LoginRequest): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>(chainId, "/auth/login", {
    method: "POST",
    body: JSON.stringify(request),
  });
  setStoredToken(response.token, response.expires_at);
  return response;
}

export function logout(): void {
  clearStoredToken();
}

// ============================================
// Public Market API
// ============================================
export interface MarketsResponse {
  markets: Market[];
  total: number;
}

export interface MarketDetailsResponse {
  symbol: string;
  market_name: string;
  base_asset: string;
  quote_asset: string;
  description: string | null;
  min_base_amount: string;
  min_usd_amount: string;
  price_step: string;
  lot_size: string;
  max_leverage: number;
  initial_margin_fraction: string;
  maintenance_margin_fraction: string;
  close_out_margin_fraction: string;
  market_cap: string | null;
  fully_diluted_valuation: string | null;
  market_cap_updated_at: number | null;
  mark_price: string | null;
  last_price: string | null;
  funding_rate: string | null;
  next_funding_time: number | null;
  listing_phase: string | null;
  status: string | null;
}

export async function getMarkets(chainId: number, limit?: number): Promise<MarketsResponse> {
  const queryParams = limit ? `?limit=${limit}` : "";
  return apiFetch<MarketsResponse>(chainId, `/external/markets${queryParams}`);
}

export async function getMarketDetails(chainId: number, symbol: string): Promise<MarketDetailsResponse> {
  const apiSymbol = convertSymbolToApiFormat(symbol).toLowerCase();
  return apiFetch<MarketDetailsResponse>(chainId, `/markets/${apiSymbol}/details`);
}

export async function getOrderbook(chainId: number, symbol: string): Promise<Orderbook> {
  // Convert symbol to API format (BTCUSDT)
  const apiSymbol = convertSymbolToApiFormat(symbol);
  return apiFetch<Orderbook>(chainId, `/external/markets/${apiSymbol}/orderbook`);
}

export interface TradesResponse {
  symbol: string;
  trades: Trade[];
}

export async function getTrades(chainId: number, symbol: string): Promise<TradesResponse> {
  // Convert symbol to API format (BTCUSDT)
  const apiSymbol = convertSymbolToApiFormat(symbol);
  return apiFetch<TradesResponse>(chainId, `/external/markets/${apiSymbol}/trades`);
}

// Helper to convert symbol format (e.g., "BTC-USD" -> "BTCUSDT")
function convertSymbolToApiFormat(symbol: string): string {
  // If already in BTCUSDT format, return as is
  if (symbol.includes("USDT")) {
    return symbol.toUpperCase();
  }
  // Convert BTC-USD to BTCUSDT
  if (symbol.includes("-USD")) {
    return symbol.replace("-USD", "USDT").toUpperCase();
  }
  // If just BTC, append USDT
  return `${symbol}USDT`.toUpperCase();
}

export async function getTicker(chainId: number, symbol: string): Promise<Ticker> {
  // Convert symbol to API format (BTCUSDT)
  const apiSymbol = convertSymbolToApiFormat(symbol);
  return apiFetch<Ticker>(chainId, `/external/markets/${apiSymbol}/ticker`);
}

export async function getPrice(chainId: number, symbol: string): Promise<PriceResponse> {
  // Convert symbol to API format (BTCUSDT)
  const apiSymbol = convertSymbolToApiFormat(symbol);
  // price endpoint relies on ticker or specific price endpoint, backend has /external/markets/:symbol/ticker
  // but no specific /external/markets/:symbol/price.
  // However, the standard /markets/:symbol/price exists.
  // The user asked to "change frontend data interface... changed to external interface".
  // If external doesn't have price, I might need to derive it or keep using standard if allowed,
  // but better to check if I can use ticker instead or if I should assume /external/markets/:symbol/price exists?
  // Checking backend routes again: `.route("/external/markets/:symbol/price", ...)` is NOT present.
  // It has ticker, orderbook, trades, candles.
  // `getTicker` returns Ticker which has `last_price`.
  // `PriceResponse` has `mark_price`, `index_price`, `last_price`, `bid_price`, `ask_price`, `funding_rate`.
  // `get_ticker` from hyperliquid (backend implementation) might have some of this.
  // But strictly speaking, if /external/price is missing, I should probably use /external/ticker for price info if possible,
  // or maybe the user implies I should rely on what IS available.
  // Let's leave getPrice as is for now or use standard endpoint if external is missing?
  // Actually, standard endpoint `get_price` uses `handlers::market::get_price`.
  // The user said "change frontend data interface... to external interface".
  // I will assume for now only the ones I saw in `external.rs` should be changed.
  // External interface in backend: markets, ticker, orderbook, trades, candles.
  // So I will only change those.
  return apiFetch<PriceResponse>(chainId, `/markets/${apiSymbol}/price`);
}

// ============================================
// Public Funding Rate API
// ============================================
export interface FundingRatesResponse {
  rates: FundingRate[];
}

export async function getAllFundingRates(chainId: number): Promise<FundingRatesResponse> {
  return apiFetch<FundingRatesResponse>(chainId, "/funding-rates");
}

export async function getFundingRate(chainId: number, symbol: string): Promise<FundingRate> {
  return apiFetch<FundingRate>(chainId, `/funding-rates/${symbol}`);
}

export async function getFundingHistory(
  chainId: number,
  symbol: string,
  params?: { period?: string; limit?: number }
): Promise<FundingHistory[]> {
  const query = new URLSearchParams();
  if (params?.period) query.set("period", params.period);
  if (params?.limit != null) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<FundingHistory[]>(chainId, `/funding-rates/${symbol}/history${suffix}`);
}

// ============================================
// Public Referral API (On-Chain)
// ============================================
export async function getOnChainDashboard(chainId: number, address: string): Promise<OnChainDashboard> {
  return apiFetch<OnChainDashboard>(chainId, `/referral/on-chain/dashboard/${address}`);
}

export async function getOnChainClaimable(chainId: number, address: string): Promise<ClaimableAmount> {
  return apiFetch<ClaimableAmount>(chainId, `/referral/on-chain/claimable/${address}`);
}

export async function getOperatorStatus(chainId: number): Promise<OperatorStatus> {
  return apiFetch<OperatorStatus>(chainId, "/referral/on-chain/operator-status");
}

// ============================================
// Protected Account API (Requires Auth)
// ============================================
export interface PositionsResponse {
  positions: Position[];
  total_unrealized_pnl: string;
  total_collateral: string;
}

export interface OrdersResponse {
  orders: Order[];
}

export interface BalancesResponse {
  balances: AccountBalance[];
}

export async function getPositions(chainId: number): Promise<PositionsResponse> {
  return apiFetch<PositionsResponse>(chainId, "/account/positions", { requireAuth: true });
}

export async function getOrders(chainId: number): Promise<OrdersResponse> {
  return apiFetch<OrdersResponse>(chainId, "/account/orders", { requireAuth: true });
}

export interface AccountTradesResponse {
  trades: Trade[];
}

export async function getAccountTrades(chainId: number): Promise<AccountTradesResponse> {
  return apiFetch<AccountTradesResponse>(chainId, "/account/trades", { requireAuth: true });
}

// Removed: getBalances(chainId) - not used, use custom/client.ts version (with address param) instead

// ============================================
// Protected Order API (Requires Auth)
// ============================================
export interface CreateOrderResponse {
  order_id: string;
  status: string;
  filled_amount: string;
  remaining_amount: string;
  average_price: string | null;
  created_at: string;
}

export async function createOrder(chainId: number, request: CreateOrderRequest): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>(chainId, "/orders", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

/**
 * 订单预估(Order Preview)— 用户调整面板(数量、杠杆、价格)时实时查询:
 * - 预估成交价 / 预估强平价 / 变动后保证金 / 预估手续费
 * - 不需签名(Bearer Token 或 API-KEY 即可)
 */
export async function getOrderPreview(chainId: number, request: OrderPreviewRequest): Promise<OrderPreviewResponse> {
  return apiFetch<OrderPreviewResponse>(chainId, "/orders/preview", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

export interface CancelOrderRequest {
  signature: string;
  timestamp: number;
}

export interface CancelOrderResponse {
  order_id: string;
  status: string;
  created_at: string;
}

export async function cancelOrder(
  chainId: number,
  orderId: string,
  request: CancelOrderRequest
): Promise<CancelOrderResponse> {
  return apiFetch<CancelOrderResponse>(chainId, `/orders/${orderId}`, {
    method: "DELETE",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

export async function batchCancelOrders(chainId: number, request: BatchCancelRequest): Promise<BatchCancelResponse> {
  return apiFetch<BatchCancelResponse>(chainId, "/orders/batch", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

// ============================================
// Protected Position API (Requires Auth)
// ============================================
export async function closePosition(
  chainId: number,
  positionId: string,
  request?: ClosePositionRequest
): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>(chainId, `/positions/${positionId}/close`, {
    method: "POST",
    body: JSON.stringify(request || {}),
    requireAuth: true,
  });
}

export async function addPositionCollateral(
  chainId: number,
  positionId: string,
  request: CollateralRequest
): Promise<Position> {
  return apiFetch<Position>(chainId, `/positions/${positionId}/collateral/add`, {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

export async function removePositionCollateral(
  chainId: number,
  positionId: string,
  request: CollateralRequest
): Promise<Position> {
  return apiFetch<Position>(chainId, `/positions/${positionId}/collateral/remove`, {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

// Legacy alias for backward compatibility
export async function updatePositionCollateral(
  chainId: number,
  positionId: string,
  request: CollateralRequest
): Promise<Position> {
  return addPositionCollateral(chainId, positionId, request);
}

// ============================================
// K-line / Candles API
// ============================================
export interface Candle {
  /** Unix timestamp in milliseconds - period start time (API returns milliseconds) */
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  quote_volume?: string;
  trade_count?: number;
  is_final?: boolean; // API may include this field
}

export interface CandlesResponse {
  symbol: string;
  period: string;
  candles: Candle[];
}

export interface LatestCandleResponse {
  symbol: string;
  period: string;
  candle: Candle;
  is_final: boolean;
}

export type KlinePeriod = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d"; // API supports these periods

export interface GetCandlesParams {
  period: KlinePeriod;
  limit?: number;
  start?: number; // API uses "start" (milliseconds), not "from"
  end?: number; // API uses "end" (milliseconds), not "to"
}

/**
 * Get historical candles for a symbol
 * GET /api/v1/markets/{symbol}/candles
 */
export async function getCandles(chainId: number, symbol: string, params: GetCandlesParams): Promise<CandlesResponse> {
  // Convert symbol to API format (BTCUSDT)
  const apiSymbol = convertSymbolToApiFormat(symbol);
  const queryParams = new URLSearchParams();
  queryParams.set("period", params.period);
  if (params.limit !== undefined) queryParams.set("limit", params.limit.toString());
  if (params.start !== undefined) queryParams.set("from", Math.floor(params.start / 1000).toString());
  if (params.end !== undefined) queryParams.set("to", Math.floor(params.end / 1000).toString());

  return apiFetch<CandlesResponse>(chainId, `/external/markets/${apiSymbol}/candles?${queryParams.toString()}`);
}

/**
 * Get the latest candle for a symbol
 * GET /api/v1/markets/{symbol}/candles/latest
 */
export async function getLatestCandle(
  chainId: number,
  symbol: string,
  period: KlinePeriod
): Promise<LatestCandleResponse> {
  return apiFetch<LatestCandleResponse>(chainId, `/klines/${symbol}/candles/latest?period=${period}`);
}

// ============================================
// SWR Fetcher Helper
// ============================================
export function createSwrFetcher<T>(chainId: number, requireAuth = false) {
  return async (path: string): Promise<T> => {
    return apiFetch<T>(chainId, path, { requireAuth });
  };
}

// Export for direct usage
export const api = {
  // Auth
  getNonce,
  login,
  logout,
  getStoredToken,
  clearStoredToken,
  // Markets
  getMarkets,
  getOrderbook,
  getTrades,
  getTicker,
  getPrice,
  // K-line / Candles
  getCandles,
  getLatestCandle,
  // Funding
  getAllFundingRates,
  getFundingRate,
  getFundingHistory,
  // Referral
  getOnChainDashboard,
  getOnChainClaimable,
  getOperatorStatus,
  // Account (Protected)
  getPositions,
  getOrders,
  // Orders (Protected)
  createOrder,
  cancelOrder,
  batchCancelOrders,
  // Positions (Protected)
  closePosition,
  updatePositionCollateral,
};

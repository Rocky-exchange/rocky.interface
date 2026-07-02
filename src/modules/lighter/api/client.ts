import { i18n } from "@lingui/core";

import { getServerBaseUrl } from "config/backend";

import {
  mapReferralDashboardToOnChainDashboard,
  normalizeReferralDashboardResponse,
} from "./custom/referralDashboard.normalize";
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

const JWT_STORAGE_KEY = "primit_jwt_token";
const JWT_EXPIRY_KEY = "primit_jwt_expiry";
/** 历史 key(品牌改名前),仅用于一次性读/迁移,避免老用户换域后被登出。 */
const LEGACY_JWT_STORAGE_KEY = "axblade_jwt_token";
const LEGACY_JWT_EXPIRY_KEY = "axblade_jwt_expiry";

/**
 * Minimal JWT shape check: three dot-separated base64url segments, the middle
 * one decoding to JSON with a numeric `exp` claim we can compare against.
 *
 * This is NOT a signature check — only the backend can do that. Its purpose
 * is to filter out obviously-forged values an attacker might plant under the
 * legacy key to get them promoted into the active slot, which the previous
 * migration did unconditionally. A real forgery requires the backend's
 * signing key; here we're closing the no-crypto-at-all trust gap.
 *
 * TODO(security): move JWTs out of localStorage entirely. HttpOnly +
 * SameSite=Strict + Secure cookie removes the XSS-grab class of attacks
 * altogether. Requires backend cooperation (Set-Cookie on /auth/login).
 */
function isPlausibleJwt(token: string, expirySeconds: number): boolean {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  if (parts.some((p) => p.length === 0)) return false;

  // base64url → JSON payload must parse and its `exp` must line up with the
  // separately-stored expiry. A mismatch (or no `exp`) is a red flag.
  try {
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { exp?: unknown };
    const exp = typeof payload.exp === "number" ? payload.exp : NaN;
    if (!Number.isFinite(exp)) return false;
    // Allow up to 60s clock skew between the stored expiry value and the
    // claim itself.
    if (Math.abs(exp - expirySeconds) > 60) return false;
    // Must not already be expired.
    if (exp * 1000 <= Date.now()) return false;
  } catch (_error) {
    return false;
  }

  return true;
}

function migrateLegacyJwt(): void {
  if (typeof window === "undefined") return;

  // Always drop legacy keys first so a bad migration never lingers.
  const clearLegacy = () => {
    localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_JWT_EXPIRY_KEY);
  };

  if (localStorage.getItem(JWT_STORAGE_KEY) || localStorage.getItem(JWT_EXPIRY_KEY)) {
    clearLegacy();
    return;
  }

  const legacyToken = localStorage.getItem(LEGACY_JWT_STORAGE_KEY);
  const legacyExpiryRaw = localStorage.getItem(LEGACY_JWT_EXPIRY_KEY);
  if (!legacyToken || !legacyExpiryRaw) {
    clearLegacy();
    return;
  }

  const legacyExpiry = parseInt(legacyExpiryRaw, 10);
  if (!Number.isFinite(legacyExpiry) || !isPlausibleJwt(legacyToken, legacyExpiry)) {
    // Untrusted payload — discard rather than promote. Forces re-login,
    // which is the safe failure mode.
    clearLegacy();
    return;
  }

  localStorage.setItem(JWT_STORAGE_KEY, legacyToken);
  localStorage.setItem(JWT_EXPIRY_KEY, String(legacyExpiry));
  clearLegacy();
}

// ============================================
// Token Management
// ============================================
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  migrateLegacyJwt();
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
  localStorage.removeItem(LEGACY_JWT_STORAGE_KEY);
  localStorage.removeItem(LEGACY_JWT_EXPIRY_KEY);
}

// Removed: isAuthenticated() - not used, use custom/client.ts version instead

// ============================================
// Core Fetch Wrapper
// ============================================
interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

// rocky-backend exposes routes directly at /v1/* and /fapi/*, no /api
// prefix -- see the matching comment in api/custom/client.ts (the primary
// client) for the full rationale. Every call site here now passes its own
// full path.
async function apiFetch<T>(chainId: number, path: string, options: FetchOptions = {}): Promise<T> {
  const baseUrl = getServerBaseUrl(chainId);
  const url = `${baseUrl}${path}`;

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
// NOT SUPPORTED by rocky-backend (no EVM nonce+signature login route) --
// see the matching comment in custom/client.ts.
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

// See custom/client.ts's getMarkets for the full rationale: /v1/markets returns
// a bare array with base/max_leverage fields; normalize to the { markets } +
// Market shape the UI expects, else the market list renders empty.
interface RawMarketRow {
  symbol: string;
  base?: string;
  quote?: string;
  max_leverage?: number;
  tick_size?: string;
  min_qty?: string;
}
function decimalsOf(s?: string): number {
  if (!s) return 2;
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}
function normalizeMarketRow(r: RawMarketRow, rank: number): Market {
  const base = r.base ?? r.symbol.replace(/-PERP$/i, "").replace(/-USD[T]?$/i, "");
  return {
    symbol: `${base}-USD`,
    base_asset: base,
    quote_asset: r.quote ?? "USDC",
    last_price: "",
    price_change_24h: "0",
    price_change_percent_24h: "0",
    high_24h: "0",
    low_24h: "0",
    volume_24h: "0",
    volume_24h_usd: "0",
    rank,
    leverage: r.max_leverage ?? 100,
    price_decimals: decimalsOf(r.tick_size),
    size_decimals: decimalsOf(r.min_qty),
    status: "active",
  };
}
export async function getMarkets(chainId: number, limit?: number): Promise<MarketsResponse> {
  const queryParams = limit ? `?limit=${limit}` : "";
  const raw = await apiFetch<unknown>(chainId, `/v1/markets${queryParams}`);
  const arr: RawMarketRow[] = Array.isArray(raw)
    ? (raw as RawMarketRow[])
    : ((raw as { markets?: RawMarketRow[] })?.markets ?? []);
  const markets = arr.map((r, i) => normalizeMarketRow(r, i));
  return { markets, total: markets.length };
}

// rocky-backend has NO market-details endpoint -- synthesize from /v1/markets
// (only `max_leverage` is consumed) rather than 400ing on a nonexistent route.
// See custom/client.ts's getMarketDetails for the canonical version.
// Per-asset descriptions for the market Details panel (backend exposes none).
// Bilingual — picked by the active locale, like the onboarding tour.
const MARKET_DESCRIPTIONS: Record<string, { en: string; zh: string }> = {
  BTC: {
    en: "Bitcoin (BTC) is the first and largest cryptocurrency, a decentralized digital store of value secured by proof-of-work. BTC-PERP is a perpetual futures contract with up to 100x leverage, settled in USDC on the Canton Network.",
    zh: "比特币（BTC）是第一个也是市值最大的加密货币，采用工作量证明保护的去中心化数字价值存储。BTC-PERP 是永续合约，最高 100 倍杠杆，由 Canton 网络以 USDC 结算。",
  },
  ETH: {
    en: "Ethereum (ETH) is the leading smart-contract platform, powering DeFi, NFTs and thousands of applications. ETH-PERP is a perpetual futures contract with up to 100x leverage, settled in USDC on the Canton Network.",
    zh: "以太坊（ETH）是领先的智能合约平台，支撑 DeFi、NFT 及数千种应用。ETH-PERP 是永续合约，最高 100 倍杠杆，由 Canton 网络以 USDC 结算。",
  },
  CC: {
    en: "Canton Coin (CC) is the native utility token of the Canton Network, a privacy-enabled public blockchain for institutional finance. CC-PERP is a perpetual futures contract with up to 100x leverage, settled in USDC on the Canton Network.",
    zh: "Canton Coin（CC）是 Canton 网络的原生功能代币；Canton 是面向机构金融、支持隐私的公有链。CC-PERP 是永续合约，最高 100 倍杠杆，由 Canton 网络以 USDC 结算。",
  },
};

export async function getMarketDetails(chainId: number, symbol: string): Promise<MarketDetailsResponse> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  const base = rockySymbol.replace(/-PERP$/i, "");
  // Read tick_size / min_qty / max_leverage straight from the raw markets row
  // (the normalized Market drops the raw values), and the ticker for a live price
  // to derive the min USD notional. Margin fractions derive from max leverage.
  const [raw, ticker] = await Promise.all([
    apiFetch<unknown>(chainId, "/v1/markets"),
    getTicker(chainId, symbol).catch(() => null),
  ]);
  const arr: Array<Record<string, unknown>> = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : ((raw as { markets?: Array<Record<string, unknown>> })?.markets ?? []);
  const rm = arr.find((x) => String(x.base ?? "").toUpperCase() === base.toUpperCase());
  const maxLev = Number(rm?.max_leverage ?? 100) || 100;
  const tick = rm?.tick_size != null ? String(rm.tick_size) : "0.01";
  const minQty = rm?.min_qty != null ? String(rm.min_qty) : "0.001";
  const price = Number(ticker?.mark_price ?? ticker?.last_price ?? 0);
  const minUsd = Number.isFinite(price) && price > 0 ? (Number(minQty) * price).toFixed(2) : "0";
  const imf = maxLev > 0 ? 1 / maxLev : 0;
  const mmf = imf / 2;
  const locale = (i18n.locale || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
  const desc = MARKET_DESCRIPTIONS[base.toUpperCase()];
  return {
    symbol: rockySymbol,
    market_name: rockySymbol,
    base_asset: base,
    quote_asset: rm?.quote != null ? String(rm.quote) : "USDC",
    description: desc ? desc[locale] : null,
    min_base_amount: minQty,
    min_usd_amount: minUsd,
    price_step: tick,
    lot_size: minQty,
    max_leverage: maxLev,
    initial_margin_fraction: String(imf),
    maintenance_margin_fraction: String(mmf),
    close_out_margin_fraction: String(mmf),
    market_cap: null,
    fully_diluted_valuation: null,
    market_cap_updated_at: null,
    mark_price: ticker?.mark_price ?? null,
    last_price: ticker?.last_price ?? null,
    funding_rate: null,
    next_funding_time: null,
    listing_phase: null,
    status: "active",
  };
}

export async function getOrderbook(chainId: number, symbol: string): Promise<Orderbook> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  return apiFetch<Orderbook>(chainId, `/v1/markets/${rockySymbol}/orderbook`);
}

export interface TradesResponse {
  symbol: string;
  trades: Trade[];
}

export async function getTrades(chainId: number, symbol: string): Promise<TradesResponse> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  // /recent-trades returns a bare array of { trade_id, price, qty, side, ts_ms };
  // map to the UI Trade shape or the trades panel stays empty. See
  // custom/client.ts getTrades.
  const raw = await apiFetch<unknown>(chainId, `/v1/markets/${rockySymbol}/recent-trades`);
  const rows: Array<Record<string, unknown>> = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : ((raw as { trades?: Array<Record<string, unknown>> })?.trades ?? []);
  const trades: Trade[] = rows.map((r) => ({
    id: String(r.trade_id ?? r.id ?? ""),
    symbol: rockySymbol,
    price: String(r.price ?? "0"),
    amount: String(r.qty ?? r.amount ?? "0"),
    size: String(r.qty ?? r.size ?? "0"),
    side: String(r.side ?? "").toUpperCase() === "BUY" ? "buy" : "sell",
    timestamp: Number(r.ts_ms ?? r.timestamp ?? 0),
  }));
  return { symbol: rockySymbol, trades };
}

// Helper to convert symbol format (e.g., "BTC-USD" -> "BTCUSDT"). Used ONLY
// for /fapi/* (Binance-compatible) calls -- see convertSymbolToRockySymbol
// below for the /v1/* (Rocky-native) format.
function convertSymbolToApiFormat(symbol: string): string {
  // If already in BTCUSDT format, return as is
  const upper = symbol.toUpperCase().trim();

  if (upper.includes("-USD") || upper.includes("/USD")) {
    const base = upper.split(/-|\//)[0] ?? "";
    if (base.endsWith("USDT")) return base;
    if (base.endsWith("USD")) return base.replace(/USD$/, "USDT");
    return `${base}USDT`;
  }

  const cleaned = upper.replace(/[/-]/g, "");
  if (cleaned.endsWith("USDT")) return cleaned;
  if (cleaned.endsWith("USD")) return cleaned.replace(/USD$/, "USDT");
  return `${cleaned}USDT`;
}

// rocky-backend's /v1/markets/* routes use its own native symbol shape
// ("BTC-PERP", "ETH-PERP", "CC-PERP"), never the Binance-style "BTCUSDT"
// convertSymbolToApiFormat produces.
function convertSymbolToRockySymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  const base = upper.includes("-USD") || upper.includes("/USD")
    ? (upper.split(/-|\//)[0] ?? "")
    : upper.replace(/[/-]/g, "").replace(/USDT?$/, "");
  return `${base}-PERP`;
}

export async function getTicker(chainId: number, symbol: string): Promise<Ticker> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  // Map rocky-backend's ticker (`price_change_pct_24h`, no index/funding) to
  // the UI Ticker shape so 24h-change renders. See custom/client.ts getTicker.
  const raw = await apiFetch<Record<string, unknown>>(chainId, `/v1/markets/${rockySymbol}/ticker`);
  const s = (v: unknown, d = "0") => (v == null ? d : String(v));
  return {
    symbol: s(raw.symbol, rockySymbol),
    last_price: s(raw.last_price),
    mark_price: raw.mark_price == null ? undefined : String(raw.mark_price),
    index_price: raw.index_price == null ? undefined : String(raw.index_price),
    price_change_24h: s(raw.price_change_24h),
    price_change_percent_24h: s(raw.price_change_percent_24h ?? raw.price_change_pct_24h),
    high_24h: s(raw.high_24h),
    low_24h: s(raw.low_24h),
    volume_24h: s(raw.volume_24h),
    open_interest: s(raw.open_interest),
    funding_rate: s(raw.funding_rate),
    next_funding_time: Number(raw.next_funding_time ?? 0),
  };
}

// NOT SUPPORTED by rocky-backend -- see custom/client.ts's getPrice.
export async function getPrice(chainId: number, symbol: string): Promise<PriceResponse> {
  const apiSymbol = convertSymbolToApiFormat(symbol);
  return apiFetch<PriceResponse>(chainId, `/v1/markets/${apiSymbol}/price`);
}

// ============================================
// Public Funding Rate API
// ============================================
export interface FundingRatesResponse {
  rates: FundingRate[];
}

// NOT SUPPORTED by rocky-backend -- see custom/client.ts's getAllFundingRates.
// No aggregate /v1/funding-rates endpoint on rocky-backend; return empty.
export async function getAllFundingRates(_chainId: number): Promise<FundingRatesResponse> {
  return { rates: [] };
}

export async function getFundingRate(chainId: number, symbol: string): Promise<FundingRate> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  // Map rocky-backend's { rate, next_funding_ts_ms, ... } to the UI FundingRate
  // shape. See custom/client.ts getFundingRate.
  const raw = await apiFetch<Record<string, unknown>>(chainId, `/v1/markets/${rockySymbol}/funding-rate`);
  const s = (v: unknown, d = "0") => (v == null ? d : String(v));
  const rate = s(raw.rate ?? raw.funding_rate);
  return {
    symbol: s(raw.symbol, rockySymbol),
    funding_rate: rate,
    funding_rate_per_hour: rate,
    mark_price: s(raw.mark_price),
    index_price: s(raw.index_price ?? raw.mark_price),
    next_funding_time: Number(raw.next_funding_ts_ms ?? raw.next_funding_time ?? 0),
  };
}

// NOT SUPPORTED by rocky-backend -- funding rate history is documented as
// not yet implemented.
// rocky-backend has NO funding-rate HISTORY endpoint (only the current
// /v1/markets/{symbol}/funding-rate). Return empty rather than 400-spamming
// the console. See custom/client.ts getFundingHistory.
export async function getFundingHistory(
  _chainId: number,
  _symbol: string,
  _params?: { period?: string; limit?: number }
): Promise<FundingHistory[]> {
  return [];
}

// ============================================
// Referral dashboard (JWT; 与 `/v1/referral/dashboard` 同源，映射为旧 OnChainDashboard)
// ============================================
export async function getOnChainDashboard(chainId: number, address: string): Promise<OnChainDashboard> {
  const raw = await apiFetch<unknown>(chainId, "/v1/referral/dashboard", { requireAuth: true });
  const d = normalizeReferralDashboardResponse(raw);
  return mapReferralDashboardToOnChainDashboard(d, address);
}

// rocky-backend's real route is GET /v1/referral/on-chain/user-rebate/:address
// (the old path, /referral/on-chain/claimable/:address, does not exist).
export async function getOnChainClaimable(chainId: number, address: string): Promise<ClaimableAmount> {
  return apiFetch<ClaimableAmount>(chainId, `/v1/referral/on-chain/user-rebate/${address}`);
}

// NOT SUPPORTED by rocky-backend -- no operator-status endpoint exists.
export async function getOperatorStatus(chainId: number): Promise<OperatorStatus> {
  return apiFetch<OperatorStatus>(chainId, "/v1/referral/on-chain/operator-status");
}

// ============================================
// Protected Account API (Requires Auth)
// ============================================
// DEAD CODE: nothing imports getPositions/getOrders/getAccountTrades (or the
// order-mutation functions further below) from this file specifically --
// every live call site (hooks.ts, custom/useApi*.ts) imports the
// custom/client.ts versions of these instead (already fixed above). Paths
// below were NOT updated; do not wire new code to this section.
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
 * GET /v1/markets/{symbol}/candles
 *
 * Path and symbol format fixed to match rocky-backend's real route
 * (Rocky-native symbol, e.g. "BTC-PERP"). Query param names/period values
 * have NOT been verified against rocky-backend's actual candles route.
 */
export async function getCandles(chainId: number, symbol: string, params: GetCandlesParams): Promise<CandlesResponse> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  const queryParams = new URLSearchParams();
  queryParams.set("period", params.period);
  if (params.limit !== undefined) queryParams.set("limit", params.limit.toString());
  if (params.start !== undefined) queryParams.set("from", Math.floor(params.start / 1000).toString());
  if (params.end !== undefined) queryParams.set("to", Math.floor(params.end / 1000).toString());

  return apiFetch<CandlesResponse>(chainId, `/v1/markets/${rockySymbol}/candles?${queryParams.toString()}`);
}

/**
 * Get the latest candle for a symbol
 * GET /v1/markets/{symbol}/candles/latest
 *
 * NOT SUPPORTED by rocky-backend -- no "latest candle" convenience endpoint
 * exists. Left calling the old shape.
 */
export async function getLatestCandle(
  chainId: number,
  symbol: string,
  period: KlinePeriod
): Promise<LatestCandleResponse> {
  const apiSymbol = convertSymbolToApiFormat(symbol);
  return apiFetch<LatestCandleResponse>(chainId, `/v1/klines/${apiSymbol}/candles/latest?period=${period}`);
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

/**
 * Trading API client
 *
 * Standalone trading API client.
 * It does not depend on mode checks and talks directly to the trading backend.
 */

// 使用统一的后端 URL 配置
import { getTradingBackendUrl } from "config/backend";
import { isDevelopment } from "config/env";
import { getMtcAuthToken } from "@/shared/lib/canton-wallet/session";

import {
  mapReferralDashboardToOnChainResponse,
  normalizeReferralDashboardResponse,
} from "./referralDashboard.normalize";
import { normalizeReferralLeaderboardResponse } from "./referralLeaderboard.normalize";
import {
  getOnChainReferralDashboardMock,
  getReferralDashboardMock,
  getReferralLeaderboardMock,
  getReferralStatusMock,
  referralUseMockFromEnv,
} from "./referralMock";
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
  FundingFeeHistoryItem,
  Position,
  Order,
  AccountBalance,
  CreateOrderRequest,
  UpdateOrderRequest,
  UpdateOrderResponse,
  BatchCancelRequest,
  BatchCancelResponse,
  ClosePositionRequest,
  CloseOperatorAuthorizationResponse,
  CollateralRequest,
  TpSlRequest,
  TpSlResponse,
  CreateTriggerOrderRequest,
  TriggerOrderResponse,
  TriggerOrdersResponse,
  CreateReferralCodeParams,
  CreateReferralCodeResponse,
  BindReferralCodeParams,
  BindReferralCodeResponse,
  ReferralDashboardResponse,
  ReferralLeaderboardEntry,
  ReferralStatusResponse,
  ReferralClaimSignatureRequest,
  ReferralClaimSignatureResponse,
  ClaimReferralResponse,
  OnChainDashboardResponse,
  ClaimableResponse,
  OperatorStatusResponse,
  WithdrawRecord,
  WithdrawRequest,
  WithdrawResponse,
  EarnDomainResponse,
  EarnProduct,
  EarnProductsResponse,
  EarnPerformanceResponse,
  EarnSubscription,
  EarnSubscriptionsResponse,
  EarnSubscribePrepareRequest,
  EarnSubscribePrepareResponse,
  PnlResponse,
  GetPnlParams,
} from "../types";

const JWT_STORAGE_KEY_PREFIX = "primit_jwt_token";
const JWT_EXPIRY_KEY_PREFIX = "primit_jwt_expiry";
const LAST_ADDRESS_KEY = "primit_last_address";
/**
 * 历史品牌 key 前缀,仅用于一次性读/迁移。读到立刻拷贝到新前缀并删掉老 key,
 * 保证用户改域后不被登出。历史数据完全清空后可下线这些常量。
 */
const LEGACY_JWT_STORAGE_KEY_PREFIX = "axblade_jwt_token";
const LEGACY_JWT_EXPIRY_KEY_PREFIX = "axblade_jwt_expiry";
const LEGACY_LAST_ADDRESS_KEY = "axblade_last_address";

// Helper function to get storage key for a specific address and chainId
function getStorageKey(address: string | null | undefined, keyPrefix: string, chainId?: number | null): string {
  if (!address || !chainId) {
    // Fallback to old key for backward compatibility (will be deprecated)
    return keyPrefix;
  }
  // Normalize address to lowercase for consistent key generation
  // Include chainId to separate tokens for different chains (testnet vs mainnet)
  const normalizedAddress = address.toLowerCase();
  return `${keyPrefix}_${chainId}_${normalizedAddress}`;
}

/**
 * 把一对 legacy (axblade_*) 存储 key 搬到新 (primit_*) 前缀。
 * 新 key 已有值时不覆盖,避免回写老 token 顶掉新 session;
 * 搬完后立即删除 legacy key,防止下次读到旧数据。
 */
function migrateLegacyPair(
  legacyStorageKey: string,
  legacyExpiryKey: string,
  targetStorageKey: string,
  targetExpiryKey: string
): void {
  if (typeof window === "undefined") return;
  const legacyToken = localStorage.getItem(legacyStorageKey);
  const legacyExpiry = localStorage.getItem(legacyExpiryKey);
  if (!legacyToken || !legacyExpiry) return;
  if (!localStorage.getItem(targetStorageKey)) {
    localStorage.setItem(targetStorageKey, legacyToken);
  }
  if (!localStorage.getItem(targetExpiryKey)) {
    localStorage.setItem(targetExpiryKey, legacyExpiry);
  }
  localStorage.removeItem(legacyStorageKey);
  localStorage.removeItem(legacyExpiryKey);
}

/**
 * 尝试把给定 address/chainId 组合下的 axblade_* token 迁到 primit_*。
 * 顺序覆盖三种历史布局:
 *  1) {prefix}_{chainId}_{addr}
 *  2) {prefix}_{addr}(无 chainId)
 *  3) 裸 {prefix}
 */
function migrateLegacyJwtFor(address: string | null, chainId: number | null | undefined): void {
  if (typeof window === "undefined") return;
  // legacy last-address key → primit
  const legacyLastAddr = localStorage.getItem(LEGACY_LAST_ADDRESS_KEY);
  if (legacyLastAddr && !localStorage.getItem(LAST_ADDRESS_KEY)) {
    localStorage.setItem(LAST_ADDRESS_KEY, legacyLastAddr);
  }
  if (legacyLastAddr) localStorage.removeItem(LEGACY_LAST_ADDRESS_KEY);

  if (address && chainId) {
    migrateLegacyPair(
      getStorageKey(address, LEGACY_JWT_STORAGE_KEY_PREFIX, chainId),
      getStorageKey(address, LEGACY_JWT_EXPIRY_KEY_PREFIX, chainId),
      getStorageKey(address, JWT_STORAGE_KEY_PREFIX, chainId),
      getStorageKey(address, JWT_EXPIRY_KEY_PREFIX, chainId)
    );
  }
  if (address) {
    migrateLegacyPair(
      getStorageKey(address, LEGACY_JWT_STORAGE_KEY_PREFIX, null),
      getStorageKey(address, LEGACY_JWT_EXPIRY_KEY_PREFIX, null),
      getStorageKey(address, JWT_STORAGE_KEY_PREFIX, null),
      getStorageKey(address, JWT_EXPIRY_KEY_PREFIX, null)
    );
  }
  migrateLegacyPair(
    LEGACY_JWT_STORAGE_KEY_PREFIX,
    LEGACY_JWT_EXPIRY_KEY_PREFIX,
    JWT_STORAGE_KEY_PREFIX,
    JWT_EXPIRY_KEY_PREFIX
  );
}

// Helper function to get the last used address from localStorage
export function getLastAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_ADDRESS_KEY);
}

// Helper function to store the last used address
function setLastAddress(address: string | null): void {
  if (typeof window === "undefined") return;
  if (address) {
    localStorage.setItem(LAST_ADDRESS_KEY, address.toLowerCase());
  } else {
    localStorage.removeItem(LAST_ADDRESS_KEY);
  }
}

// ============================================
// Token Management
// ============================================
export function getStoredToken(address?: string | null, chainId?: number | null): string | null {
  if (typeof window === "undefined") return null;

  // If address is not provided, try to get from last used address
  let targetAddress = address;
  if (!targetAddress) {
    targetAddress = getLastAddress();
  }

  // Normalize address to lowercase for consistent lookup
  const normalizedAddress = targetAddress ? targetAddress.toLowerCase() : null;

  // 读老 axblade_* token → 迁移到 primit_* 命名空间;迁移后后续逻辑按新 key 读即可。
  migrateLegacyJwtFor(normalizedAddress, chainId ?? null);

  // First, try to get address and chainId-specific token (new format)
  if (normalizedAddress && chainId) {
    const storageKey = getStorageKey(normalizedAddress, JWT_STORAGE_KEY_PREFIX, chainId);
    const expiryKey = getStorageKey(normalizedAddress, JWT_EXPIRY_KEY_PREFIX, chainId);

    const token = localStorage.getItem(storageKey);
    const expiry = localStorage.getItem(expiryKey);

    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10) * 1000;
      const now = Date.now();
      const isValid = now < expiryTime;

      // Only log if token is invalid (expired)
      if (!isValid) {
        if (isDevelopment()) {
          console.warn("[getStoredToken] Token expired, clearing", {
            expiryTime,
            now,
            timeSinceExpiry: now - expiryTime,
            address: `${normalizedAddress.substring(0, 6)}...`,
            chainId,
          });
        }
        clearStoredToken(normalizedAddress, chainId);
      }
      // Return valid token without logging (too frequent)

      if (isValid) {
        return token;
      }
    }
  }

  // Fallback: try to get legacy token (old format without address/chainId binding)
  // This provides backward compatibility for tokens stored before the address/chainId binding feature
  // Try address-only format first (without chainId)
  if (normalizedAddress) {
    const legacyAddressKey = getStorageKey(normalizedAddress, JWT_STORAGE_KEY_PREFIX, null);
    const legacyAddressExpiryKey = getStorageKey(normalizedAddress, JWT_EXPIRY_KEY_PREFIX, null);

    const legacyAddressToken = localStorage.getItem(legacyAddressKey);
    const legacyAddressExpiry = localStorage.getItem(legacyAddressExpiryKey);

    if (legacyAddressToken && legacyAddressExpiry) {
      if (Date.now() < parseInt(legacyAddressExpiry, 10) * 1000) {
        // If we have chainId, migrate the legacy token to address+chainId-specific format
        if (chainId) {
          setStoredToken(legacyAddressToken, parseInt(legacyAddressExpiry, 10), normalizedAddress, chainId);
          // Clear legacy token after migration
          localStorage.removeItem(legacyAddressKey);
          localStorage.removeItem(legacyAddressExpiryKey);
        }
        return legacyAddressToken;
      }
      // Legacy token expired, clear it
      localStorage.removeItem(legacyAddressKey);
      localStorage.removeItem(legacyAddressExpiryKey);
    }
  }

  // Fallback: try to get very old legacy token (without address and chainId)
  const legacyStorageKey = JWT_STORAGE_KEY_PREFIX;
  const legacyExpiryKey = JWT_EXPIRY_KEY_PREFIX;

  const legacyToken = localStorage.getItem(legacyStorageKey);
  const legacyExpiry = localStorage.getItem(legacyExpiryKey);

  if (legacyToken && legacyExpiry) {
    if (Date.now() < parseInt(legacyExpiry, 10) * 1000) {
      // If we have both address and chainId, migrate the legacy token to address+chainId-specific format
      if (normalizedAddress && chainId) {
        setStoredToken(legacyToken, parseInt(legacyExpiry, 10), normalizedAddress, chainId);
        // Clear legacy token after migration
        localStorage.removeItem(legacyStorageKey);
        localStorage.removeItem(legacyExpiryKey);
      }
      return legacyToken;
    }
    // Legacy token expired, clear it
    localStorage.removeItem(legacyStorageKey);
    localStorage.removeItem(legacyExpiryKey);
  }

  return null;
}

export function setStoredToken(
  token: string,
  expiresAt: number,
  address?: string | null,
  chainId?: number | null
): void {
  if (typeof window === "undefined") return;

  if (!address || !chainId) {
    if (isDevelopment()) {
      console.error(" setStoredToken called without address or chainId. Token will not be stored.", {
        address,
        chainId,
        hasToken: !!token,
      });
    } else {
      console.error(" setStoredToken called without address or chainId. Token will not be stored.");
    }
    return;
  }

  // Normalize address to lowercase for consistent storage
  const normalizedAddress = address.toLowerCase();

  // Store the address as the last used address
  setLastAddress(normalizedAddress);

  const storageKey = getStorageKey(normalizedAddress, JWT_STORAGE_KEY_PREFIX, chainId);
  const expiryKey = getStorageKey(normalizedAddress, JWT_EXPIRY_KEY_PREFIX, chainId);

  localStorage.setItem(storageKey, token);
  localStorage.setItem(expiryKey, expiresAt.toString());

  // Verify storage (only log if verification fails)
  const verifyToken = localStorage.getItem(storageKey);
  const verifyExpiry = localStorage.getItem(expiryKey);
  if (!verifyToken || !verifyExpiry) {
    if (isDevelopment()) {
      console.error(" setStoredToken: Storage verification failed", {
        tokenStored: !!verifyToken,
        expiryStored: !!verifyExpiry,
        storageKey,
        expiryKey,
      });
    } else {
      console.error(" setStoredToken: Storage verification failed");
    }
  }

  // Notify token change listeners (same tab)
  // Use setTimeout to ensure localStorage is updated before event is dispatched
  setTimeout(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth-token-change"));
    }
  }, 0);
}

export function clearStoredToken(address?: string | null, chainId?: number | null): void {
  if (typeof window === "undefined") return;

  // If address is not provided, clear the last used address's token
  let targetAddress = address;
  if (!targetAddress) {
    targetAddress = getLastAddress();
  }

  if (targetAddress && chainId) {
    // Clear chainId-specific token
    const storageKey = getStorageKey(targetAddress, JWT_STORAGE_KEY_PREFIX, chainId);
    const expiryKey = getStorageKey(targetAddress, JWT_EXPIRY_KEY_PREFIX, chainId);
    localStorage.removeItem(storageKey);
    localStorage.removeItem(expiryKey);
  }

  // Also clear legacy tokens (address-only, or no address/chainId)
  if (targetAddress) {
    // Clear address-only legacy token
    const legacyAddressKey = getStorageKey(targetAddress, JWT_STORAGE_KEY_PREFIX, null);
    const legacyAddressExpiryKey = getStorageKey(targetAddress, JWT_EXPIRY_KEY_PREFIX, null);
    localStorage.removeItem(legacyAddressKey);
    localStorage.removeItem(legacyAddressExpiryKey);
  }

  // Also clear the last address if clearing for a specific address
  if (address) {
    const lastAddress = getLastAddress();
    if (lastAddress && lastAddress.toLowerCase() === address.toLowerCase()) {
      setLastAddress(null);
    }
  }

  // Also clear very old legacy token (without address and chainId) for backward compatibility
  localStorage.removeItem(JWT_STORAGE_KEY_PREFIX);
  localStorage.removeItem(JWT_EXPIRY_KEY_PREFIX);

  // Notify token change listeners (same tab)
  setTimeout(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth-token-change"));
    }
  }, 0);
}

export function isAuthenticated(address?: string | null, chainId?: number | null): boolean {
  return getStoredToken(address, chainId) !== null || getMtcAuthToken() !== "";
}

// ============================================
// Core Fetch Wrapper (Trading API specific)
// ============================================
interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
  address?: string | null; // Optional address for address-specific token lookup
}

// rocky-backend exposes routes directly at /v1/* (web) and /fapi/* (Binance-
// compatible), with NO /api prefix -- unlike the old api.primit.io backend
// this client was originally written against. Every apiFetch call site now
// passes its OWN full path (e.g. "/v1/markets", "/fapi/v1/order") instead of
// relying on this function to prepend a shared prefix, so different call
// sites can target /v1 or /fapi without one clobbering the other (a single
// shared prefix previously caused a real double-prefix bug on the funding
// fee history call: see getFundingFeeHistory below).
async function apiFetch<T>(chainId: number, path: string, options: FetchOptions = {}): Promise<T> {
  const baseUrl = getTradingBackendUrl(chainId);
  const url = `${baseUrl}${path}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (options.requireAuth) {
    // Get token for the specified address and chainId
    // If address is not provided, try to get from last used address
    let targetAddress = options.address;
    if (!targetAddress) {
      targetAddress = getLastAddress();
    }

    const token = getStoredToken(targetAddress, chainId) || getMtcAuthToken();
    if (!token) {
      if (isDevelopment()) {
        console.error(" Token not found for authentication", {
          providedAddress: options.address,
          lastAddress: getLastAddress(),
          chainId,
        });
      } else {
        console.error(" Token not found for authentication");
      }
      throw new Error(" Authentication required. Please sign in again.");
    }

    // Log token usage for debugging

    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorData: ApiError;
      let errorText: string | undefined;
      try {
        errorData = await response.json();
        // Body may include order id / balance / partial account info — only log
        // the full payload in development. In production, surface just the
        // status + sanitized error code so we don't leak PII into devtools.
        if (isDevelopment()) {
          console.error(` API Error (${response.status}):`, errorData);
        } else {
          console.error(` API Error (${response.status}): ${errorData?.error ?? "request_failed"}`);
        }
      } catch (e) {
        // If JSON parsing fails, try to get text
        try {
          errorText = await response.text();
          if (isDevelopment()) {
            console.error(` API Error (${response.status}) - Raw response:`, errorText);
          } else {
            console.error(` API Error (${response.status}) - non-JSON response`);
          }
        } catch (textError) {
          // Ignore text parsing errors
        }
        errorData = {
          error: "request_failed",
          message: errorText || `Request failed with status ${response.status}`,
        };
      }

      // Extract error message from various possible formats
      const fullMessage =
        errorData.message || errorData.error || (errorData as any).detail || errorText || "Request failed";

      // Handle 401 Unauthorized errors - token is invalid or expired
      if (response.status === 401) {
        // Get the address used for this request
        let targetAddress = options.address;
        if (!targetAddress) {
          targetAddress = getLastAddress();
        }
        // Only clear token if we have an address to clear it for
        if (targetAddress) {
          if (isDevelopment()) {
            console.warn(" Clearing invalid/expired token for address and chainId");
          }
          clearStoredToken(targetAddress, chainId);
        } else if (isDevelopment()) {
          console.warn(" Cannot clear token: no address available");
        }

        // Don't show error toast for 401, as it will trigger re-authentication
        // The calling code should handle re-authentication
      }
      // Note: We don't show toasts for API errors here because:
      // 1. Backend error messages may be in Chinese or other languages
      // 2. The t macro doesn't work correctly outside React components
      // 3. Components should handle error display with proper i18n support

      // Throw an Error object so it can be properly caught
      const error = new Error(fullMessage);
      (error as any).status = response.status;
      (error as any).errorData = errorData;
      throw error;
    }

    return response.json();
  } catch (error) {
    // Handle network errors and other exceptions

    // If error already has status (API error handled above), just re-throw
    if ((error as any)?.status) {
      throw error;
    }

    // For network errors without status, throw generic error
    // Note: We don't show toasts here because the t macro doesn't work correctly
    // outside React components. Components should handle error display.
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(errorMessage);
  }
}

// ============================================
// Auth API
// ============================================
// NOT WIRED TO ANY LIVE CALL SITE and NOT SUPPORTED by rocky-backend (which
// has no EVM nonce+signature login route at all -- its real auth is wallet
// challenge/verify: POST /api/wallet/challenge, POST /api/wallet/verify, see
// @/shared/lib/canton-wallet/session.ts, which the live /trade auth flow
// actually uses). Left in place (not deleted) since no call sites reference
// these two functions anywhere in the app; do not wire new code to them.
export async function getNonce(chainId: number, address: string): Promise<NonceResponse> {
  return apiFetch<NonceResponse>(chainId, `/auth/nonce/${address}`);
}

export async function login(chainId: number, request: LoginRequest, address?: string | null): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>(chainId, "/auth/login", {
    method: "POST",
    body: JSON.stringify(request),
  });

  // Store token with address and chainId binding
  const targetAddress = address || request.address;

  // Ensure expires_at is a number
  const expiresAt = typeof response.expires_at === "string" ? parseInt(response.expires_at, 10) : response.expires_at;

  if (!targetAddress || !chainId) {
    if (isDevelopment()) {
      console.error(" login: Cannot store token - missing address or chainId", {
        targetAddress,
        chainId,
        address,
        requestAddress: request.address,
      });
    } else {
      console.error(" login: Cannot store token - missing address or chainId");
    }
  } else {
    setStoredToken(response.token, expiresAt, targetAddress, chainId);
    // Also store the last used address for token lookup when address is not provided
    setLastAddress(targetAddress);

    // Verify token was stored
    const verifyToken = getStoredToken(targetAddress, chainId);
  }

  return response;
}

export function logout(address?: string | null, chainId?: number | null): void {
  clearStoredToken(address, chainId);
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

// Helper to convert symbol format (e.g., "BTC-USD" -> "BTCUSDT"). Used ONLY
// for /fapi/* (Binance-compatible) calls -- see convertSymbolToRockySymbol
// below for the /v1/* (Rocky-native) format.
function convertSymbolToApiFormat(symbol: string): string {
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
// convertSymbolToApiFormat produces. Extracts the same base asset that
// function does, then appends "-PERP" instead of normalizing to "...USDT".
function convertSymbolToRockySymbol(symbol: string): string {
  const upper = symbol.toUpperCase().trim();
  const base = upper.includes("-USD") || upper.includes("/USD")
    ? (upper.split(/-|\//)[0] ?? "")
    : upper.replace(/[/-]/g, "").replace(/USDT?$/, "");
  return `${base}-PERP`;
}

// rocky-backend's GET /v1/markets returns a BARE ARRAY of rows shaped
// { symbol:"BTC-PERP", base, quote, max_leverage, tick_size, min_qty } — NOT
// the { markets, total } envelope with base_asset/leverage/status/... fields
// the UI's Market type expects. Without this normalization marketsData.markets
// is undefined -> every consumer sees [] -> the market list renders empty
// (the real cause of the "no market list" bug, not CORS). Map each raw row to
// the UI Market shape and wrap in the envelope. Symbol is normalized to the
// app's "{BASE}-USD" convention (matches DEFAULT_SYMBOL); convertSymbolToRocky-
// Symbol turns it back into "BTC-PERP" for the per-symbol data endpoints.
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

// rocky-backend has NO "market details" endpoint (only /v1/markets and
// /v1/markets/{symbol}/ticker). Hitting /v1/markets/{sym}/details 400s and
// spams the console. Synthesize the response from the real /v1/markets row
// instead (the only field any caller actually consumes is `max_leverage`;
// prices come from getTicker). No network call to a nonexistent route.
export async function getMarketDetails(chainId: number, symbol: string): Promise<MarketDetailsResponse> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  const base = rockySymbol.replace(/-PERP$/i, "");
  const markets = await getMarkets(chainId);
  const m = (markets.markets ?? []).find((x) => (x.base_asset ?? "").toUpperCase() === base.toUpperCase());
  const maxLev = (m && m.leverage) || 100;
  return {
    symbol: rockySymbol,
    market_name: rockySymbol,
    base_asset: m?.base_asset ?? base,
    quote_asset: m?.quote_asset ?? "USDC",
    description: null,
    min_base_amount: "0",
    min_usd_amount: "0",
    price_step: "0",
    lot_size: "0",
    max_leverage: maxLev,
    initial_margin_fraction: "0",
    maintenance_margin_fraction: "0",
    close_out_margin_fraction: "0",
    market_cap: null,
    fully_diluted_valuation: null,
    market_cap_updated_at: null,
    mark_price: m?.last_price ?? null,
    last_price: m?.last_price ?? null,
    funding_rate: null,
    next_funding_time: null,
    listing_phase: null,
    status: m?.status ?? "active",
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
  // rocky-backend's route is /recent-trades and returns a BARE ARRAY of
  // { trade_id, price, qty, side:"BUY"|"SELL", ts_ms } — map to the UI Trade
  // shape ({ trades:[{ id, amount, side:"buy"|"sell", timestamp }] }) or the
  // trades panel stays empty.
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

export async function getTicker(chainId: number, symbol: string): Promise<Ticker> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  // rocky-backend's ticker uses `price_change_pct_24h` (not the UI's
  // `price_change_percent_24h`) and omits index_price/funding fields. Map to
  // the Ticker shape so 24h-change etc. render instead of showing "-".
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

// NOT SUPPORTED by rocky-backend as a dedicated endpoint -- price is part of
// the ticker response (getTicker) or /fapi/v1/ticker/price. Left calling the
// old shape; callers should be migrated to getTicker.
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

// NOT SUPPORTED by rocky-backend -- there is no "all funding rates" list
// endpoint, only per-symbol (getFundingRate). Left calling the old shape.
// rocky-backend has no aggregate /v1/funding-rates endpoint (only per-symbol
// /v1/markets/{symbol}/funding-rate). Return empty rather than 400-spamming.
export async function getAllFundingRates(_chainId: number): Promise<FundingRatesResponse> {
  return { rates: [] };
}

export async function getFundingRate(chainId: number, symbol: string): Promise<FundingRate> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  return apiFetch<FundingRate>(chainId, `/v1/markets/${rockySymbol}/funding-rate`);
}

// NOT SUPPORTED by rocky-backend -- funding rate history is documented as
// not yet implemented. Left calling the old shape.
// rocky-backend has NO funding-rate HISTORY endpoint (only the current
// /v1/markets/{symbol}/funding-rate). Return empty rather than 400-spamming
// the console on a nonexistent /v1/funding-rates/{sym}/history route.
export async function getFundingHistory(_chainId: number, _symbol: string): Promise<FundingHistory[]> {
  return [];
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

interface BalancesResponse {
  balances: AccountBalance[];
}

export interface UnifiedAccountResponse {
  margin_mode: string;
  wallet_balance: string;
  total_equity: string;
  available_balance: string;
  total_initial_margin: string;
  total_maintenance_margin: string;
  total_unrealized_pnl: string;
  uni_mmr: string;
  account_status: string;
}

export async function getPositions(chainId: number, address?: string | null): Promise<PositionsResponse> {
  return apiFetch<PositionsResponse>(chainId, "/v1/positions/me", { requireAuth: true, address });
}

export async function getOrders(chainId: number, address?: string | null): Promise<OrdersResponse> {
  return apiFetch<OrdersResponse>(chainId, "/v1/orders/me", { requireAuth: true, address });
}

// NOT SUPPORTED by rocky-backend -- conditional/trigger orders are
// documented as not yet implemented (no /trigger-orders route exists).
// Left calling the old shape; expect this to 404 until the backend ships it.
// rocky-backend has no trigger/TP-SL order support (no /v1/trigger-orders
// route). Return empty rather than 400-spamming the console.
export async function getTriggerOrders(_chainId: number, _address?: string | null): Promise<TriggerOrdersResponse> {
  return { success: true, data: [], error: null };
}

export async function createTriggerOrder(
  chainId: number,
  request: CreateTriggerOrderRequest,
  address?: string | null
): Promise<TriggerOrderResponse> {
  // 后端实际返回 `{success, data:{id,...}, error}` envelope,这里拆包成扁平 TriggerOrderResponse
  // (历史上曾直接返回扁平对象,发现有包裹后再剥一层;两种格式都兼容)。
  // NOT SUPPORTED by rocky-backend -- see getTriggerOrders above.
  const raw = await apiFetch<TriggerOrderResponse | { success: boolean; data: TriggerOrderResponse; error: unknown }>(
    chainId,
    "/v1/trigger-orders",
    {
      method: "POST",
      body: JSON.stringify(request),
      requireAuth: true,
      address,
    }
  );
  if (raw && typeof raw === "object" && "data" in raw && (raw as any).data) {
    return (raw as { data: TriggerOrderResponse }).data;
  }
  return raw as TriggerOrderResponse;
}

// NOT SUPPORTED by rocky-backend -- see getTriggerOrders above.
export async function cancelTriggerOrder(
  chainId: number,
  triggerOrderId: string,
  address?: string | null
): Promise<void> {
  await apiFetch<unknown>(chainId, `/v1/trigger-orders/${triggerOrderId}`, {
    method: "DELETE",
    requireAuth: true,
    address,
  });
}

// NOT SUPPORTED by rocky-backend as a single "all balances" list -- it only
// exposes per-asset balance (GET /v1/account/me/{asset}). Left calling the
// old shape; a real fix needs the caller to know which assets to query
// (USDC at minimum) and compose the list client-side.
// rocky-backend has no /v1/account/balances aggregate endpoint (only the
// per-asset /v1/account/me/{asset} and the /fapi/v2/balance surface). Return
// empty rather than 400-spamming the console; per-asset balance wiring is a
// follow-up. `_address` kept for signature compatibility with callers.
export async function getBalances(_chainId: number, _address?: string | null): Promise<BalancesResponse> {
  return { balances: [] };
}

// rocky-backend has NO unified-account/margin-mode endpoint (/v1/unified/account
// 400s). Return zeroed defaults rather than error-spamming the console; the
// Accounts panel then shows 0 instead of throwing. `_address` kept for
// signature compatibility.
export async function getUnifiedAccount(
  _chainId: number,
  _address?: string | null
): Promise<UnifiedAccountResponse> {
  return {
    margin_mode: "cross",
    wallet_balance: "0",
    total_equity: "0",
    available_balance: "0",
    total_initial_margin: "0",
    total_maintenance_margin: "0",
    total_unrealized_pnl: "0",
    uni_mmr: "0",
    account_status: "NORMAL",
  };
}

export interface AccountTradesResponse {
  trades: Trade[];
}

export async function getAccountTrades(chainId: number, address?: string | null): Promise<AccountTradesResponse> {
  return apiFetch<AccountTradesResponse>(chainId, "/v1/trades/me", { requireAuth: true, address });
}

export interface WithdrawHistoryResponse {
  withdrawals: WithdrawRecord[];
}

export interface GetFundingFeeHistoryParams {
  symbol?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

// NOT SUPPORTED by rocky-backend -- it only has GET /v1/withdrawals/{wid}
// (single lookup by id), no "list all withdrawals" endpoint. Left calling
// the old shape.
export async function getWithdrawHistory(chainId: number, address?: string | null): Promise<WithdrawHistoryResponse> {
  return apiFetch<WithdrawHistoryResponse>(chainId, "/v1/withdraw/history", {
    requireAuth: true,
    address,
  });
}

// NOT SUPPORTED by rocky-backend -- /fapi funding-fee-history endpoints are
// documented as not yet implemented. This call previously also had a
// double-prefix bug (this path used to get "/api/v1" prepended on top of its
// own "/fapi/v1/..." prefix); apiFetch no longer prepends anything, so at
// least that half is fixed, but the endpoint itself still doesn't exist.
export async function getFundingFeeHistory(
  chainId: number,
  params: GetFundingFeeHistoryParams = {}
): Promise<FundingFeeHistoryItem[]> {
  const query = new URLSearchParams();
  if (params.symbol) {
    query.set(
      "symbol",
      params.symbol.includes("USDT") ? params.symbol.toUpperCase() : `${params.symbol.toUpperCase()}USDT`
    );
  }
  if (params.startTime !== undefined) query.set("startTime", String(params.startTime));
  if (params.endTime !== undefined) query.set("endTime", String(params.endTime));
  query.set("limit", String(params.limit ?? 100));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<FundingFeeHistoryItem[]>(chainId, `/fapi/v1/fundingFeeHistory${suffix}`, { requireAuth: true });
}

// Path fixed to match rocky-backend's real POST /v1/withdrawals. The request
// body SHAPE has not been reconciled against rocky-backend's actual expected
// fields (see services/api-gateway/src/routes/withdrawals.rs upstream) --
// only the URL was in scope for this pass.
export async function requestWithdraw(chainId: number, request: WithdrawRequest): Promise<WithdrawResponse> {
  return apiFetch<WithdrawResponse>(chainId, "/v1/withdrawals", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

export interface ConfirmWithdrawRequest {
  tx_hash: string;
}

export interface ConfirmWithdrawResponse {
  success: boolean;
  message?: string;
}

/**
 * Confirm withdrawal by submitting transaction hash
 * This is optional but recommended to speed up status updates
 *
 * NOT SUPPORTED by rocky-backend -- there is no separate "confirm" step;
 * GET /v1/withdrawals/{wid} reports status directly. Left calling the old
 * shape.
 */
export async function confirmWithdraw(
  chainId: number,
  withdrawId: string,
  request: ConfirmWithdrawRequest
): Promise<ConfirmWithdrawResponse> {
  return apiFetch<ConfirmWithdrawResponse>(chainId, `/v1/withdraw/${withdrawId}/confirm`, {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

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
  chain_audit_payload?: {
    close_id_bytes32?: string;
    position_id_bytes32?: string;
    user?: string;
    symbol?: string;
    realized_pnl_raw?: string;
    fee_raw?: string;
    closed_at?: number;
    deadline?: number;
    signature?: string;
    vault_address?: string;
    operator?: string;
    execution_mode?: string;
    smart_account_address?: string;
    session_key_address?: string;
    tx_hash?: string;
  };
}

// Path fixed to match rocky-backend's real POST /v1/orders. NOTE: the
// request body's `symbol` field must be Rocky-native ("BTC-PERP"), not the
// Binance-style "BTCUSDT" the caller (usePrimitOrderSubmit.ts) currently
// sends -- that conversion needs fixing at the call site, not here, since
// this function just forwards whatever request it's given.
export async function createOrder(
  chainId: number,
  request: CreateOrderRequest,
  address?: string | null
): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>(chainId, "/v1/orders", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
    address,
  });
}

export interface PositionCloseAuditSubmissionRequest {
  close_id_bytes32: string;
  user_op_hash?: string;
  final_tx_hash?: string;
  status?: "submitted_userop" | "confirmed" | "failed";
  error?: string;
}

export interface PositionCloseAuditSubmissionResponse {
  success: boolean;
}

// NOT SUPPORTED by rocky-backend -- there is no position-close-audit
// endpoint. Left calling the old shape.
export async function reportPositionCloseAuditSubmission(
  chainId: number,
  request: PositionCloseAuditSubmissionRequest,
  address?: string | null
): Promise<PositionCloseAuditSubmissionResponse> {
  return apiFetch<PositionCloseAuditSubmissionResponse>(chainId, "/v1/positions/close-audits/submission", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
    address,
  });
}

/**
 * 订单预估(Order Preview)— 用户调整面板(数量、杠杆、价格)时实时查询预估数据
 * 使用 custom client 的 address-aware token 存储,与登录流程一致
 *
 * NOT SUPPORTED by rocky-backend -- there is no order-preview endpoint.
 * Left calling the old shape.
 */
// rocky-backend has no /v1/orders/preview endpoint. Return an empty preview
// (data:null) rather than 400-spamming while the user fills the order form;
// the adapter renders "-" for est. liq/fees, and the order still places via
// createOrder. `_address` kept for signature compatibility.
export async function getOrderPreview(
  _chainId: number,
  _request: import("../types").OrderPreviewRequest,
  _address?: string | null
): Promise<import("../types").OrderPreviewResponse> {
  return { success: false, data: null, error: null, timestamp: 0 };
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

// Path fixed to match rocky-backend's real DELETE /v1/orders/{order_id}.
// NOTE: rocky-backend's cancel is authorized purely via the session Bearer
// token (see require_session in routes/orders.rs) -- the {signature,
// timestamp} body this sends is an EVM-signature pattern from the old
// backend and is very likely unnecessary/ignored now, but left as-is since
// removing it is a body-shape change outside this pass's scope.
export async function cancelOrder(
  chainId: number,
  orderId: string,
  request: CancelOrderRequest,
  address?: string | null
): Promise<CancelOrderResponse> {
  return apiFetch<CancelOrderResponse>(chainId, `/v1/orders/${orderId}`, {
    method: "DELETE",
    body: JSON.stringify(request),
    requireAuth: true,
    address,
  });
}

// NOT SUPPORTED by rocky-backend -- order modification is documented as not
// yet implemented (no PATCH/PUT /v1/orders/{id} route). Left calling the old
// shape.
export async function updateOrder(
  chainId: number,
  orderId: string,
  request: UpdateOrderRequest,
  address?: string | null
): Promise<UpdateOrderResponse> {
  try {
    return await apiFetch<UpdateOrderResponse>(chainId, `/v1/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify(request),
      requireAuth: true,
      address,
    });
  } catch (error) {
    const status = (error as { status?: number })?.status;

    if (status !== 404 && status !== 405) {
      throw error;
    }

    return apiFetch<UpdateOrderResponse>(chainId, `/v1/orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify(request),
      requireAuth: true,
      address,
    });
  }
}

// NOT SUPPORTED by rocky-backend -- there is no batch-cancel endpoint
// (docs mark it not yet implemented). Left calling the old shape.
export async function batchCancelOrders(chainId: number, request: BatchCancelRequest): Promise<BatchCancelResponse> {
  return apiFetch<BatchCancelResponse>(chainId, "/v1/orders/batch", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

// ============================================
// Protected Position API (Requires Auth)
// ============================================
// rocky-backend has no dedicated "close position by id" endpoint -- it
// closes positions the same way rocky-bot's own TakerLoop generates fills:
// submit a reduce-only LIMIT order on the OPPOSITE side of the position,
// priced aggressively past the current mark price so it crosses resting
// orders immediately (rocky-backend's /v1/orders rejects MARKET orders for
// v1, so a plain market close isn't possible).
const CLOSE_POSITION_AGGRESSION = 0.005; // 50 bps past mark, matches rocky-bot's TAKER_AGGRESSION

export async function closePosition(
  chainId: number,
  positionId: string,
  request: ClosePositionRequest,
  address?: string | null
): Promise<CreateOrderResponse> {
  const mark = Number(request.markPrice);
  if (!Number.isFinite(mark) || mark <= 0) {
    throw new Error(`closePosition: invalid markPrice "${request.markPrice}" for position ${positionId}`);
  }

  // Closing a long means selling (aggressively below mark, to cross bids);
  // closing a short means buying (aggressively above mark, to cross asks).
  const closingSide: "buy" | "sell" = request.side === "long" ? "sell" : "buy";
  const price =
    closingSide === "sell"
      ? mark * (1 - CLOSE_POSITION_AGGRESSION)
      : mark * (1 + CLOSE_POSITION_AGGRESSION);

  const orderRequest: CreateOrderRequest = {
    symbol: request.symbol,
    side: closingSide,
    order_type: "limit",
    price: price.toFixed(8),
    amount: request.qty,
    leverage: request.leverage ?? 1,
    margin_mode: "cross",
    signature: "canton-session",
    timestamp: Math.floor(Date.now() / 1000),
    reduce_only: true,
  };

  return createOrder(chainId, orderRequest, address);
}

// NOT SUPPORTED by rocky-backend -- no operator-authorization concept
// exists. Left calling the old shape.
export async function getCloseOperatorAuthorization(
  chainId: number,
  address?: string | null,
  operator?: string | null
): Promise<CloseOperatorAuthorizationResponse> {
  const suffix = operator ? `?operator=${encodeURIComponent(operator)}` : "";
  return apiFetch<CloseOperatorAuthorizationResponse>(chainId, `/v1/positions/close-operator-authorization${suffix}`, {
    method: "GET",
    requireAuth: true,
    address,
  });
}

// NOT SUPPORTED by rocky-backend -- no add/remove-collateral endpoints
// exist (margin is managed implicitly via account balance). Left calling
// the old shape.
export async function addPositionCollateral(
  chainId: number,
  positionId: string,
  request: CollateralRequest
): Promise<Position> {
  return apiFetch<Position>(chainId, `/v1/positions/${positionId}/collateral/add`, {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

// NOT SUPPORTED by rocky-backend -- see addPositionCollateral above.
export async function removePositionCollateral(
  chainId: number,
  positionId: string,
  request: CollateralRequest
): Promise<Position> {
  return apiFetch<Position>(chainId, `/v1/positions/${positionId}/collateral/remove`, {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

export async function updatePositionCollateral(
  chainId: number,
  positionId: string,
  request: CollateralRequest
): Promise<Position> {
  return addPositionCollateral(chainId, positionId, request);
}

// ============================================
// Position TP/SL API
// ============================================

/**
 * Set Take Profit and Stop Loss for a position
 * POST /v1/positions/:position_id/tp-sl
 *
 * NOT SUPPORTED by rocky-backend -- there is no TP/SL endpoint (docs mark
 * conditional orders as not yet implemented). Left calling the old shape.
 */
export async function setPositionTpSl(
  chainId: number,
  positionId: string,
  request: TpSlRequest,
  address?: string | null
): Promise<TpSlResponse> {
  const response = await apiFetch<{ success: boolean; data: TpSlResponse }>(chainId, `/v1/positions/${positionId}/tp-sl`, {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
    address,
  });
  return response.data;
}

/**
 * Get Take Profit and Stop Loss for a position
 * GET /v1/positions/:position_id/tp-sl
 *
 * NOT SUPPORTED by rocky-backend -- see setPositionTpSl above.
 */
export async function getPositionTpSl(
  chainId: number,
  positionId: string,
  address?: string | null
): Promise<TpSlResponse> {
  const response = await apiFetch<{ success: boolean; data: TpSlResponse }>(chainId, `/v1/positions/${positionId}/tp-sl`, {
    requireAuth: true,
    address,
  });
  return response.data;
}

/**
 * Delete Take Profit and Stop Loss for a position
 * DELETE /v1/positions/:position_id/tp-sl
 *
 * NOT SUPPORTED by rocky-backend -- see setPositionTpSl above.
 */
export async function deletePositionTpSl(
  chainId: number,
  positionId: string
): Promise<{ success: boolean; data: string; error: string | null }> {
  return apiFetch<{ success: boolean; data: string; error: string | null }>(chainId, `/v1/positions/${positionId}/tp-sl`, {
    method: "DELETE",
    requireAuth: true,
  });
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
  is_final?: boolean;
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

export type KlinePeriod = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

export interface GetCandlesParams {
  period: KlinePeriod;
  limit?: number;
  start?: number;
  end?: number;
}

// Path and symbol format fixed to match rocky-backend's real
// GET /v1/markets/{symbol}/candles (Rocky-native symbol, e.g. "BTC-PERP").
// NOTE: query param names ("period"/"limit"/"from"/"to") and the "30m"
// period value have NOT been verified against rocky-backend's actual
// candles route -- only the path and symbol format were in scope here.
export async function getCandles(chainId: number, symbol: string, params: GetCandlesParams): Promise<CandlesResponse> {
  const rockySymbol = convertSymbolToRockySymbol(symbol);
  const queryParams = new URLSearchParams();
  queryParams.set("period", params.period);
  if (params.limit !== undefined) queryParams.set("limit", params.limit.toString());
  // Convert milliseconds to seconds for backend API
  if (params.start !== undefined) queryParams.set("from", Math.floor(params.start / 1000).toString());
  if (params.end !== undefined) queryParams.set("to", Math.floor(params.end / 1000).toString());

  // rocky-backend returns a BARE ARRAY of { bucket_ms, open, high, low, close,
  // volume } — not { candles:[...] } with a `time` field. Without this mapping
  // the chart's getBars reads response.candles === undefined -> "No data here".
  const raw = await apiFetch<unknown>(
    chainId,
    `/v1/markets/${rockySymbol}/candles?${queryParams.toString()}`
  );
  const rows: Array<Record<string, unknown>> = Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : ((raw as { candles?: Array<Record<string, unknown>> })?.candles ?? []);
  const candles: Candle[] = rows.map((r) => ({
    time: Number(r.bucket_ms ?? r.time ?? 0),
    open: String(r.open ?? "0"),
    high: String(r.high ?? "0"),
    low: String(r.low ?? "0"),
    close: String(r.close ?? "0"),
    volume: String(r.volume ?? "0"),
  }));
  return { symbol: rockySymbol, period: params.period, candles };
}

// NOT SUPPORTED by rocky-backend -- no "latest candle" convenience endpoint
// exists. Left calling the old shape; callers could derive this from
// getCandles with limit=1 instead.
export async function getLatestCandle(
  chainId: number,
  symbol: string,
  period: KlinePeriod
): Promise<LatestCandleResponse> {
  const apiSymbol = convertSymbolToApiFormat(symbol);
  return apiFetch<LatestCandleResponse>(chainId, `/v1/klines/${apiSymbol}/candles/latest?period=${period}`);
}

// ============================================
// Referral API (根据 API 文档: https://zdocs.tubex.chat/account/referral)
// ============================================

// EIP-712 Typed Data interface
/**
 * 创建推荐码
 * POST /api/v1/referral/codes
 */
export async function createReferralCode(
  chainId: number,
  params: CreateReferralCodeParams
): Promise<CreateReferralCodeResponse> {
  return apiFetch<CreateReferralCodeResponse>(chainId, "/v1/referral/codes", {
    method: "POST",
    body: JSON.stringify(params),
    requireAuth: true,
  });
}

/**
 * 绑定推荐码
 * POST /v1/referral/bind
 */
export async function bindReferralCode(
  chainId: number,
  params: BindReferralCodeParams
): Promise<BindReferralCodeResponse> {
  return apiFetch<BindReferralCodeResponse>(chainId, "/v1/referral/bind", {
    method: "POST",
    body: JSON.stringify(params),
    requireAuth: true,
  });
}

/**
 * 获取推荐面板
 * GET /v1/referral/dashboard
 */
export async function getReferralDashboard(
  chainId: number,
  options?: { address?: string }
): Promise<ReferralDashboardResponse> {
  if (referralUseMockFromEnv()) {
    return getReferralDashboardMock();
  }
  const raw = await apiFetch<unknown>(chainId, "/v1/referral/dashboard", {
    requireAuth: true,
    address: options?.address,
  });
  return normalizeReferralDashboardResponse(raw);
}

/**
 * 获取推荐状态（作为推荐人/被推荐人双向）
 * GET /v1/referral/status
 */
export async function getReferralStatus(chainId: number): Promise<ReferralStatusResponse> {
  if (referralUseMockFromEnv()) {
    return getReferralStatusMock();
  }
  return apiFetch<ReferralStatusResponse>(chainId, "/v1/referral/status", {
    requireAuth: true,
  });
}

/**
 * 获取领取返佣签名
 * POST /v1/referral/on-chain/claim-signature
 *
 * NOT SUPPORTED by rocky-backend -- no on-chain claim-signature endpoint
 * exists (referral.rs has no matching route). Left calling the old shape.
 */
export async function getReferralClaimSignature(
  chainId: number,
  request: ReferralClaimSignatureRequest
): Promise<ReferralClaimSignatureResponse> {
  return apiFetch<ReferralClaimSignatureResponse>(chainId, "/v1/referral/on-chain/claim-signature", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
  });
}

/**
 * 领取奖励
 * POST /v1/referral/claim
 */
export async function claimReferralReward(
  chainId: number,
  options?: { address?: string }
): Promise<ClaimReferralResponse> {
  return apiFetch<ClaimReferralResponse>(chainId, "/v1/referral/claim", {
    method: "POST",
    body: JSON.stringify({}),
    requireAuth: true,
    address: options?.address,
  });
}

/**
 * 与 {@link getReferralDashboard} 同源：`GET /v1/referral/dashboard`（Bearer），
 * 映射为旧 `OnChainDashboardResponse` 字段名。`address` 仅用于多账户 JWT 解析（见 apiFetch）。
 */
export async function getOnChainReferralDashboard(chainId: number, address: string): Promise<OnChainDashboardResponse> {
  if (referralUseMockFromEnv()) {
    return getOnChainReferralDashboardMock(address);
  }
  const dash = await getReferralDashboard(chainId, { address });
  return mapReferralDashboardToOnChainResponse(dash);
}

/**
 * 查询可领取金额（公开接口）
 * rocky-backend's real route is GET /v1/referral/on-chain/user-rebate/:address
 * (this function's old path, /referral/on-chain/claimable/:address, does not
 * exist on rocky-backend).
 */
export async function getClaimableReferralAmount(chainId: number, address: string): Promise<ClaimableResponse> {
  return apiFetch<ClaimableResponse>(chainId, `/v1/referral/on-chain/user-rebate/${address}`);
}

/**
 * 操作员状态（公开接口）
 * GET /v1/referral/on-chain/operator-status
 *
 * NOT SUPPORTED by rocky-backend -- no operator-status endpoint exists.
 * Left calling the old shape.
 */
export async function getReferralOperatorStatus(chainId: number): Promise<OperatorStatusResponse> {
  return apiFetch<OperatorStatusResponse>(chainId, "/v1/referral/on-chain/operator-status");
}

/** 返佣榜默认条数（与 `GET /referral/leaderboard` 文档一致） */
export const REFERRAL_LEADERBOARD_DEFAULT_N = 10;
/** 返佣榜 `n` 上限 */
export const REFERRAL_LEADERBOARD_MAX_N = 50;

export function clampReferralLeaderboardN(n?: number): number {
  const raw = n ?? REFERRAL_LEADERBOARD_DEFAULT_N;
  const x = Number(raw);
  if (!Number.isFinite(x)) return REFERRAL_LEADERBOARD_DEFAULT_N;
  return Math.min(REFERRAL_LEADERBOARD_MAX_N, Math.max(1, Math.floor(x)));
}

/**
 * 返佣排行榜：按总返佣金额排序的前 N 名推荐人（无需认证）
 * GET /api/v1/referral/leaderboard?n=
 */
export async function getReferralLeaderboard(chainId: number, n?: number): Promise<ReferralLeaderboardEntry[]> {
  const q = clampReferralLeaderboardN(n);
  if (referralUseMockFromEnv()) {
    return getReferralLeaderboardMock(q);
  }
  const raw = await apiFetch<unknown>(chainId, `/v1/referral/leaderboard?n=${q}`);
  return normalizeReferralLeaderboardResponse(raw);
}

// ============================================
// Earn API (理财服务)
// ============================================
// NOT SUPPORTED by rocky-backend -- no earn/staking endpoints exist at all,
// and no UI route mounts useEarn (confirmed dead: no live call sites
// anywhere in src/ besides the barrel re-export in api/index.ts). Paths
// updated to /v1 for consistency, but every function in this section is
// currently unreachable from the live app.

/**
 * 获取 EIP-712 Domain 信息
 * GET /v1/earn/domain
 */
export async function getEarnDomain(chainId: number): Promise<EarnDomainResponse> {
  return apiFetch<EarnDomainResponse>(chainId, "/v1/earn/domain");
}

/**
 * 获取产品列表
 * GET /v1/earn/products
 */
export async function getEarnProducts(
  chainId: number,
  params?: { status?: string; page?: number; page_size?: number }
): Promise<EarnProductsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));

  const query = searchParams.toString();
  const path = query ? `/v1/earn/products?${query}` : "/v1/earn/products";
  return apiFetch<EarnProductsResponse>(chainId, path);
}

/**
 * 获取产品详情
 * GET /v1/earn/products/:id
 */
export async function getEarnProduct(chainId: number, productId: string): Promise<EarnProduct> {
  return apiFetch<EarnProduct>(chainId, `/v1/earn/products/${productId}`);
}

/**
 * 获取历史表现
 * GET /v1/earn/performance
 */
export async function getEarnPerformance(chainId: number, limit?: number): Promise<EarnPerformanceResponse> {
  const path = limit ? `/v1/earn/performance?limit=${limit}` : "/v1/earn/performance";
  return apiFetch<EarnPerformanceResponse>(chainId, path);
}

/**
 * 获取我的申购列表 (需要认证)
 * GET /v1/earn/subscriptions
 * 注意: API 返回原始数组，需要包装成 EarnSubscriptionsResponse 格式
 */
export async function getEarnSubscriptions(
  chainId: number,
  address?: string | null
): Promise<EarnSubscriptionsResponse> {
  const subscriptions = await apiFetch<EarnSubscription[]>(chainId, "/v1/earn/subscriptions", {
    requireAuth: true,
    address,
  });
  return { subscriptions };
}

/**
 * 准备申购 - 获取后端签名 (需要认证)
 * POST /v1/earn/subscribe/prepare
 */
export async function prepareEarnSubscribe(
  chainId: number,
  request: EarnSubscribePrepareRequest,
  address?: string | null
): Promise<EarnSubscribePrepareResponse> {
  return apiFetch<EarnSubscribePrepareResponse>(chainId, "/v1/earn/subscribe/prepare", {
    method: "POST",
    body: JSON.stringify(request),
    requireAuth: true,
    address,
  });
}

// ============================================
// PnL API (每日和累计盈亏)
// ============================================

/**
 * 获取账户每日和累计盈亏数据
 * GET /v1/account/pnl
 *
 * NOT SUPPORTED by rocky-backend -- no account-pnl endpoint exists. Left
 * calling the old shape.
 */
export async function getAccountPnl(
  chainId: number,
  params?: GetPnlParams,
  address?: string | null
): Promise<PnlResponse> {
  const searchParams = new URLSearchParams();
  if (params?.symbol) searchParams.set("symbol", params.symbol);
  if (params?.start_date) searchParams.set("start_date", params.start_date);
  if (params?.end_date) searchParams.set("end_date", params.end_date);
  if (params?.days !== undefined) searchParams.set("days", String(params.days));

  const query = searchParams.toString();
  const path = query ? `/v1/account/pnl?${query}` : "/v1/account/pnl";

  return apiFetch<PnlResponse>(chainId, path, {
    requireAuth: true,
    address,
  });
}

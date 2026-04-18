/**
 * CEX API Module
 *
 * Centralized exchange API client and hooks.
 * This module handles all CEX-specific API interactions including
 * authentication, orders, positions, and market data.
 */

// Types
export * from "./types";

// API Client (legacy)
// Note: Avoid exporting isAuthenticated to prevent conflicts
export {
  getMarkets,
  getCandles,
  api,
  type KlinePeriod,
} from "./client";
export * from "./hooks";
export * from "./useCancelOrderHandler";
export * from "./useClosePositionHandler";

// X10000 API Client (custom)
export * from "./custom/client";

// WebSocket
export * from "./custom/websocket";
export * from "./custom/useWebSocket";

// Auth
export * from "./custom/useZtdxAuth";
export * from "./custom/useAuthToken";
export * from "./custom/useTokenStorage";

// Markets
export * from "./custom/useX10000Markets";
export * from "./custom/useX10000FundingHistory";

// Orders
export * from "./custom/orderAdapter";
export * from "./custom/useApiOrders";
export * from "./custom/useZtdxOrderSubmit";

// Positions
export * from "./custom/positionAdapter";
export * from "./custom/useApiPositions";

// Trades
export * from "./custom/tradeAdapter";
export * from "./custom/useAccountTrades";

// Deposit
export * from "./custom/deposit";

// Referral
export * from "./custom/useReferralCode";
export * from "./custom/useReferralDashboard";

// Earn
export * from "./custom/useEarn";

// Wallet
export * from "./custom/useWalletChange";

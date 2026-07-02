import useSWR, { SWRConfiguration } from "swr";

import { getServerBaseUrl } from "config/backend";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId as useAppChainId } from "lib/chains";

import {
  getMarkets,
  getMarketDetails,
  getOrderbook,
  getTicker,
  getTrades,
  getPrice,
  getAllFundingRates,
  getFundingRate,
  getFundingHistory,
  getOnChainDashboard,
  getOnChainClaimable,
  getOperatorStatus,
  type MarketDetailsResponse,
  type PositionsResponse,
  type OrdersResponse,
  type BalancesResponse,
} from "./client";
import {
  getBalances,
  isAuthenticated,
  getWithdrawHistory,
  getPositions,
  getOrders,
  getUnifiedAccount,
  type WithdrawHistoryResponse,
  type UnifiedAccountResponse,
} from "./custom/client";
import type {
  Market,
  Orderbook,
  Ticker,
  Trade,
  PriceResponse,
  FundingRate,
  FundingHistory,
  OnChainDashboard,
  ClaimableAmount,
  OperatorStatus,
} from "./types";

// Default SWR configuration
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 5000,
};

function useCantonAccountKey() {
  const { connected, party, username } = useCantonSession();
  return connected ? party || username || "canton-session" : undefined;
}

// ============================================
// Market Hooks
// ============================================
export function usePrimitMarkets(chainId: number | undefined, config?: SWRConfiguration) {
  return useSWR<{ markets: Market[]; total: number }>(
    chainId ? [`primit-markets`, chainId] : null,
    () => getMarkets(chainId!),
    { ...defaultConfig, ...config }
  );
}

export function usePrimitOrderbook(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<Orderbook>(
    chainId && symbol ? [`primit-orderbook`, chainId, symbol] : null,
    () => getOrderbook(chainId!, symbol!),
    // Fast poll so the book churns in near-real-time (backend has no WS).
    { ...defaultConfig, refreshInterval: 500, dedupingInterval: 250, ...config }
  );
}

export function usePrimitTicker(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<Ticker>(
    chainId && symbol ? [`primit-ticker`, chainId, symbol] : null,
    () => getTicker(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 1000, dedupingInterval: 500, ...config }
  );
}

export function usePrimitMarketDetails(
  chainId: number | undefined,
  symbol: string | undefined,
  config?: SWRConfiguration
) {
  return useSWR<MarketDetailsResponse>(
    chainId && symbol ? [`primit-market-details`, chainId, symbol] : null,
    () => getMarketDetails(chainId!, symbol!),
    { ...defaultConfig, ...config }
  );
}

export function usePrimitTrades(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<{ symbol: string; trades: Trade[] }>(
    chainId && symbol ? [`primit-trades`, chainId, symbol] : null,
    () => getTrades(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 800, dedupingInterval: 400, ...config }
  );
}

export function usePrimitPrice(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<PriceResponse>(
    chainId && symbol ? [`primit-price`, chainId, symbol] : null,
    () => getPrice(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 1000, ...config }
  );
}

// ============================================
// Funding Rate Hooks
// ============================================
export function usePrimitFundingRates(chainId: number | undefined, config?: SWRConfiguration) {
  return useSWR<{ rates: FundingRate[] }>(
    chainId ? [`primit-funding-rates`, chainId] : null,
    () => getAllFundingRates(chainId!),
    { ...defaultConfig, refreshInterval: 30000, ...config }
  );
}

export function usePrimitFundingRate(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<FundingRate>(
    chainId && symbol ? [`primit-funding-rate`, chainId, symbol] : null,
    () => getFundingRate(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 30000, ...config }
  );
}

export function usePrimitFundingHistory(
  chainId: number | undefined,
  symbol: string | undefined,
  params?: { period?: string; limit?: number },
  config?: SWRConfiguration
) {
  const period = params?.period;
  const limit = params?.limit;
  return useSWR<FundingHistory[]>(
    chainId && symbol ? [`primit-funding-history`, chainId, symbol, period, limit] : null,
    () => getFundingHistory(chainId!, symbol!, params),
    { ...defaultConfig, ...config }
  );
}

// ============================================
// Referral Hooks (`GET /referral/dashboard` → 映射为 OnChainDashboard)
// ============================================
export function usePrimitOnChainDashboard(
  chainId: number | undefined,
  address: string | undefined,
  config?: SWRConfiguration
) {
  return useSWR<OnChainDashboard>(
    chainId && address ? [`primit-onchain-dashboard`, chainId, address] : null,
    () => getOnChainDashboard(chainId!, address!),
    { ...defaultConfig, ...config }
  );
}

export function usePrimitClaimable(chainId: number | undefined, address: string | undefined, config?: SWRConfiguration) {
  return useSWR<ClaimableAmount>(
    chainId && address ? [`primit-claimable`, chainId, address] : null,
    () => getOnChainClaimable(chainId!, address!),
    { ...defaultConfig, ...config }
  );
}

export function usePrimitOperatorStatus(chainId: number | undefined, config?: SWRConfiguration) {
  return useSWR<OperatorStatus>(chainId ? [`primit-operator-status`, chainId] : null, () => getOperatorStatus(chainId!), {
    ...defaultConfig,
    ...config,
  });
}

// ============================================
// Combined Hooks (with wallet)
// ============================================
export function usePrimitUserDashboard(config?: SWRConfiguration) {
  const { chainId } = useAppChainId();
  const account = useCantonAccountKey();
  return usePrimitOnChainDashboard(chainId, account, config);
}

export function usePrimitUserClaimable(config?: SWRConfiguration) {
  const { chainId } = useAppChainId();
  const account = useCantonAccountKey();
  return usePrimitClaimable(chainId, account, config);
}

// ============================================
// Utility: Check if backend is available
// ============================================
export function usePrimitBackendStatus(chainId: number | undefined) {
  return useSWR<boolean>(
    chainId ? [`primit-backend-status`, chainId] : null,
    async () => {
      try {
        const baseUrl = getServerBaseUrl(chainId!);
        const response = await fetch(`${baseUrl}/health`);
        return response.ok;
      } catch (_error) {
        return false;
      }
    },
    { ...defaultConfig, refreshInterval: 30000 }
  );
}

// ============================================
// Protected Account Hooks (Requires Auth)
// ============================================
export function usePrimitPositions(chainId: number | undefined, config?: SWRConfiguration) {
  const account = useCantonAccountKey();
  const authenticated = isAuthenticated(account, chainId);
  return useSWR<PositionsResponse>(
    chainId && authenticated && account ? [`primit-positions`, chainId, account] : null,
    () => getPositions(chainId!, account),
    { ...defaultConfig, refreshInterval: 2000, ...config }
  );
}

export function usePrimitOrders(chainId: number | undefined, config?: SWRConfiguration) {
  const account = useCantonAccountKey();
  const authenticated = isAuthenticated(account, chainId);
  return useSWR<OrdersResponse>(
    chainId && authenticated && account ? [`primit-orders`, chainId, account] : null,
    () => getOrders(chainId!, account),
    { ...defaultConfig, refreshInterval: 5000, ...config }
  );
}

export function usePrimitBalances(chainId: number | undefined, config?: SWRConfiguration) {
  const account = useCantonAccountKey();
  const authenticated = isAuthenticated(account, chainId);
  return useSWR<BalancesResponse>(
    chainId && authenticated && account ? [`primit-balances`, chainId, account] : null,
    () => getBalances(chainId!, account),
    {
      ...defaultConfig,
      refreshInterval: 10000,
      ...config,
      onError: (error: any, key: string, swrConfig: any) => {
        // Handle 401 errors by clearing token
        if (error?.status === 401 || error?.message?.includes("401") || error?.message?.includes("Unauthorized")) {
          console.warn(" 401 error in usePrimitBalances, token will be cleared by apiFetch");
          // Token is already cleared in apiFetch, but we can trigger re-authentication if needed
        }
        // Call custom onError if provided
        if (config?.onError) {
          config.onError(error, key, swrConfig);
        }
      },
    }
  );
}

export function usePrimitUnifiedAccount(chainId: number | undefined, config?: SWRConfiguration) {
  const account = useCantonAccountKey();
  const authenticated = isAuthenticated(account, chainId);
  return useSWR<UnifiedAccountResponse>(
    chainId && authenticated && account ? [`primit-unified-account`, chainId, account] : null,
    () => getUnifiedAccount(chainId!, account),
    {
      ...defaultConfig,
      refreshInterval: 5000,
      ...config,
    }
  );
}

// ============================================
// Combined User Hooks (with wallet)
// ============================================
export function usePrimitUserPositions(config?: SWRConfiguration) {
  const { chainId } = useAppChainId();
  return usePrimitPositions(chainId, config);
}

export function usePrimitUserOrders(config?: SWRConfiguration) {
  const { chainId } = useAppChainId();
  return usePrimitOrders(chainId, config);
}

export function usePrimitUserBalances(config?: SWRConfiguration) {
  const { chainId } = useAppChainId();
  return usePrimitBalances(chainId, config);
}

export function usePrimitUserUnifiedAccount(config?: SWRConfiguration) {
  const { chainId } = useAppChainId();
  return usePrimitUnifiedAccount(chainId, config);
}

export function usePrimitWithdrawHistory(chainId: number | undefined, config?: SWRConfiguration) {
  const authenticated = isAuthenticated();
  return useSWR<WithdrawHistoryResponse>(
    chainId && authenticated ? [`primit-withdraw-history`, chainId] : null,
    () => getWithdrawHistory(chainId!),
    { ...defaultConfig, refreshInterval: 30000, ...config }
  );
}

export function usePrimitUserWithdrawHistory(config?: SWRConfiguration) {
  const { chainId } = useAppChainId();
  return usePrimitWithdrawHistory(chainId, config);
}

// ============================================
// Alias exports for the trading page
// ============================================
export function useApiMarkets(chainId: number | undefined, config?: SWRConfiguration) {
  const result = usePrimitMarkets(chainId, config);
  return {
    markets: result.data ? { markets: result.data } : undefined,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiTicker(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  const result = usePrimitTicker(chainId, symbol, config);
  return {
    ticker: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiMarketDetails(
  chainId: number | undefined,
  symbol: string | undefined,
  config?: SWRConfiguration
) {
  const result = usePrimitMarketDetails(chainId, symbol, config);
  return {
    details: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiOrderbook(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  const result = usePrimitOrderbook(chainId, symbol, config);
  return {
    orderbook: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiTrades(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  const result = usePrimitTrades(chainId, symbol, config);
  return {
    trades: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiPrice(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  const result = usePrimitPrice(chainId, symbol, config);
  return {
    price: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

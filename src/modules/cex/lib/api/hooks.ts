import useSWR, { SWRConfiguration } from "swr";
import { useAccount } from "wagmi";

import { getServerBaseUrl } from "config/backend";

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

// ============================================
// Market Hooks
// ============================================
export function useZtdxMarkets(chainId: number | undefined, config?: SWRConfiguration) {
  return useSWR<{ markets: Market[]; total: number }>(
    chainId ? [`ztdx-markets`, chainId] : null,
    () => getMarkets(chainId!),
    { ...defaultConfig, ...config }
  );
}

export function useZtdxOrderbook(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<Orderbook>(
    chainId && symbol ? [`ztdx-orderbook`, chainId, symbol] : null,
    () => getOrderbook(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 1000, ...config }
  );
}

export function useZtdxTicker(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<Ticker>(
    chainId && symbol ? [`ztdx-ticker`, chainId, symbol] : null,
    () => getTicker(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 2000, dedupingInterval: 1000, ...config }
  );
}

export function useZtdxMarketDetails(
  chainId: number | undefined,
  symbol: string | undefined,
  config?: SWRConfiguration
) {
  return useSWR<MarketDetailsResponse>(
    chainId && symbol ? [`ztdx-market-details`, chainId, symbol] : null,
    () => getMarketDetails(chainId!, symbol!),
    { ...defaultConfig, ...config }
  );
}

export function useZtdxTrades(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<{ symbol: string; trades: Trade[] }>(
    chainId && symbol ? [`ztdx-trades`, chainId, symbol] : null,
    () => getTrades(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 1000, ...config }
  );
}

export function useZtdxPrice(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<PriceResponse>(
    chainId && symbol ? [`ztdx-price`, chainId, symbol] : null,
    () => getPrice(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 1000, ...config }
  );
}

// ============================================
// Funding Rate Hooks
// ============================================
export function useZtdxFundingRates(chainId: number | undefined, config?: SWRConfiguration) {
  return useSWR<{ rates: FundingRate[] }>(
    chainId ? [`ztdx-funding-rates`, chainId] : null,
    () => getAllFundingRates(chainId!),
    { ...defaultConfig, refreshInterval: 30000, ...config }
  );
}

export function useZtdxFundingRate(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  return useSWR<FundingRate>(
    chainId && symbol ? [`ztdx-funding-rate`, chainId, symbol] : null,
    () => getFundingRate(chainId!, symbol!),
    { ...defaultConfig, refreshInterval: 30000, ...config }
  );
}

export function useZtdxFundingHistory(
  chainId: number | undefined,
  symbol: string | undefined,
  params?: { period?: string; limit?: number },
  config?: SWRConfiguration
) {
  const period = params?.period;
  const limit = params?.limit;
  return useSWR<FundingHistory[]>(
    chainId && symbol ? [`ztdx-funding-history`, chainId, symbol, period, limit] : null,
    () => getFundingHistory(chainId!, symbol!, params),
    { ...defaultConfig, ...config }
  );
}

// ============================================
// Referral Hooks (On-Chain)
// ============================================
export function useZtdxOnChainDashboard(
  chainId: number | undefined,
  address: string | undefined,
  config?: SWRConfiguration
) {
  return useSWR<OnChainDashboard>(
    chainId && address ? [`ztdx-onchain-dashboard`, chainId, address] : null,
    () => getOnChainDashboard(chainId!, address!),
    { ...defaultConfig, ...config }
  );
}

export function useZtdxClaimable(chainId: number | undefined, address: string | undefined, config?: SWRConfiguration) {
  return useSWR<ClaimableAmount>(
    chainId && address ? [`ztdx-claimable`, chainId, address] : null,
    () => getOnChainClaimable(chainId!, address!),
    { ...defaultConfig, ...config }
  );
}

export function useZtdxOperatorStatus(chainId: number | undefined, config?: SWRConfiguration) {
  return useSWR<OperatorStatus>(chainId ? [`ztdx-operator-status`, chainId] : null, () => getOperatorStatus(chainId!), {
    ...defaultConfig,
    ...config,
  });
}

// ============================================
// Combined Hooks (with wallet)
// ============================================
export function useZtdxUserDashboard(config?: SWRConfiguration) {
  const { address, chainId } = useAccount();
  return useZtdxOnChainDashboard(chainId, address, config);
}

export function useZtdxUserClaimable(config?: SWRConfiguration) {
  const { address, chainId } = useAccount();
  return useZtdxClaimable(chainId, address, config);
}

// ============================================
// Utility: Check if backend is available
// ============================================
export function useZtdxBackendStatus(chainId: number | undefined) {
  return useSWR<boolean>(
    chainId ? [`ztdx-backend-status`, chainId] : null,
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
export function useZtdxPositions(chainId: number | undefined, config?: SWRConfiguration) {
  const { address } = useAccount();
  const authenticated = isAuthenticated(address, chainId);
  return useSWR<PositionsResponse>(
    chainId && authenticated && address ? [`ztdx-positions`, chainId, address] : null,
    () => getPositions(chainId!, address),
    { ...defaultConfig, refreshInterval: 2000, ...config }
  );
}

export function useZtdxOrders(chainId: number | undefined, config?: SWRConfiguration) {
  const { address } = useAccount();
  const authenticated = isAuthenticated(address, chainId);
  return useSWR<OrdersResponse>(
    chainId && authenticated && address ? [`ztdx-orders`, chainId, address] : null,
    () => getOrders(chainId!, address),
    { ...defaultConfig, refreshInterval: 5000, ...config }
  );
}

export function useZtdxBalances(chainId: number | undefined, config?: SWRConfiguration) {
  const { address } = useAccount();
  const authenticated = isAuthenticated(address, chainId);
  return useSWR<BalancesResponse>(
    chainId && authenticated && address ? [`ztdx-balances`, chainId, address] : null,
    () => getBalances(chainId!, address),
    {
      ...defaultConfig,
      refreshInterval: 10000,
      ...config,
      onError: (error: any, key: string, swrConfig: any) => {
        // Handle 401 errors by clearing token
        if (error?.status === 401 || error?.message?.includes("401") || error?.message?.includes("Unauthorized")) {
          console.warn(" 401 error in useZtdxBalances, token will be cleared by apiFetch");
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

export function useZtdxUnifiedAccount(chainId: number | undefined, config?: SWRConfiguration) {
  const { address } = useAccount();
  const authenticated = isAuthenticated(address, chainId);
  return useSWR<UnifiedAccountResponse>(
    chainId && authenticated && address ? [`ztdx-unified-account`, chainId, address] : null,
    () => getUnifiedAccount(chainId!, address),
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
export function useZtdxUserPositions(config?: SWRConfiguration) {
  const { chainId } = useAccount();
  return useZtdxPositions(chainId, config);
}

export function useZtdxUserOrders(config?: SWRConfiguration) {
  const { chainId } = useAccount();
  return useZtdxOrders(chainId, config);
}

export function useZtdxUserBalances(config?: SWRConfiguration) {
  const { chainId } = useAccount();
  return useZtdxBalances(chainId, config);
}

export function useZtdxUserUnifiedAccount(config?: SWRConfiguration) {
  const { chainId } = useAccount();
  return useZtdxUnifiedAccount(chainId, config);
}

export function useZtdxWithdrawHistory(chainId: number | undefined, config?: SWRConfiguration) {
  const authenticated = isAuthenticated();
  return useSWR<WithdrawHistoryResponse>(
    chainId && authenticated ? [`ztdx-withdraw-history`, chainId] : null,
    () => getWithdrawHistory(chainId!),
    { ...defaultConfig, refreshInterval: 30000, ...config }
  );
}

export function useZtdxUserWithdrawHistory(config?: SWRConfiguration) {
  const { chainId } = useAccount();
  return useZtdxWithdrawHistory(chainId, config);
}

// ============================================
// Alias exports for 10000x page
// ============================================
export function useApiMarkets(chainId: number | undefined, config?: SWRConfiguration) {
  const result = useZtdxMarkets(chainId, config);
  return {
    markets: result.data ? { markets: result.data } : undefined,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiTicker(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  const result = useZtdxTicker(chainId, symbol, config);
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
  const result = useZtdxMarketDetails(chainId, symbol, config);
  return {
    details: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiOrderbook(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  const result = useZtdxOrderbook(chainId, symbol, config);
  return {
    orderbook: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiTrades(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  const result = useZtdxTrades(chainId, symbol, config);
  return {
    trades: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export function useApiPrice(chainId: number | undefined, symbol: string | undefined, config?: SWRConfiguration) {
  const result = useZtdxPrice(chainId, symbol, config);
  return {
    price: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

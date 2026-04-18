/**
 * useApiTrades - Hook that fetches trades from REST API
 * Note: API trades format is simpler than TradeAction format,
 * so conversion may be limited
 */

import { useMemo } from "react";
import useSWR, { SWRConfiguration } from "swr";
import { useAccount } from "wagmi";

import { getAccountTrades, getStoredToken, getLastAddress, type AccountTradesResponse } from "./client";
import { useEffect, useState } from "react";

// Default SWR configuration for trades
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 2000,
  refreshInterval: 5000,
};

type UseApiTradesResult = {
  trades?: AccountTradesResponse["trades"];
  isLoading: boolean;
  error?: Error;
  mutate: () => void;
};

/**
 * Fetch account trades from API (user's trade history)
 */
export function useAccountTrades(
  chainId: number | undefined,
  account: string | null | undefined,
  config?: SWRConfiguration
): UseApiTradesResult {
  // Use state to track token existence so component re-renders when token changes
  const [hasToken, setHasToken] = useState(() => {
    // Use same logic as apiFetch: try account first, then fallback to last address
    let targetAddress = account;
    if (!targetAddress) {
      targetAddress = getLastAddress();
    }
    const token = getStoredToken(targetAddress, chainId);
    return token !== null;
  });

  // Poll for token changes to trigger re-render
  useEffect(() => {
    const checkToken = () => {
      // Use same logic as apiFetch: try account first, then fallback to last address
      let targetAddress = account;
      if (!targetAddress) {
        targetAddress = getLastAddress();
      }
      const token = getStoredToken(targetAddress, chainId);
      const newHasToken = token !== null;
      setHasToken((prev) => {
        if (prev !== newHasToken) {
          return newHasToken;
        }
        return prev;
      });
    };

    checkToken();
    const interval = setInterval(checkToken, 500);
    
    // Also listen for token change events
    const handleTokenChange = () => {
      checkToken();
    };
    window.addEventListener("x10000-token-change", handleTokenChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("x10000-token-change", handleTokenChange);
    };
  }, [account, chainId]);
  
  const authenticated = hasToken;
  const swrKey = chainId && account && authenticated ? [`api-trades`, chainId, account] : null;

  const {
    data: apiResponse,
    error,
    isLoading,
    mutate,
  } = useSWR<AccountTradesResponse>(
    swrKey,
    async () => {
      try {
        const result = await getAccountTrades(chainId!, account);
        console.log("[useAccountTrades] ✅ Trades fetched", { tradeCount: result.trades?.length || 0 });
        return result;
      } catch (err) {
        console.error("[useAccountTrades] ❌ Trades fetch error", err);
        throw err;
      }
    },
    { 
      ...defaultConfig, 
      ...config,
      onError: (err) => {
        console.error("[useAccountTrades] onError", err);
        config?.onError?.(err);
      },
    }
  );

  return {
    trades: apiResponse?.trades,
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

/**
 * Hook with auto-detected account from wagmi
 */
export function useUserAccountTrades(config?: SWRConfiguration): UseApiTradesResult {
  const { address, chainId } = useAccount();
  return useAccountTrades(chainId, address, config);
}

/**
 * Feature flag to control trades data source
 * Also returns true when in X10000 mode
 */
export function shouldUseApiTrades(): boolean {
  if (typeof window === "undefined") return false;
  // Check for X10000 mode flag
  const x10000Flag = localStorage.getItem("x10000_mode");
  if (x10000Flag === "true") return true;
  const envFlag = import.meta.env.VITE_USE_API_TRADES;
  const localFlag = localStorage.getItem("use_api_trades");
  return envFlag === "true" || localFlag === "true";
}


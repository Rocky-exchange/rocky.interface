/**
 * useApiTrades - Hook that fetches trades from REST API
 * Note: API trades format is simpler than TradeAction format,
 * so conversion may be limited
 */

import { useEffect, useState } from "react";
import useSWR, { SWRConfiguration } from "swr";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId } from "lib/chains";
import { getAccountTrades, isAuthenticated, getLastAddress, type AccountTradesResponse } from "./client";

// Default SWR configuration for trades
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 2000,
  refreshInterval: 5000,
  keepPreviousData: true,
};

type UseApiTradesResult = {
  trades?: AccountTradesResponse["trades"];
  isLoading: boolean;
  error?: Error;
  mutate: () => void;
};

function useCantonAccountKey() {
  const { connected, party, username } = useCantonSession();
  return connected ? party || username || "canton-session" : undefined;
}

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
    let targetAddress: string | null | undefined = account;
    if (!targetAddress) {
      targetAddress = getLastAddress();
    }
    return isAuthenticated(targetAddress, chainId);
  });

  // Poll for token changes to trigger re-render
  useEffect(() => {
    const checkToken = () => {
      // Use same logic as apiFetch: try account first, then fallback to last address
      let targetAddress: string | null | undefined = account;
      if (!targetAddress) {
        targetAddress = getLastAddress();
      }
      const newHasToken = isAuthenticated(targetAddress, chainId);
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
    window.addEventListener("auth-token-change", handleTokenChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("auth-token-change", handleTokenChange);
    };
  }, [account, chainId]);

  const authenticated = hasToken;
  const effectiveAccount = account || getLastAddress();
  const swrKey = chainId && effectiveAccount && authenticated ? [`api-trades`, chainId, effectiveAccount] : null;

  const {
    data: apiResponse,
    error,
    isLoading,
    mutate,
  } = useSWR<AccountTradesResponse>(
    swrKey,
    async () => {
      try {
        const result = await getAccountTrades(chainId!, effectiveAccount);
        return result;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[useAccountTrades] ❌ Trades fetch error", err);
        throw err;
      }
    },
    {
      ...defaultConfig,
      ...config,
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error("[useAccountTrades] onError", err);
        (config?.onError as any)?.(err);
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
 * Hook with auto-detected account from Canton session
 */
export function useUserAccountTrades(config?: SWRConfiguration): UseApiTradesResult {
  const { chainId } = useChainId();
  const account = useCantonAccountKey();
  return useAccountTrades(chainId, account, config);
}

/**
 * Feature flag to control the trades data source.
 * Also returns true when API trading mode is active.
 */
export function shouldUseApiTrades(): boolean {
  if (typeof window === "undefined") return false;
  // Check for API trading mode flag
  const tradeModeFlag = localStorage.getItem("trade_mode");
  if (tradeModeFlag === "true") return true;
  const envFlag = import.meta.env.VITE_USE_API_TRADES;
  const localFlag = localStorage.getItem("use_api_trades");
  return envFlag === "true" || localFlag === "true";
}

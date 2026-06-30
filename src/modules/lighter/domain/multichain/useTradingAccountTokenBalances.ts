/**
 * Trading Account Token Balances Hook
 *
 * This hook fetches account balances from the /balances API endpoint
 * instead of using on-chain multicall, which is required for API trading mode.
 */

import { useMemo, useEffect } from "react";
import useSWR, { SWRConfiguration } from "swr";

import { useTokensBalancesUpdates, useUpdatedTokensBalances } from "@/modules/lighter/context/TokensBalancesContext";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { getBalances, isAuthenticated } from "@/modules/lighter/api/custom/client";
import type { BalancesResponse } from "@/modules/lighter/api/types";
import { getTokenBySymbol, getV2Tokens } from "sdk/configs/tokens";
import type { ContractsChainId } from "sdk/configs/chains";

const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
};

/**
 * Extended balance data with available, frozen, and total amounts
 */
export type TradingAccountTokenBalanceData = {
  available: bigint;
  frozen: bigint;
  total: bigint;
};

export type TradingAccountTokenBalancesData = {
  [tokenAddress: string]: TradingAccountTokenBalanceData;
};

/**
 * Result type for the API-backed trading balances hook.
 */
export type TradingAccountBalancesDataResult = {
  balancesData?: TradingAccountTokenBalancesData;
  error?: Error;
};

function parseApiTokenUnits(value: string | undefined, decimals: number): bigint {
  const [integerPart = "0", decimalPart = ""] = (value || "0").split(".");
  const normalizedDecimalPart = decimalPart.slice(0, decimals);

  return BigInt(integerPart || "0") * 10n ** BigInt(decimals) + BigInt(normalizedDecimalPart.padEnd(decimals, "0") || "0");
}

/**
 * Convert API BalancesResponse to TradingAccountTokenBalancesData format
 * Maps by token address using getTokenBySymbol
 * Returns { available, frozen, total } for each token
 */
function convertApiBalancesToTokenBalancesData(
  chainId: ContractsChainId,
  apiBalances: Array<{ token: string; symbol?: string; available: string; frozen: string; total: string }> | undefined
): TradingAccountTokenBalancesData {
  if (!apiBalances) {
    return {};
  }

  const result: TradingAccountTokenBalancesData = {};

  for (const apiBalance of apiBalances) {
    try {
      // API may return "token" field (symbol) or "symbol" field
      // Use symbol if available, otherwise fall back to token field
      const symbolToLookup = apiBalance.symbol || apiBalance.token;
      if (!symbolToLookup) {
        console.warn("[convertApiBalancesToTokenBalancesData] No symbol found for balance", apiBalance);
        continue;
      }

      let token;
      try {
        token = getTokenBySymbol(chainId, symbolToLookup);
      } catch (_error) {
        token = getV2Tokens(chainId).find((tokenConfig) => {
          return tokenConfig.address.toLowerCase() === symbolToLookup.toLowerCase();
        });
      }

      if (!token) {
        console.warn("[convertApiBalancesToTokenBalancesData] Token not found", {
          symbol: symbolToLookup,
          chainId,
          apiBalance,
        });
        continue;
      }

      const available = parseApiTokenUnits(apiBalance.available, token.decimals);
      const frozen = parseApiTokenUnits(apiBalance.frozen, token.decimals);
      const total = parseApiTokenUnits(apiBalance.total, token.decimals);

      const balanceData: TradingAccountTokenBalanceData = {
        available,
        frozen,
        total,
      };

      // Store balance using both original address and lowercase address
      // This ensures matching works regardless of address format (checksum vs lowercase)
      result[token.address] = balanceData;
      result[token.address.toLowerCase()] = balanceData;
    } catch (error) {
      console.error("[convertApiBalancesToTokenBalancesData] Error processing balance", {
        error,
        apiBalance,
        chainId,
      });
    }
  }

  return result;
}

/**
 * Hook to fetch trading account balances from the backend API for exchange mode
 * Returns balances with { available, frozen, total } for each token
 */
export function useTradingAccountTokenBalances(
  chainId: ContractsChainId,
  params?: {
    enabled?: boolean;
    refreshInterval?: number;
  }
): TradingAccountBalancesDataResult {
  const { enabled = true, refreshInterval = 10000 } = params ?? {};
  const { connected, party, username } = useCantonSession();
  const account = connected ? party || username || "canton-session" : undefined;
  const authenticated = isAuthenticated(account, chainId);

  // Include chainId in the SWR key so each chain keeps an isolated cache entry.
  const swrKey = chainId && account && authenticated && enabled ? [`primit-balances`, chainId, account] : null;

  const {
    data: apiBalancesResponse,
    error,
    isLoading,
  } = useSWR<BalancesResponse>(
    swrKey,
    () => {
      return getBalances(chainId!, account);
    },
    { ...defaultConfig, refreshInterval, ...params }
  );

  const { resetTokensBalancesUpdates } = useTokensBalancesUpdates();

  const balancesData: TradingAccountTokenBalancesData | undefined = useMemo(() => {
    if (!enabled || !swrKey) {
      return {};
    }

    // If a request is active, return undefined to indicate still loading
    if (isLoading) {
      return undefined;
    }

    // If error or no data, return empty object to indicate loaded but empty
    if (!apiBalancesResponse?.balances) {
      return {};
    }

    const converted = convertApiBalancesToTokenBalancesData(chainId, apiBalancesResponse.balances);
    return converted;
  }, [apiBalancesResponse?.balances, chainId, isLoading, enabled, swrKey]);

  // Reset balance updates in useEffect to avoid updating state during render
  useEffect(() => {
    if (balancesData !== undefined) {
      resetTokensBalancesUpdates(Object.keys(balancesData), "tradingAccount");
    }
  }, [balancesData, resetTokensBalancesUpdates]);

  // Note: useUpdatedTokensBalances expects TokenBalancesData (bigint),
  // but we're passing TradingAccountTokenBalancesData ({ available, frozen, total }).
  // This is intentional. The balance updates context handles the richer shape.
  const updatedBalancesData = useUpdatedTokensBalances(balancesData as any, "tradingAccount") as
    | TradingAccountTokenBalancesData
    | undefined;

  return {
    balancesData: updatedBalancesData,
    error,
  };
}

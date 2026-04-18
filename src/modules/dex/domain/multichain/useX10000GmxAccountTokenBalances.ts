/**
 * X10000 GMX Account Token Balances Hook
 *
 * This hook fetches account balances from the /balances API endpoint
 * instead of using on-chain multicall, which is required for x10000 mode.
 */

import { useMemo, useEffect } from "react";
import useSWR, { SWRConfiguration } from "swr";
import { useAccount } from "wagmi";

import {
  useTokensBalancesUpdates,
  useUpdatedTokensBalances,
} from "context/TokensBalancesContext/TokensBalancesContextProvider";
import type { BalancesDataResult } from "domain/synthetics/tokens";
import { getBalances, isAuthenticated } from "@/modules/cex/lib/api/custom/client";
import type { BalancesResponse } from "@/modules/cex/lib/api/types";
import { getTokenBySymbol } from "sdk/configs/tokens";
import type { ContractsChainId } from "sdk/configs/chains";
import type { TokenBalancesData } from "domain/synthetics/tokens/types";
import { parseUnits } from "viem";

const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
};

/**
 * Extended balance data with available, frozen, and total amounts
 */
export type X10000TokenBalanceData = {
  available: bigint;
  frozen: bigint;
  total: bigint;
};

export type X10000TokenBalancesData = {
  [tokenAddress: string]: X10000TokenBalanceData;
};

/**
 * Result type for x10000 balances hook
 */
export type X10000BalancesDataResult = {
  balancesData?: X10000TokenBalancesData;
  error?: Error;
};

/**
 * Convert API BalancesResponse to X10000TokenBalancesData format
 * Maps by token address using getTokenBySymbol
 * Returns { available, frozen, total } for each token
 */
function convertApiBalancesToTokenBalancesData(
  chainId: ContractsChainId,
  apiBalances: Array<{ token: string; symbol?: string; available: string; frozen: string; total: string }> | undefined
): X10000TokenBalancesData {
  if (!apiBalances) {
    return {};
  }

  const result: X10000TokenBalancesData = {};

  for (const apiBalance of apiBalances) {
    try {
      // API may return "token" field (symbol) or "symbol" field
      // Use symbol if available, otherwise fall back to token field
      const symbolToLookup = apiBalance.symbol || apiBalance.token;
      if (!symbolToLookup) {
        console.warn("[convertApiBalancesToTokenBalancesData] No symbol found for balance", apiBalance);
        continue;
      }

      // Get token by symbol to find the address
      const token = getTokenBySymbol(chainId, symbolToLookup);
      if (!token) {
        console.warn("[convertApiBalancesToTokenBalancesData] Token not found", {
          symbol: symbolToLookup,
          chainId,
          apiBalance
        });
        continue;
      }

      // Parse all three balance fields
      const available = parseUnits(apiBalance.available || "0", token.decimals);
      const frozen = parseUnits(apiBalance.frozen || "0", token.decimals);
      const total = parseUnits(apiBalance.total || "0", token.decimals);

      const balanceData: X10000TokenBalanceData = {
        available,
        frozen,
        total,
      };

      // Store balance using both original address and lowercase address
      // This ensures matching works regardless of address format (checksum vs lowercase)
      result[token.address] = balanceData;
      result[token.address.toLowerCase()] = balanceData;

      console.log("[convertApiBalancesToTokenBalancesData] Stored balance", {
        symbol: symbolToLookup,
        tokenAddress: token.address,
        available: available.toString(),
        frozen: frozen.toString(),
        total: total.toString(),
        chainId
      });
    } catch (error) {
      console.error("[convertApiBalancesToTokenBalancesData] Error processing balance", {
        error,
        apiBalance,
        chainId
      });
    }
  }

  return result;
}

/**
 * Hook to fetch GMX account balances from API for x10000 mode
 * Returns balances with { available, frozen, total } for each token
 */
export function useX10000GmxAccountTokenBalances(
  chainId: ContractsChainId,
  params?: {
    enabled?: boolean;
    refreshInterval?: number;
  }
): X10000BalancesDataResult {
  const { enabled = true, refreshInterval = 10000 } = params ?? {};
  const { address: account } = useAccount();
  const authenticated = isAuthenticated(account, chainId);

  // SWR key includes chainId to ensure separate cache entries for different chains
  const swrKey = chainId && account && authenticated && enabled
    ? [`x10000-ztdx-balances`, chainId, account]
    : null;

  const { data: apiBalancesResponse, error, isLoading } = useSWR<BalancesResponse>(
    swrKey,
    () => {
      return getBalances(chainId!, account);
    },
    { ...defaultConfig, refreshInterval, ...params }
  );

  const { resetTokensBalancesUpdates } = useTokensBalancesUpdates();

  const balancesData: X10000TokenBalancesData | undefined = useMemo(() => {
    // If loading or disabled, return undefined to indicate still loading
    if (isLoading || !enabled) {
      return undefined;
    }

    // If error or no data, return empty object to indicate loaded but empty
    if (!apiBalancesResponse?.balances) {
      return {};
    }

    const converted = convertApiBalancesToTokenBalancesData(chainId, apiBalancesResponse.balances);
    return converted;
  }, [apiBalancesResponse?.balances, chainId, isLoading, enabled, error, account, authenticated]);

  // Reset balance updates in useEffect to avoid updating state during render
  useEffect(() => {
    if (balancesData !== undefined) {
      resetTokensBalancesUpdates(Object.keys(balancesData), "gmxAccount");
    }
  }, [balancesData, resetTokensBalancesUpdates]);

  // Note: useUpdatedTokensBalances expects TokenBalancesData (bigint),
  // but we're passing X10000TokenBalancesData ({ available, frozen, total })
  // This is intentional - the balance updates context will handle the new format
  const updatedBalancesData = useUpdatedTokensBalances(balancesData as any, "gmxAccount") as X10000TokenBalancesData | undefined;

  return {
    balancesData: updatedBalancesData,
    error,
  };
}


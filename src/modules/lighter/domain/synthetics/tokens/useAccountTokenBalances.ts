/**
 * Account Token Balances Hook
 *
 * This hook fetches account balances from the /balances API endpoint
 * Uses the new user account system instead of trading account system
 */

import { useEffect, useMemo } from "react";

import { useTokensBalancesUpdates, useUpdatedTokensBalances } from "@/modules/lighter/context/TokensBalancesContext";
import { isAuthenticated, usePrimitUserBalances } from "@/modules/lighter/api";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { getTokenBySymbol, getV2Tokens } from "sdk/configs/tokens";
import type { ContractsChainId } from "sdk/configs/chains";

import type { BalancesDataResult, TokenBalancesData } from "./types";

function parseApiTokenUnits(value: string | undefined, decimals: number): bigint {
  const [integerPart = "0", decimalPart = ""] = (value || "0").split(".");
  const normalizedDecimalPart = decimalPart.slice(0, decimals);

  return BigInt(integerPart || "0") * 10n ** BigInt(decimals) + BigInt(normalizedDecimalPart.padEnd(decimals, "0") || "0");
}

/**
 * Hook to get account balances from REST API (replaces useTradingAccountTokenBalances)
 * Uses the new user account system instead of trading account system
 */
export function useAccountTokenBalances(
  chainId: ContractsChainId,
  params?: {
    enabled?: boolean;
    refreshInterval?: number;
  }
): BalancesDataResult {
  const { enabled = true, refreshInterval } = params ?? {};
  const { connected, party, username } = useCantonSession();
  const accountKey = connected ? party || username || "canton-session" : undefined;
  const authenticated = isAuthenticated(accountKey, chainId);

  // Get balances from REST API
  const {
    data: balancesResponse,
    error,
    isLoading,
  } = usePrimitUserBalances({
    refreshInterval,
    revalidateOnFocus: false,
  });

  // Convert API balances to TokenBalancesData format
  const balancesData = useMemo<TokenBalancesData | undefined>(() => {
    if (!enabled || !accountKey || !authenticated) {
      return {};
    }

    // If a request is active, return undefined
    if (isLoading) {
      return undefined;
    }

    // If error or no data, return empty object to indicate loaded but empty
    if (!balancesResponse?.balances) {
      return {};
    }

    // Convert API balances to TokenBalancesData
    const result: TokenBalancesData = {};

    for (const balance of balancesResponse.balances) {
      // API returns token as symbol (e.g., "USDT"), not address
      // Try to find token by symbol first, then by address as fallback
      let token;
      try {
        token = getTokenBySymbol(chainId, balance.token);
      } catch (e) {
        // If not found by symbol, try to find by address (in case API returns address)
        const tokens = getV2Tokens(chainId);
        token = tokens.find((t) => t.address.toLowerCase() === balance.token.toLowerCase());
      }

      if (!token) {
        // Skip tokens not in our token list
        console.warn(`[useAccountTokenBalances] Token not found: ${balance.token} on chain ${chainId}`);
        continue;
      }

      // Convert available balance string to bigint
      // API returns balance as string (e.g., "20000.000000000000000000")
      try {
        // Parse the balance string, assuming it's in the token's decimals
        const decimals = token.decimals || 18;
        const balanceValue = parseApiTokenUnits(balance.available, decimals);
        result[token.address] = balanceValue;
        result[token.address.toLowerCase()] = balanceValue;
      } catch (e) {
        // If parsing fails, skip this token
        console.warn(`[useAccountTokenBalances] Failed to parse balance for token ${balance.token}:`, e);
        continue;
      }
    }

    return result;
  }, [balancesResponse, chainId, enabled, isLoading, accountKey, authenticated]);

  const { resetTokensBalancesUpdates } = useTokensBalancesUpdates();

  // Reset updates when balances are loaded (even if empty object, it means loaded)
  useEffect(() => {
    if (balancesData !== undefined) {
      resetTokensBalancesUpdates(Object.keys(balancesData), "tradingAccount");
    }
  }, [balancesData, resetTokensBalancesUpdates]);

  // Apply WebSocket and optimistic updates (use "tradingAccount" for backward compatibility)
  const updatedBalancesData = useUpdatedTokensBalances(balancesData, "tradingAccount");

  return {
    balancesData: updatedBalancesData,
    error: error as Error | undefined,
  };
}

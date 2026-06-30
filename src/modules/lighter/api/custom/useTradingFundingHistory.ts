/**
 * Hook to fetch deposit and withdraw history for the exchange trading mode
 */

import { useMemo, useEffect, useState } from "react";
import useSWR, { SWRConfiguration } from "swr";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId } from "lib/chains";
import { getDepositHistory } from "./deposit";
import { getWithdrawHistory, getLastAddress, isAuthenticated } from "./client";
import type { DepositRecord, WithdrawRecord } from "../types";

const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  refreshInterval: 30000, // Refresh every 30 seconds
};

export interface TradingFundingHistoryItem {
  id: string;
  type: "deposit" | "withdraw";
  token: string;
  amount: string;
  tx_hash: string | null;
  status: string;
  created_at: number;
  // Additional fields for withdraw
  nonce?: number;
  expiry?: number;
  backend_signature?: string;
}

type UseTradingFundingHistoryResult = {
  fundingHistory: TradingFundingHistoryItem[] | undefined;
  isLoading: boolean;
  error?: Error;
  mutate: () => void;
};

// `enabled` is not a standard SWR field; we honor it locally by nulling the
// SWR key so the fetcher never runs when the caller doesn't want it. Without
// this gate, MainView's non-trading path still triggered repeated
// /deposit/history + /withdraw/history requests that throw
// "Authentication required" and spam Sentry.
type UseTradingFundingHistoryConfig = SWRConfiguration & { enabled?: boolean };

export function useTradingFundingHistory(
  chainId: number | undefined,
  config?: UseTradingFundingHistoryConfig
): UseTradingFundingHistoryResult {
  const enabled = config?.enabled !== false;
  const { chainId: appChainId } = useChainId();
  const { connected, party, username } = useCantonSession();
  const account = connected ? party || username || "canton-session" : undefined;
  const effectiveChainId = chainId || appChainId;

  // Use state to track token existence so component re-renders when token changes
  const [hasToken, setHasToken] = useState(() => {
    // Use same logic as apiFetch: try account first, then fallback to last address
    let targetAddress: string | null | undefined = account;
    if (!targetAddress) {
      targetAddress = getLastAddress();
    }
    return isAuthenticated(targetAddress, effectiveChainId);
  });

  // Poll for token changes to trigger re-render
  useEffect(() => {
    const checkToken = () => {
      // Use same logic as apiFetch: try account first, then fallback to last address
      let targetAddress: string | null | undefined = account;
      if (!targetAddress) {
        targetAddress = getLastAddress();
      }
      const newHasToken = isAuthenticated(targetAddress, effectiveChainId);
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
  }, [account, effectiveChainId]);

  const authenticated = hasToken;
  const depositKey =
    enabled && effectiveChainId && account && authenticated
      ? [`trade-deposit-history`, effectiveChainId, account]
      : null;
  const withdrawKey =
    enabled && effectiveChainId && account && authenticated
      ? [`trade-withdraw-history`, effectiveChainId, account]
      : null;

  // Fetch deposit history
  const {
    data: depositData,
    error: depositError,
    isLoading: isDepositLoading,
    mutate: mutateDeposits,
  } = useSWR<{ deposits: DepositRecord[] }>(
    depositKey,
    async () => {
      try {
        const result = await getDepositHistory(effectiveChainId!, account);
        console.log("[useTradingFundingHistory] ✅ Deposit history fetched", {
          depositCount: result.deposits?.length || 0,
        });
        return result;
      } catch (err) {
        console.error("[useTradingFundingHistory] ❌ Deposit history fetch error", err);
        throw err;
      }
    },
    {
      ...defaultConfig,
      ...config,
      onError: (err) => {
        console.error("[useTradingFundingHistory] Deposit onError", err);
        (config?.onError as any)?.(err);
      },
    }
  );

  // Fetch withdraw history
  const {
    data: withdrawData,
    error: withdrawError,
    isLoading: isWithdrawLoading,
    mutate: mutateWithdraws,
  } = useSWR<{ withdrawals: WithdrawRecord[] }>(
    withdrawKey,
    async () => {
      try {
        const result = await getWithdrawHistory(effectiveChainId!, account);
        console.log("[useTradingFundingHistory] ✅ Withdraw history fetched", {
          withdrawCount: result.withdrawals?.length || 0,
        });
        return result;
      } catch (err) {
        console.error("[useTradingFundingHistory] ❌ Withdraw history fetch error", err);
        throw err;
      }
    },
    {
      ...defaultConfig,
      ...config,
      onError: (err) => {
        console.error("[useTradingFundingHistory] Withdraw onError", err);
        (config?.onError as any)?.(err);
      },
    }
  );

  // Combine and sort by created_at (newest first)
  const fundingHistory = useMemo(() => {
    const items: TradingFundingHistoryItem[] = [];

    // Add deposits
    if (depositData?.deposits) {
      for (const deposit of depositData.deposits) {
        items.push({
          id: deposit.id,
          type: "deposit",
          token: deposit.token,
          amount: deposit.amount,
          tx_hash: deposit.tx_hash,
          status: deposit.status,
          created_at: deposit.created_at,
        });
      }
    }

    // Add withdrawals
    if (withdrawData?.withdrawals) {
      for (const withdraw of withdrawData.withdrawals) {
        items.push({
          id: withdraw.id,
          type: "withdraw",
          token: withdraw.token,
          amount: withdraw.amount,
          tx_hash: withdraw.tx_hash || null,
          status: withdraw.status,
          created_at: withdraw.created_at,
          nonce: withdraw.nonce,
          expiry: withdraw.expiry,
          backend_signature: withdraw.backend_signature,
        });
      }
    }

    // Sort by created_at descending (newest first)
    items.sort((a, b) => b.created_at - a.created_at);

    return items;
  }, [depositData?.deposits, withdrawData?.withdrawals]);

  const mutate = () => {
    mutateDeposits();
    mutateWithdraws();
  };

  return {
    fundingHistory,
    isLoading: isDepositLoading || isWithdrawLoading,
    error: depositError || withdrawError,
    mutate,
  };
}

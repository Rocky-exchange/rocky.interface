import useSWR from "swr";

import { ContractsChainId } from "config/chains";
import { getReferralDashboard } from "./client";
import { useAuthToken } from "./useAuthToken";

/**
 * Hook to fetch referral dashboard data
 * GET /api/v1/referral/dashboard
 */
export function useReferralDashboard(chainId: ContractsChainId | undefined, options?: { enabled?: boolean }) {
  const { token } = useAuthToken(chainId);
  const enabled = options?.enabled !== false && Boolean(chainId && token);

  const { data, error, isLoading, mutate } = useSWR(
    enabled ? [`referral-dashboard`, chainId, token] : null,
    async () => {
      if (!chainId) {
        throw new Error("Chain ID is required");
      }
      return getReferralDashboard(chainId);
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  return {
    dashboard: data,
    isLoading,
    error,
    mutate,
  };
}


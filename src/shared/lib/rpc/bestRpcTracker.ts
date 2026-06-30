import { useMemo } from "react";

import { getFallbackRpcUrl } from "config/chains";

export const RPC_TRACKER_UPDATE_EVENT = "rpc-tracker-update-event";

export function getCurrentRpcUrls(rawChainId: number): { primary: string; secondary: string } {
  const fallback = getFallbackRpcUrl(rawChainId);

  return {
    primary: fallback,
    secondary: fallback,
  };
}

export function useCurrentRpcUrls(chainId: number | undefined): { primary?: string; secondary?: string } {
  return useMemo(() => (chainId ? getCurrentRpcUrls(chainId) : {}), [chainId]);
}

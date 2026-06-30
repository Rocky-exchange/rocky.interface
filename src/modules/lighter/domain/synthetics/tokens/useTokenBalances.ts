import type { ContractsChainId } from "sdk/configs/chains";

import type { BalancesDataResult } from "./types";

export function useTokenBalances(
  chainId: ContractsChainId,
  params?: {
    overrideAccount?: string | undefined;
    overrideTokenList?: {
      address: string;
      isSynthetic?: boolean;
    }[];
    refreshInterval?: number;
    enabled?: boolean;
  }
): BalancesDataResult {
  void chainId;
  void params;

  return {
    balancesData: {},
    error: undefined,
  };
}

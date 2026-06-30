import type { SettlementChainId } from "config/chains";

export function useEmptyTradingAccounts(chainIds: SettlementChainId[] | undefined): {
  emptyTradingAccounts: Partial<Record<SettlementChainId, boolean>> | undefined;
  isLoading: boolean;
} {
  const emptyTradingAccounts = chainIds?.reduce<Partial<Record<SettlementChainId, boolean>>>((acc, chainId) => {
    acc[chainId] = false;
    return acc;
  }, {});

  return {
    emptyTradingAccounts,
    isLoading: false,
  };
}

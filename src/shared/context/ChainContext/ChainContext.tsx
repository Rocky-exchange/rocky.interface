import { createContext, PropsWithChildren, useContext, useMemo } from "react";

import { DEFAULT_CHAIN_ID } from "config/chains";
import { isSourceChain } from "config/multichain";
import { useChainIdImpl } from "lib/chains/useChainIdImpl";
import { ContractsChainId, SettlementChainId, SourceChainId } from "sdk/configs/chains";

export type ChainContext = {
  chainId: ContractsChainId;
  srcChainId: SourceChainId | undefined;
  isConnectedToChainId: boolean | undefined;
};

const initialChainId: ContractsChainId = DEFAULT_CHAIN_ID;

export const context = createContext<ChainContext>({
  chainId: initialChainId,
  srcChainId: isSourceChain(initialChainId) ? initialChainId : undefined,
  isConnectedToChainId: false,
});

export function ChainContextProvider({ children }: PropsWithChildren) {
  const { chainId, srcChainId, isConnectedToChainId } = useChainIdImpl(initialChainId as SettlementChainId);

  const value = useMemo(
    () => ({
      chainId,
      srcChainId,
      isConnectedToChainId,
    }),
    [chainId, srcChainId, isConnectedToChainId]
  );

  return <context.Provider value={value}>{children}</context.Provider>;
}

export const useChainContext = () => useContext(context);

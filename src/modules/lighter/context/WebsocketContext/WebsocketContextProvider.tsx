import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from "react";

import type { SourceChainId } from "config/chains";
import { EMPTY_OBJECT } from "lib/objects";

type CantonDisabledProvider = undefined;

export type WebsocketContextType = {
  wsProvider: CantonDisabledProvider;
  wsSourceChainProviders: Partial<Record<SourceChainId, CantonDisabledProvider>>;
  setAdditionalSourceChain: (chainId: SourceChainId, name: string) => void;
  removeAdditionalSourceChain: (chainId: SourceChainId, name: string) => void;
};

const NOOP_CONTEXT: WebsocketContextType = {
  wsProvider: undefined,
  wsSourceChainProviders: EMPTY_OBJECT,
  setAdditionalSourceChain: () => undefined,
  removeAdditionalSourceChain: () => undefined,
};

export const WsContext = createContext<WebsocketContextType>(NOOP_CONTEXT);

export function useWebsocketProvider() {
  return useContext(WsContext);
}

export function WebsocketContextProvider({ children }: { children: ReactNode }) {
  const setAdditionalSourceChain = useCallback(() => undefined, []);
  const removeAdditionalSourceChain = useCallback(() => undefined, []);

  const value = useMemo(
    () => ({
      wsProvider: undefined,
      wsSourceChainProviders: EMPTY_OBJECT,
      setAdditionalSourceChain,
      removeAdditionalSourceChain,
    }),
    [removeAdditionalSourceChain, setAdditionalSourceChain]
  );

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
}

export function useWsAdditionalSourceChains(chainId: SourceChainId | undefined, name: string) {
  const { setAdditionalSourceChain, removeAdditionalSourceChain } = useWebsocketProvider();

  useEffect(() => {
    if (!chainId) {
      return;
    }

    setAdditionalSourceChain(chainId, name);

    return () => {
      removeAdditionalSourceChain(chainId, name);
    };
  }, [chainId, name, removeAdditionalSourceChain, setAdditionalSourceChain]);
}

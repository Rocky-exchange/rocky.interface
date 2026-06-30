import React, { createContext, useCallback, useContext, useMemo } from "react";

import { PERMITS_DISABLED_KEY } from "config/localStorage";
import { useLocalStorageSerializeKey } from "lib/localStorage";
import type { SignedTokenPermit } from "sdk/types/tokens";

export type TokenPermitsState = {
  tokenPermits: SignedTokenPermit[];
  addTokenPermit: AddTokenPermitFn;
  setIsPermitsDisabled: (disabled: boolean) => void;
  isPermitsDisabled: boolean;
  resetTokenPermits: () => void;
};

export type AddTokenPermitFn = (tokenAddress: string, spenderAddress: string, value: bigint) => Promise<void>;

const TokenPermitsContext = createContext<TokenPermitsState | undefined>(undefined);

export function useTokenPermitsContext() {
  const context = useContext(TokenPermitsContext);
  if (!context) {
    throw new Error("useTokenPermits must be used within TokenPermitsContextProvider");
  }
  return context;
}

export function TokenPermitsContextProvider({ children }: { children: React.ReactNode }) {
  const [isPermitsDisabled, setIsPermitsDisabled] = useLocalStorageSerializeKey<boolean>(PERMITS_DISABLED_KEY, true);

  const addTokenPermit = useCallback(async () => undefined, []);
  const resetTokenPermits = useCallback(() => undefined, []);

  const state = useMemo<TokenPermitsState>(
    () => ({
      isPermitsDisabled: true,
      setIsPermitsDisabled,
      tokenPermits: [],
      addTokenPermit,
      resetTokenPermits,
    }),
    [addTokenPermit, resetTokenPermits, setIsPermitsDisabled]
  );

  void isPermitsDisabled;

  return <TokenPermitsContext.Provider value={state}>{children}</TokenPermitsContext.Provider>;
}

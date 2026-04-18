/**
 * X10000 State Context
 *
 * This context forces API mode for the 10000x trading page.
 * When isX10000Mode is true, all data fetching uses backend API
 * instead of on-chain multicall.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface X10000StateContextValue {
  isX10000Mode: boolean;
  selectedSymbol: string | null;
  setSelectedSymbol: (symbol: string) => void;
}

const X10000StateContext = createContext<X10000StateContextValue>({
  isX10000Mode: false,
  selectedSymbol: null,
  setSelectedSymbol: () => {},
});

export function useX10000State() {
  return useContext(X10000StateContext);
}

/**
 * Check if we're in X10000 mode (should use API for all data)
 */
export function useIsX10000Mode(): boolean {
  const context = useContext(X10000StateContext);
  return context.isX10000Mode;
}

/**
 * Check if X10000 mode is active (can be called outside React)
 */
export function isX10000ModeActive(): boolean {
  // 始终返回 true
  return true;
}

/**
 * Enable X10000 mode
 */
export function enableX10000Mode(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("x10000_mode", "true");
  }
}

/**
 * Disable X10000 mode
 */
export function disableX10000Mode(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("x10000_mode");
  }
}

interface X10000StateProviderProps {
  children: ReactNode;
}

// Storage key is reused by selectors (e.g. selectX10000ChartToken) to read current symbol.
export const SELECTED_SYMBOL_STORAGE_KEY = "x10000_selected_symbol";
// Default symbol matches backend API format (e.g., "BTC-USD")
const DEFAULT_SYMBOL = "BTC-USD";

/**
 * Provider that enables X10000 mode (forced API data source)
 */
export function X10000StateProvider({ children }: X10000StateProviderProps) {
  // Initialize selected symbol from localStorage or default
  const [selectedSymbol, setSelectedSymbolState] = useState<string | null>(() => {
    if (typeof window === "undefined") return DEFAULT_SYMBOL;
    return localStorage.getItem(SELECTED_SYMBOL_STORAGE_KEY) || DEFAULT_SYMBOL;
  });

  const setSelectedSymbol = useCallback((symbol: string) => {
    setSelectedSymbolState(symbol);
    if (typeof window !== "undefined") {
      localStorage.setItem(SELECTED_SYMBOL_STORAGE_KEY, symbol);
    }
  }, []);

  // Set X10000 mode flag on mount, clear on unmount
  useEffect(() => {
    enableX10000Mode();
    return () => {
      disableX10000Mode();
    };
  }, []);

  const value = useMemo<X10000StateContextValue>(
    () => ({
      isX10000Mode: true,
      selectedSymbol,
      setSelectedSymbol,
    }),
    [selectedSymbol, setSelectedSymbol]
  );

  return <X10000StateContext.Provider value={value}>{children}</X10000StateContext.Provider>;
}

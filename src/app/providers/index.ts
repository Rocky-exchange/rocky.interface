/**
 * App-level Global Providers
 *
 * This module exports all global providers that are used across the entire application.
 * These providers are business-agnostic and provide core functionality.
 *
 * Module-specific providers should be imported from their respective modules:
 * - Lighter: @/modules/lighter
 */

// Theme Management
export { ThemeProvider, useTheme, type Theme } from "shared/context/ThemeContext/ThemeContext";

// UI theme selection via document.documentElement data-ui-theme.
export {
  DesignSystemProvider,
  useDesignSystem,
  type DesignSystem,
  type DesignSystemMode,
  type DesignSystemContextValue,
} from "shared/context/DesignSystemContext/DesignSystemContext";

// Global App State
export { GlobalStateProvider, useGlobalContext } from "@/modules/lighter/context/GlobalContext/GlobalContextProvider";

// App Settings (slippage, debug, etc.)
export {
  SettingsContextProvider,
  useSettings,
  type SettingsContextType,
} from "@/modules/lighter/context/SettingsContext";

// WebSocket Infrastructure
export { WebsocketContextProvider } from "@/modules/lighter/context/WebsocketContext";

// Chain Context (currently global, may move to DEX in future)
export { ChainContextProvider, useChainContext, context as chainContext } from "shared/context/ChainContext/ChainContext";

// Pending Transactions
export { PendingTxnsContextProvider } from "@/modules/lighter/context/PendingTxnsContext";

/**
 * App-level Global Providers
 *
 * This module exports all global providers that are used across the entire application.
 * These providers are business-agnostic and provide core functionality.
 *
 * Module-specific providers should be imported from their respective modules:
 * - DEX: @/modules/dex/store
 * - CEX: @/modules/cex/store
 */

// Theme Management
export { ThemeProvider, useTheme, type Theme } from "context/ThemeContext/ThemeContext";

// Global App State
export { GlobalStateProvider, useGlobalContext } from "context/GlobalContext/GlobalContextProvider";

// App Settings (slippage, debug, etc.)
export { SettingsContextProvider, useSettings, type SettingsContextType } from "context/SettingsContext/SettingsContextProvider";

// WebSocket Infrastructure
export { WebsocketContextProvider } from "context/WebsocketContext/WebsocketContextProvider";

// Chain Context (currently global, may move to DEX in future)
export { ChainContextProvider, useChainContext, context as chainContext } from "context/ChainContext/ChainContext";

// Pending Transactions
export { PendingTxnsContextProvider } from "context/PendingTxnsContext/PendingTxnsContext";

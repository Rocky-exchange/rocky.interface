/**
 * Shared Hooks
 *
 * Pure React hooks with NO business logic.
 * These can be safely used by any module (dex, cex, landing).
 */

// Browser & Window hooks
export * from "./useBowser";
export * from "./useBreakpoints";
export * from "./useIsWindowVisible";
export * from "./useHasPageLostFocus";

// UI Interaction hooks
export * from "./useCursorInside";
export * from "./useOutsideClick";
export * from "./useLoadImage";

// State management hooks
export * from "./usePrevious";
export * from "./useSafeState";
export * from "./useLatestValueRef";

// Routing hooks
export * from "./useSearchParams";
export * from "./useRouteQuery";
export * from "./useHashQueryParams";

// Async & Timing hooks
export * from "./usePolling";
export * from "./useThrottledAsync";
export * from "./useEffectOnce";

// Debounce hooks
export * from "./debounce";

// Debug hooks
export * from "./useEffectDebugger";

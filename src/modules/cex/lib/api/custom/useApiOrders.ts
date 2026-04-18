/**
 * useApiOrders - Hook that fetches orders from REST API
 * and converts them to SDK OrdersData format for compatibility
 */

import { useMemo } from "react";
import useSWR, { SWRConfiguration } from "swr";
import { useAccount } from "wagmi";

import type { OrdersData } from "sdk/types/orders";

import {
  getOrders,
  getTriggerOrders,
  getStoredToken,
  getLastAddress,
  type OrdersResponse,
} from "./client";
import { convertApiOrdersToSdk } from "./orderAdapter";
import { useEffect, useState } from "react";

// Default SWR configuration for orders
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 2000,
  refreshInterval: 5000,
  keepPreviousData: true, // Keep showing data even when key changes temporarily
};

import type {
  Order as ApiOrder,
  TriggerOrder,
  TriggerType,
  TriggerStatus,
  OrderType,
  OrderStatus,
} from "../types";

/**
 * Convert TriggerOrder to Order format for unified display
 */
function convertTriggerOrderToOrder(trigger: TriggerOrder): ApiOrder {
  // Map trigger_type to order_type (handle both PascalCase from API and snake_case)
  const orderTypeMap: Record<string, OrderType> = {
    StopLoss: "stop_market",
    TakeProfit: "take_profit",
    StopLossLimit: "stop_limit",
    TakeProfitLimit: "take_profit_limit",
    TrailingStop: "stop_market",
    // Legacy lowercase support
    stop_loss: "stop_market",
    take_profit: "take_profit",
    stop_loss_limit: "stop_limit",
    take_profit_limit: "take_profit_limit",
  };

  // Map trigger status to order status (handle both PascalCase from API and lowercase)
  const statusMap: Record<string, OrderStatus> = {
    Active: "open", // Trigger orders that are active
    Triggered: "filled", // Trigger has fired and order executed
    Cancelled: "cancelled",
    Expired: "expired",
    Failed: "rejected",
    // Legacy lowercase support
    pending: "open",
    triggered: "filled",
    cancelled: "cancelled",
    expired: "expired",
    failed: "rejected",
  };

  // Normalize side to lowercase (API returns "Buy"/"Sell", we need "buy"/"sell")
  const normalizedSide = trigger.side.toLowerCase();

  return {
    id: trigger.id,
    symbol: trigger.market_symbol || trigger.symbol || "",
    side: normalizedSide,
    order_type: orderTypeMap[trigger.trigger_type] || "limit",
    size: trigger.size,
    price: trigger.limit_price || undefined,
    trigger_price: trigger.trigger_price,
    filled_size: "0", // Trigger orders haven't been filled yet
    status: statusMap[trigger.status] || "open",
    reduce_only: trigger.reduce_only,
    time_in_force: "GTC",
    created_at: trigger.created_at,
    updated_at: trigger.updated_at || trigger.created_at,
    // Preserve position_id for TP/SL cancellation (not part of standard Order type)
    position_id: trigger.position_id,
  } as ApiOrder;
}

type UseApiOrdersResult = {
  ordersData?: OrdersData;
  apiOrders?: ApiOrder[]; // Raw API orders for x10000 mode
  isLoading: boolean;
  error?: Error;
  mutate: () => void;
};

/**
 * Fetch orders from API and convert to SDK format
 */
export function useApiOrders(
  chainId: number | undefined,
  account: string | null | undefined,
  config?: SWRConfiguration
): UseApiOrdersResult {
  // Use state to track token existence so component re-renders when token changes
  const [hasToken, setHasToken] = useState(() => {
    // Use same logic as apiFetch: try account first, then fallback to last address
    let targetAddress = account;
    if (!targetAddress) {
      targetAddress = getLastAddress();
    }
    const token = getStoredToken(targetAddress, chainId);
    return token !== null;
  });

  // Poll for token changes to trigger re-render
  useEffect(() => {
    const checkToken = () => {
      // Use same logic as apiFetch: try account first, then fallback to last address
      let targetAddress = account;
      if (!targetAddress) {
        targetAddress = getLastAddress();
      }
      const token = getStoredToken(targetAddress, chainId);
      const newHasToken = token !== null;
      
      setHasToken((prev) => {
        if (prev !== newHasToken) {
          return newHasToken;
        }
        return prev;
      });
    };

    checkToken();
    const interval = setInterval(checkToken, 500);
    
    // Also listen for token change events
    const handleTokenChange = () => {
      checkToken();
    };
    window.addEventListener("x10000-token-change", handleTokenChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("x10000-token-change", handleTokenChange);
    };
  }, [account, chainId]);
  
  const authenticated = hasToken;
  // Use account or fallback to lastAddress for SWR key
  const effectiveAccount = account || getLastAddress();
  const swrKey = chainId && effectiveAccount && authenticated ? [`api-orders`, chainId, effectiveAccount] : null;

  // Fetch both account orders and trigger orders, then merge
  const {
    data: mergedResponse,
    error,
    isLoading,
    mutate,
  } = useSWR<OrdersResponse>(
    swrKey,
    async () => {
      try {
        // Fetch both endpoints in parallel using Promise.allSettled
        // This ensures that if one fails, the other can still succeed
        const [accountOrdersResult, triggerOrdersResult] = await Promise.allSettled([
          getOrders(chainId!, effectiveAccount),
          getTriggerOrders(chainId!, effectiveAccount),
        ]);

        // Extract orders from successful responses
        const accountOrders =
          accountOrdersResult.status === "fulfilled" ? accountOrdersResult.value.orders : [];
        const triggerOrders =
          triggerOrdersResult.status === "fulfilled" ? triggerOrdersResult.value.data : [];

        // Log results
        console.log("[useApiOrders] ✅ Orders fetched", {
          accountOrdersCount: accountOrders.length,
          triggerOrdersCount: triggerOrders.length,
          accountOrdersError: accountOrdersResult.status === "rejected" ? accountOrdersResult.reason : null,
          triggerOrdersError: triggerOrdersResult.status === "rejected" ? triggerOrdersResult.reason : null,
        });

        // Convert trigger orders to Order format
        const convertedTriggerOrders = triggerOrders.map(convertTriggerOrderToOrder);

        // Merge orders - use Map to deduplicate by ID (last wins)
        const ordersMap = new Map<string, ApiOrder>();

        // Add account orders first
        accountOrders.forEach((order) => ordersMap.set(order.id, order));

        // Add converted trigger orders (will overwrite if same ID)
        convertedTriggerOrders.forEach((order) => ordersMap.set(order.id, order));

        // Convert back to array
        const mergedOrders = Array.from(ordersMap.values());

        return {
          orders: mergedOrders,
        };
      } catch (err) {
        console.error("[useApiOrders] ❌ Orders fetch error", err);
        throw err;
      }
    },
    {
      ...defaultConfig,
      ...config,
      onError: (err, key, swrConfig) => {
        console.error("[useApiOrders] onError", err);
        config?.onError?.(err, key, swrConfig);
      },
    }
  );

  const apiResponse = mergedResponse;

  const ordersData = useMemo(() => {
    if (!apiResponse?.orders || !chainId || !effectiveAccount) {
      return undefined;
    }

    return convertApiOrdersToSdk(apiResponse.orders, chainId, effectiveAccount);
  }, [apiResponse?.orders, chainId, effectiveAccount]);

  return {
    ordersData,
    apiOrders: apiResponse?.orders, // Return raw API orders for x10000 mode
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

/**
 * Hook with auto-detected account from wagmi
 */
export function useUserApiOrders(config?: SWRConfiguration): UseApiOrdersResult {
  const { address, chainId } = useAccount();
  return useApiOrders(chainId, address, config);
}

/**
 * Feature flag to control orders data source
 * Also returns true when in X10000 mode
 */
export function shouldUseApiOrders(): boolean {
  if (typeof window === "undefined") return false;
  // Check for X10000 mode flag
  const x10000Flag = localStorage.getItem("x10000_mode");
  if (x10000Flag === "true") return true;
  const envFlag = import.meta.env.VITE_USE_API_ORDERS;
  const localFlag = localStorage.getItem("use_api_orders");
  return envFlag === "true" || localFlag === "true";
}

/**
 * Enable API orders data source
 */
export function enableApiOrders(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("use_api_orders", "true");
    window.location.reload();
  }
}

/**
 * Disable API orders data source
 */
export function disableApiOrders(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("use_api_orders");
    window.location.reload();
  }
}

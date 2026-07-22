import { t } from "@lingui/macro";
import { useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";

import { cancelOrder, closePosition, createOrder, createTriggerOrder, type CreateOrderResponse } from "./client";
import { acquirePendingOrderIntentKey, type OrderIntentScope } from "./orderIntentRegistry";
import { useApiOrders } from "./useApiOrders";
import type {
  BatchCancelRequest,
  BatchCancelResponse,
  ClosePositionRequest,
  CreateOrderRequest,
  CreateTriggerOrderRequest,
  OrderType as ApiOrderType,
  PositionModeSide,
  TimeInForce,
  TriggerOrderResponse,
  WorkingType,
} from "../types";

function formatFixedDecimal(value: bigint, decimals: number, fractionalDigits: number): string {
  const s = formatUnitsLocal(value, decimals);
  const dot = s.indexOf(".");
  if (dot === -1) {
    return fractionalDigits > 0 ? `${s}.${"0".repeat(fractionalDigits)}` : s;
  }

  const intPart = s.slice(0, dot);
  const frac = s.slice(dot + 1);
  if (fractionalDigits === 0) return intPart;

  const padded = (frac + "0".repeat(fractionalDigits)).slice(0, fractionalDigits);
  return `${intPart}.${padded}`;
}

function formatUnitsLocal(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const divisor = 10n ** BigInt(decimals);
  const whole = absolute / divisor;
  const fraction = absolute % divisor;

  if (fraction === 0n) {
    return `${negative ? "-" : ""}${whole}`;
  }

  const fractionString = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}.${fractionString}`;
}

export function shouldUseApiOrderSubmit(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("trade_mode") === "true") return true;
  return window.location.pathname.startsWith("/trade");
}

function mapOrderType(orderType: number, isIncrease: boolean, triggerPrice?: bigint): ApiOrderType {
  if (isIncrease) {
    if (triggerPrice !== undefined && triggerPrice > 0n) {
      return "limit";
    }
    if (orderType === 3) {
      return "limit";
    }
    return "market";
  }

  if (orderType === 5) {
    return "take_profit";
  }
  if (orderType === 6) {
    return "stop_market";
  }

  return "market";
}

function mapSide(isLong: boolean): "buy" | "sell" {
  return isLong ? "buy" : "sell";
}

// rocky-backend's POST /v1/orders expects its own native symbol shape
// ("BTC-PERP", "ETH-PERP", "CC-PERP"), not the Binance-style "BTCUSDT" this
// used to produce (correct only for the old api.primit.io-shaped backend).
function getApiSymbol(symbol: string) {
  const upper = symbol.toUpperCase().trim();
  const base = upper.replace(/[-/]?PERP$/, "").replace(/[-/]?USDT?$/, "");
  return `${base}-PERP`;
}

const TRIGGER_TYPE_MAP: Partial<Record<ApiOrderType, CreateTriggerOrderRequest["trigger_type"]>> = {
  stop_market: "StopLoss",
  stop_limit: "StopLimit",
  take_profit: "TakeProfit",
  take_profit_limit: "TakeProfitLimit",
};

export function formatOrderSubmitError(error: any): string {
  const code = error?.errorData?.code;
  if (code === "TRIGGER_ORDERS_UNSUPPORTED") {
    return "Advanced trigger orders are not available on Rocky Canton yet. Use Market/Limit orders or Close All for now.";
  }
  return error?.message || "Failed to submit order";
}

const DEFAULT_MARKET_AGGRESSION = 0.005;

function resolveMarketAggression(maxSlippage?: string): number {
  if (maxSlippage === undefined) return DEFAULT_MARKET_AGGRESSION;
  const parsed = Number(maxSlippage);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    throw new Error("maxSlippage must be greater than 0 and less than 1");
  }
  return parsed;
}

export function buildCreateOrderRequest(
  params: PrimitOrderParams,
  intentScope: OrderIntentScope
): {
  request: CreateOrderRequest | undefined;
  priceStr: string;
  sizeStr: string;
  apiOrderType: ApiOrderType;
  apiSymbol: string;
} {
  if (params.reduceOnly || params.closePosition) {
    throw new Error("Reduce Only is unavailable on generic orders. Use the dedicated Close Position action.");
  }
  if (params.tpPrice !== undefined || params.slPrice !== undefined) {
    throw new Error("Attached Take Profit / Stop Loss is not supported for Rocky orders yet.");
  }

  const apiOrderType =
    params.apiOrderTypeOverride ?? mapOrderType(params.orderType, params.isIncrease, params.triggerPrice);
  const usesLimitPrice =
    apiOrderType === "limit" || apiOrderType === "stop_limit" || apiOrderType === "take_profit_limit";
  const sizeStr = formatFixedDecimal(params.sizeDeltaUsd, params.indexTokenDecimals, 8);
  if (!Number.isFinite(Number(sizeStr)) || Number(sizeStr) <= 0) {
    throw new Error("Order quantity must be positive");
  }

  const priceStr =
    usesLimitPrice && params.triggerPrice !== undefined && params.triggerPrice > 0n
      ? formatFixedDecimal(params.triggerPrice, 30, 6)
      : "0";

  const isNativeOrder = apiOrderType === "market" || apiOrderType === "limit";
  let request: CreateOrderRequest | undefined;
  if (isNativeOrder) {
    let executablePrice: string;
    if (apiOrderType === "limit") {
      if (priceStr === "0") throw new Error("Limit order requires a positive price");
      executablePrice = priceStr;
    } else {
      const referencePrice = Number(
        params.acceptablePrice !== undefined ? formatFixedDecimal(params.acceptablePrice, 30, 6) : "0"
      );
      if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        throw new Error("Market order requires a positive reference price");
      }
      const aggression = resolveMarketAggression(params.maxSlippage);
      executablePrice = (referencePrice * (params.isLong ? 1 + aggression : 1 - aggression)).toFixed(6);
    }

    const intent: Omit<CreateOrderRequest, "idempotency_key"> = {
      symbol: getApiSymbol(params.symbol),
      side: params.isLong ? "BUY" : "SELL",
      price: executablePrice,
      qty: sizeStr,
      leverage: params.leverage ? Math.round(params.leverage) : 1,
    };
    if (!Number.isFinite(Number(intent.price)) || Number(intent.price) <= 0) {
      throw new Error("Executable order price must be positive");
    }
    request = {
      ...intent,
      idempotency_key: acquirePendingOrderIntentKey(intentScope, intent, params.clientOrderId),
    };
  }

  return {
    request,
    priceStr,
    sizeStr,
    apiOrderType,
    apiSymbol: getApiSymbol(params.symbol),
  };
}

function buildTriggerOrderRequest(
  params: PrimitOrderParams,
  apiOrderType: ApiOrderType,
  apiSymbol: string,
  sizeStr: string,
  priceStr: string
): CreateTriggerOrderRequest {
  const triggerType = TRIGGER_TYPE_MAP[apiOrderType];
  if (!triggerType) {
    throw new Error(`Unsupported trigger order type: ${apiOrderType}`);
  }

  const triggerPrice = params.stopPrice || params.tpPrice || params.slPrice || priceStr || "0";
  const triggerSizeUsd = parseFloat(sizeStr) * (parseFloat(triggerPrice) || 0);

  return {
    market_symbol: apiSymbol,
    trigger_type: triggerType,
    side: mapSide(params.isLong),
    size: String(triggerSizeUsd > 0 ? triggerSizeUsd : 0),
    trigger_price: triggerPrice,
    limit_price:
      (apiOrderType === "stop_limit" || apiOrderType === "take_profit_limit") && priceStr !== "0"
        ? priceStr
        : undefined,
    reduce_only: params.reduceOnly || false,
    close_position: params.closePosition || false,
  };
}

function toCreateOrderResponse(response: TriggerOrderResponse, remainingAmount: string): CreateOrderResponse {
  return {
    order_id: response.id,
    status: "open",
    filled_amount: "0",
    remaining_amount: remainingAmount,
    average_price: "0",
    created_at: response.created_at || new Date().toISOString(),
  };
}

export interface PrimitOrderParams {
  symbol: string;
  isLong: boolean;
  isIncrease: boolean;
  sizeDeltaUsd: bigint;
  indexTokenDecimals: number;
  triggerPrice?: bigint;
  acceptablePrice?: bigint;
  orderType: number;
  apiOrderTypeOverride?: ApiOrderType;
  reduceOnly?: boolean;
  clientOrderId?: string;
  leverage?: number;
  marginMode?: "cross" | "isolated";
  tpPrice?: string;
  slPrice?: string;
  maxSlippage?: string;
  stopPrice?: string;
  timeInForce?: TimeInForce;
  workingType?: WorkingType;
  positionSide?: PositionModeSide;
  closePosition?: boolean;
}

export interface UsePrimitOrderSubmitResult {
  submitOrder: (params: PrimitOrderParams) => Promise<CreateOrderResponse>;
  cancelOrderById: (orderId: string) => Promise<{ success: boolean }>;
  batchCancel: (request: BatchCancelRequest) => Promise<BatchCancelResponse>;
  closePositionById: (positionId: string, request: ClosePositionRequest) => Promise<CreateOrderResponse>;
  isApiEnabled: boolean;
  isReady: boolean;
}

export function usePrimitOrderSubmit(): UsePrimitOrderSubmitResult {
  const { chainId } = useChainId();
  const cantonSession = useCantonSession();
  const accountKey = useMemo(
    () => (cantonSession.connected ? cantonSession.party || cantonSession.username || "canton-session" : undefined),
    [cantonSession.connected, cantonSession.party, cantonSession.username]
  );
  const isApiEnabled = shouldUseApiOrderSubmit();
  const isReady = isApiEnabled && cantonSession.connected;
  const { mutate: refreshOrders } = useApiOrders(chainId, accountKey);
  const { mutate: globalMutate } = useSWRConfig();

  const refreshBalances = useCallback(() => {
    if (!accountKey || !chainId) return;
    globalMutate([`primit-balances`, chainId, accountKey], undefined, { revalidate: true });
    globalMutate([`primit-unified-account`, chainId, accountKey], undefined, { revalidate: true });
  }, [globalMutate, accountKey, chainId]);

  const requireAccountKey = useCallback(() => {
    if (!accountKey) {
      helperToast.error(t`Please connect your wallet first`);
      throw new Error("Canton wallet session required");
    }
    return accountKey;
  }, [accountKey]);

  const submitOrder = useCallback(
    async (params: PrimitOrderParams): Promise<CreateOrderResponse> => {
      const authAccountKey = requireAccountKey();
      const { request, priceStr, sizeStr, apiOrderType, apiSymbol } = buildCreateOrderRequest(params, {
        chainId,
        accountKey: authAccountKey,
      });

      try {
        const triggerType = TRIGGER_TYPE_MAP[apiOrderType];
        if (triggerType) {
          const triggerRequest = buildTriggerOrderRequest(params, apiOrderType, apiSymbol, sizeStr, priceStr);
          const triggerResponse = await createTriggerOrder(chainId, triggerRequest, authAccountKey);
          helperToast.success(`Trigger order created: ${triggerResponse.id}`);
          refreshOrders();
          refreshBalances();
          return toCreateOrderResponse(triggerResponse, sizeStr);
        }

        if (!request) {
          throw new Error(`Unsupported order type: ${apiOrderType}`);
        }

        const response = await createOrder(chainId, request, authAccountKey);
        const status = (response.status ?? "").toLowerCase();
        if (status === "cancelled" || status === "canceled" || status === "rejected") {
          helperToast.error(`Order ${status}: ${response.order_id}`);
        } else if (status === "filled") {
          helperToast.success(`Order filled: ${response.order_id}`);
        } else {
          helperToast.success(`Order submitted: ${response.order_id}`);
        }
        refreshOrders();
        refreshBalances();
        return response;
      } catch (error: any) {
        helperToast.error(formatOrderSubmitError(error));
        throw error;
      }
    },
    [chainId, refreshBalances, refreshOrders, requireAccountKey]
  );

  const cancelOrderById = useCallback(
    async (orderId: string): Promise<{ success: boolean }> => {
      const authAccountKey = requireAccountKey();

      try {
        await cancelOrder(
          chainId,
          orderId,
          {
            signature: "canton-session",
            timestamp: Math.floor(Date.now() / 1000),
          },
          authAccountKey
        );
        helperToast.success(t`Order cancelled`);
        refreshOrders();
        refreshBalances();
        return { success: true };
      } catch (error: any) {
        helperToast.error(error?.message || "Failed to cancel order");
        throw error;
      }
    },
    [chainId, refreshBalances, refreshOrders, requireAccountKey]
  );

  const batchCancel = useCallback(
    async (request: BatchCancelRequest): Promise<BatchCancelResponse> => {
      const authAccountKey = requireAccountKey();
      const timestamp = Math.floor(Date.now() / 1000);

      const settled = await Promise.allSettled(
        request.order_ids.map((orderId) =>
          cancelOrder(
            chainId,
            orderId,
            {
              signature: "canton-session",
              timestamp,
            },
            authAccountKey
          )
        )
      );

      const response: BatchCancelResponse = {
        cancelled: [],
        failed: [],
      };

      settled.forEach((result, index) => {
        const id = request.order_ids[index];
        if (!id) return;
        if (result.status === "fulfilled") {
          response.cancelled.push(id);
        } else {
          response.failed.push({
            id,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      });

      if (response.failed.length > 0) {
        helperToast.info(`Cancelled ${response.cancelled.length} orders, ${response.failed.length} failed`);
      } else {
        helperToast.success(`Cancelled ${response.cancelled.length} orders`);
      }

      refreshOrders();
      refreshBalances();
      return response;
    },
    [chainId, refreshBalances, refreshOrders, requireAccountKey]
  );

  // NOTE: unused (no live call sites) -- @/modules/lighter/api/useClosePositionHandler.ts
  // is what PositionsTab.tsx actually uses. Kept in sync with closePosition's
  // now-required ClosePositionRequest (symbol/side/qty/markPrice) anyway.
  const closePositionById = useCallback(
    async (positionId: string, request: ClosePositionRequest): Promise<CreateOrderResponse> => {
      const authAccountKey = requireAccountKey();

      try {
        const response = await closePosition(chainId, positionId, request, authAccountKey);
        helperToast.success(t`Position close order submitted`);
        refreshOrders();
        refreshBalances();
        return response;
      } catch (error: any) {
        helperToast.error(error?.message || "Failed to close position");
        throw error;
      }
    },
    [chainId, refreshBalances, refreshOrders, requireAccountKey]
  );

  return {
    submitOrder,
    cancelOrderById,
    batchCancel,
    closePositionById,
    isApiEnabled,
    isReady,
  };
}

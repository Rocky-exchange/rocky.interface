import { t } from "@lingui/macro";
/**
 * ZTDX Order Submission Hook
 *
 * This hook provides a way to submit orders through the ZTDX backend API.
 * When enabled via feature flag, orders are sent to our backend first,
 * which then relays them to the blockchain.
 *
 * Benefits:
 * - Better error handling and validation
 * - Order tracking and history
 * - Rate limiting protection
 * - Additional business logic (referrals, rewards)
 */

import { useCallback } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { getAddress } from "viem";
import { useSWRConfig } from "swr";

import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";
import { getX10000ZtdxVaultAddress } from "config/custom/contracts";
import { useApiOrders } from "./useApiOrders";

import {
  createOrder,
  cancelOrder,
  batchCancelOrders,
  closePosition,
  isAuthenticated,
  CreateOrderResponse,
  getNonce,
} from "./client";
import type {
  CreateOrderRequest,
  OrderSide,
  OrderType as ApiOrderType,
  BatchCancelRequest,
  BatchCancelResponse,
  ClosePositionRequest,
  TimeInForce,
  WorkingType,
  PositionModeSide,
} from "../types";

// Feature Flag for ZTDX API order submission
// Only return true for x10000 routes
export function shouldUseApiOrderSubmit(): boolean {
  if (typeof window === "undefined") return false;
  // Check if we're in x10000 mode by checking localStorage flag or pathname
  const x10000Flag = localStorage.getItem("x10000_mode");
  if (x10000Flag === "true") return true;
  // Also check pathname as a fallback
  if (window.location.pathname.startsWith("/trade")) return true;
  // For all other routes, return false to use on-chain submission
  return false;
}

// Convert GMX order type to ZTDX API order type
function mapOrderType(orderType: number, isIncrease: boolean, triggerPrice?: bigint): ApiOrderType {
  // GMX Order Types:
  // 0 = MarketSwap
  // 1 = LimitSwap
  // 2 = MarketIncrease
  // 3 = LimitIncrease
  // 4 = MarketDecrease
  // 5 = LimitDecrease
  // 6 = StopLossDecrease
  // 7 = Liquidation
  // 8 = StopIncrease

  // For increase orders: if triggerPrice exists, it's a limit order (even if orderType is MarketIncrease)
  // This handles the case where user switches to limit tab but orderType hasn't updated yet
  if (isIncrease) {
    if (triggerPrice !== undefined && triggerPrice > 0n) {
      // Has triggerPrice means limit order
      return "limit";
    }
    // Check orderType as fallback
    if (orderType === 3) {
      // LimitIncrease
      return "limit";
    }
    // Default to market for increase orders
    return "market";
  }

  // For decrease orders
  if (orderType === 5) {
    // LimitDecrease - for decrease orders, limit is treated as take profit
    return "take_profit";
  }
  if (orderType === 6) {
    // StopLossDecrease
    return "stop_market";
  }

  // For other orders (MarketDecrease, etc.), return market
  return "market";
}

// Convert GMX side (isLong) to API side
// API uses "buy"/"sell" for orders (matching actual backend implementation)
// Long positions = buy, Short positions = sell
function mapSide(isLong: boolean, isIncrease: boolean): "buy" | "sell" {
  // For both increase and decrease orders, side is based on position direction
  return isLong ? "buy" : "sell";
}

export interface ZtdxOrderParams {
  symbol: string;
  isLong: boolean;
  isIncrease: boolean;
  sizeDeltaUsd: bigint; // Position size in tokens (bigint, will be converted to decimal string)
  indexTokenDecimals: number; // Index token decimals for formatting
  triggerPrice?: bigint;
  acceptablePrice?: bigint;
  orderType: number;
  apiOrderTypeOverride?: ApiOrderType;
  reduceOnly?: boolean;
  clientOrderId?: string;
  leverage?: number; // Leverage value (e.g., 50 for 50x)
  marginMode?: "cross" | "isolated";
  // --- 2026-04 新增可选字段(成交后后端自动创建条件平仓单)---
  tpPrice?: string; // 止盈触发价(decimal string,例 "80000.0")
  slPrice?: string; // 止损触发价(decimal string,例 "50000.0")
  maxSlippage?: string; // 最大滑点宽容度(例 "0.01" = 1%)
  stopPrice?: string; // 条件单触发价
  timeInForce?: TimeInForce;
  workingType?: WorkingType;
  positionSide?: PositionModeSide;
  closePosition?: boolean;
}

export interface UseZtdxOrderSubmitResult {
  submitOrder: (params: ZtdxOrderParams) => Promise<CreateOrderResponse>;
  cancelOrderById: (orderId: string) => Promise<{ success: boolean }>;
  batchCancel: (request: BatchCancelRequest) => Promise<BatchCancelResponse>;
  closePositionById: (positionId: string, request?: ClosePositionRequest) => Promise<CreateOrderResponse>;
  isApiEnabled: boolean;
  isReady: boolean;
}

export function useZtdxOrderSubmit(): UseZtdxOrderSubmitResult {
  const { chainId } = useChainId();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const isApiEnabled = shouldUseApiOrderSubmit();
  const isReady = isApiEnabled && isAuthenticated(address, chainId);

  // Get mutate function to refresh orders list after creating/canceling orders
  const { mutate: refreshOrders } = useApiOrders(chainId, address);
  // Get global mutate to refresh both balance SWR keys after order operations
  const { mutate: globalMutate } = useSWRConfig();

  const refreshBalances = useCallback(() => {
    if (!address || !chainId) return;
    globalMutate([`ztdx-balances`, chainId, address], undefined, { revalidate: true });
    globalMutate([`x10000-ztdx-balances`, chainId, address], undefined, { revalidate: true });
  }, [globalMutate, address, chainId]);

  const submitOrder = useCallback(
    async (params: ZtdxOrderParams): Promise<CreateOrderResponse> => {
      console.log(" submitOrder called", {
        isAuthenticated: isAuthenticated(address, chainId),
        address: address ? `${address.substring(0, 6)}...` : null,
        params: {
          symbol: params.symbol,
          isLong: params.isLong,
          leverage: params.leverage,
        },
      });

      if (!address) {
        helperToast.error(t`Please connect your wallet first`);
        throw new Error("Wallet address required");
      }

      // Show friendly message if not authenticated yet
      // Note: User can still proceed - signature will trigger authentication flow
      if (!isAuthenticated(address, chainId)) {
        helperToast.info(t`Signing transaction will also authenticate your account`);
      }

      const {
        symbol,
        isLong,
        isIncrease,
        sizeDeltaUsd,
        indexTokenDecimals,
        triggerPrice,
        acceptablePrice,
        orderType,
        reduceOnly,
        clientOrderId,
        leverage,
        marginMode,
      } = params;

      // Convert position size in tokens (bigint) to decimal string
      // sizeDeltaUsd is actually position size in tokens (e.g., 0.001 ETH represented as bigint)
      // Test code shows: amount = Decimal("0.001") for BTC, so we need to format bigint to decimal string
      // Convert bigint to decimal: divide by 10^decimals
      const sizeStr = (Number(sizeDeltaUsd) / 10 ** indexTokenDecimals).toFixed(8);

      // Debug: Log order type mapping
      console.log(" mapOrderType input:", { orderType, isIncrease, triggerPrice: triggerPrice?.toString() });

      const apiOrderType = params.apiOrderTypeOverride ?? mapOrderType(orderType, isIncrease, triggerPrice);
      const side = mapSide(isLong, isIncrease);

      console.log(" mapOrderType result:", { apiOrderType, side, orderType });

      // Use leverage from params (already converted to integer in useTradeboxTransactionsx10000)
      // Backend expects integer (i32), so ensure it's an integer
      const leverageValue = leverage ? Math.round(leverage) : 1;

      const timestamp = Math.floor(Date.now() / 1000);

      // Build price string for signature
      // For limit orders, use triggerPrice (the limit price set by user)
      // For market orders, use "0" (as per backend specification)
      const usesLimitPrice = apiOrderType === "limit" || apiOrderType === "stop_limit" || apiOrderType === "take_profit_limit";

      let priceStr: string;
      if (usesLimitPrice) {
        // For limit orders, triggerPrice is the limit price (user-set limit price)
        if (triggerPrice !== undefined && triggerPrice > 0n) {
          // Convert from bigint (1e30 precision) to decimal string
          priceStr = (Number(triggerPrice) / 1e30).toFixed(6);
        } else {
          // If no triggerPrice but it's a limit order, this is an error
          console.error(" Limit order requires triggerPrice");
          priceStr = "0"; // Fallback to "0", but this shouldn't happen
        }
      } else {
        // Market orders use "0" for price (as per backend specification)
        priceStr = "0";
      }

      // Convert symbol for API (use BTCUSDT format, matching backend)
      const apiSymbol = symbol.includes("-USD") ? symbol.replace("-USD", "USDT").toUpperCase() : symbol.toUpperCase();

      // Get typed_data structure from /auth/nonce endpoint
      // Backend returns the typed_data structure that should be used for signing
      console.log(" Step 1: Getting typed_data from /auth/nonce endpoint");
      const checksumAddress = getAddress(address);

      let nonceResponse;
      try {
        nonceResponse = await getNonce(chainId, checksumAddress);
        console.log(" Step 1: Received nonce response:", nonceResponse);
      } catch (error: any) {
        console.error(" Failed to get nonce:", error);
        helperToast.error(` Failed to get nonce: ${error?.message || "Unknown error"}`);
        throw error;
      }

      if (!nonceResponse?.typed_data) {
        throw new Error(" Backend did not return typed_data in nonce response");
      }

      // Map order type to signature format: "limit" or "market" (lowercase, required)
      // Backend only accepts "limit" or "market" for orderType in signature
      // According to documentation, "take_profit" and "stop_market" should be mapped
      let signatureOrderType: string;
      if (usesLimitPrice) {
        signatureOrderType = "limit";
      } else {
        signatureOrderType = "market";
      }

      // Ensure side is lowercase (required by backend Display trait)
      const signatureSide = side.toLowerCase();

      // Use typed_data structure from backend, but modify for CreateOrder
      // Backend provides domain and types structure, we need to add CreateOrder type and modify message
      const backendTypedData = nonceResponse.typed_data;

      // Build CreateOrder typed_data based on backend's typed_data structure
      // Use the domain from backend (which has correct name like "rocky")
      // Add CreateOrder type definition
      // Use JSON parse/stringify to ensure no circular references and clean data structure
      // This prevents "Maximum call stack size exceeded" errors in wallet extensions
      const typedDataRaw = {
        types: {
          ...backendTypedData.types, // Keep existing types (EIP712Domain, Login, etc.)
          CreateOrder: [
            { name: "wallet", type: "address" },
            { name: "symbol", type: "string" },
            { name: "side", type: "string" },
            { name: "orderType", type: "string" }, // camelCase, lowercase: "limit" or "market"
            { name: "price", type: "string" },
            { name: "amount", type: "string" },
            { name: "leverage", type: "uint32" }, // uint32, not uint256
            { name: "timestamp", type: "uint256" }, // uint256, seconds (number, not string)
          ],
        },
        primaryType: "CreateOrder", // Use CreateOrder instead of Login
        domain: {
          name: backendTypedData.domain.name,
          version: backendTypedData.domain.version,
          chainId: backendTypedData.domain.chainId,
          verifyingContract: backendTypedData.domain.verifyingContract,
        },
        message: {
          wallet: checksumAddress, // Use checksum address
          symbol: apiSymbol,
          side: signatureSide, // "buy" or "sell" (lowercase, required by backend Display trait)
          orderType: signatureOrderType.toLowerCase(), // "market" or "limit" (lowercase, required by backend Display trait)
          price: priceStr, // "0" for market orders, or price string for limit orders
          amount: sizeStr,
          leverage: leverageValue, // number (uint32), not string
          timestamp: timestamp, // uint256 (number, seconds), NOT string - backend expects number
        },
      };

      // Deep copy to avoid circular references
      const typedData = JSON.parse(JSON.stringify(typedDataRaw));

      // Sign EIP-712 typed data - this will trigger wallet popup
      console.log(" Step 2: Requesting EIP-712 signature from wallet...");
      let signature: string;
      try {
        // Use wagmi's signTypedDataAsync which works with all wallet types
        // and correctly routes to the connected account (unlike window.ethereum.request
        // which requires the address to match MetaMask's currently selected account)
        signature = await signTypedDataAsync({
          domain: typedData.domain as any,
          types: typedData.types as any,
          primaryType: typedData.primaryType as any,
          message: typedData.message as any,
        });

        console.log(" Signature received:", signature.substring(0, 20) + "...");
        // Ensure signature has 0x prefix
        if (!signature || typeof signature !== "string" || !signature.startsWith("0x")) {
          throw new Error(" Invalid signature format received from wallet");
        }
      } catch (error: any) {
        console.error(" EIP-712 signature failed:", error);
        const errorMessage = error?.message || "Failed to sign order";
        // Don't show toast if user rejected, just log it
        if (
          errorMessage.includes("rejected") ||
          errorMessage.includes("denied") ||
          errorMessage.includes("User rejected")
        ) {
          console.log(" User rejected signature request");
          // Don't show error toast for user rejection
        } else {
          helperToast.error(` Signature failed: ${errorMessage}`);
        }
        throw error;
      }

      const request: CreateOrderRequest = {
        symbol: apiSymbol,
        side,
        order_type: apiOrderType,
        amount: sizeStr,
        leverage: leverageValue,
        margin_mode: marginMode ?? "cross",
        signature,
        timestamp,
      };

      // Add price for limit orders and take profit orders
      if (apiOrderType === "limit" && priceStr !== "market") {
        request.price = priceStr;
      }

      if ((apiOrderType === "stop_limit" || apiOrderType === "take_profit_limit") && priceStr !== "0") {
        request.price = priceStr;
      }

      // 2026-04 扩展可选字段
      if (params.reduceOnly) request.reduce_only = true;
      if (params.tpPrice) request.tp_price = params.tpPrice;
      if (params.slPrice) request.sl_price = params.slPrice;
      if (params.maxSlippage) request.max_slippage = params.maxSlippage;
      if (params.stopPrice) request.trigger_price = params.stopPrice;
      if (params.timeInForce) request.time_in_force = params.timeInForce;
      if (params.workingType) request.working_type = params.workingType;
      if (params.positionSide) request.position_side = params.positionSide;
      if (params.closePosition != null) request.close_position = params.closePosition;
      if (params.clientOrderId) request.client_order_id = params.clientOrderId;

      console.log(" Submitting order request:", {
        symbol: apiSymbol,
        side,
        order_type: apiOrderType,
        amount: sizeStr,
        leverage: leverageValue,
        price: request.price,
        timestamp,
        signatureLength: signature.length,
      });

      try {
        // Pass address to ensure correct token is used
        const response = await createOrder(chainId, request, address);
        // New API returns: { order_id, status, filled_amount, remaining_amount, average_price, created_at }
        helperToast.success(`Order submitted: ${response.order_id}`);

        // Refresh orders list after successful order creation
        refreshOrders();
        refreshBalances();

        return response;
      } catch (error: any) {
        const message = error?.message || "Failed to submit order";
        helperToast.error(message);
        throw error;
      }
    },
    [chainId, address, refreshOrders, refreshBalances, signTypedDataAsync]
  );

  const cancelOrderById = useCallback(
    async (orderId: string): Promise<{ success: boolean }> => {
      if (!isAuthenticated(address, chainId)) {
        throw new Error(" Authentication required");
      }

      if (!address) {
        throw new Error(" Wallet address required");
      }

      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const checksumAddress = getAddress(address);

        // Get typed_data structure from backend
        const nonceResponse = await getNonce(chainId, checksumAddress);
        if (!nonceResponse?.typed_data) {
          throw new Error(" Backend did not return typed_data in nonce response");
        }

        const backendTypedData = nonceResponse.typed_data;

        // Build CancelOrder typed_data
        const typedDataRaw = {
          types: {
            ...backendTypedData.types,
            CancelOrder: [
              { name: "wallet", type: "address" },
              { name: "orderId", type: "string" },
              { name: "timestamp", type: "uint256" },
            ],
          },
          primaryType: "CancelOrder",
          domain: {
            name: backendTypedData.domain.name,
            version: backendTypedData.domain.version,
            chainId: backendTypedData.domain.chainId,
            verifyingContract: backendTypedData.domain.verifyingContract,
          },
          message: {
            wallet: checksumAddress,
            orderId: orderId,
            timestamp: timestamp,
          },
        };

        const typedData = JSON.parse(JSON.stringify(typedDataRaw));

        // Sign EIP-712 typed data using wagmi
        const signature = await signTypedDataAsync({
          domain: typedData.domain as any,
          types: typedData.types as any,
          primaryType: typedData.primaryType as any,
          message: typedData.message as any,
        });

        if (!signature || !signature.startsWith("0x")) {
          throw new Error(" Invalid signature format");
        }

        await cancelOrder(chainId, orderId, {
          signature,
          timestamp,
        });
        helperToast.success(t`Order cancelled`);

        // Refresh orders list after successful order cancellation
        refreshOrders();
        refreshBalances();

        return { success: true };
      } catch (error: any) {
        const message = error?.message || "Failed to cancel order";
        if (!message.includes("rejected") && !message.includes("denied")) {
          helperToast.error(message);
        }
        throw error;
      }
    },
    [chainId, address, refreshOrders, refreshBalances, signTypedDataAsync]
  );

  const batchCancel = useCallback(
    async (request: BatchCancelRequest): Promise<BatchCancelResponse> => {
      if (!isAuthenticated(address, chainId)) {
        throw new Error(" Authentication required");
      }

      if (!address) {
        throw new Error(" Wallet address required");
      }

      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const checksumAddress = getAddress(address);

        // Get typed_data structure from backend
        const nonceResponse = await getNonce(chainId, checksumAddress);
        if (!nonceResponse?.typed_data) {
          throw new Error(" Backend did not return typed_data in nonce response");
        }

        const backendTypedData = nonceResponse.typed_data;

        // Build BatchCancelOrders typed_data
        const typedDataRaw = {
          types: {
            ...backendTypedData.types,
            BatchCancelOrders: [
              { name: "wallet", type: "address" },
              { name: "orderIds", type: "string" },
              { name: "timestamp", type: "uint256" },
            ],
          },
          primaryType: "BatchCancelOrders",
          domain: {
            name: backendTypedData.domain.name,
            version: backendTypedData.domain.version,
            chainId: backendTypedData.domain.chainId,
            verifyingContract: backendTypedData.domain.verifyingContract,
          },
          message: {
            wallet: checksumAddress,
            orderIds: request.order_ids.join(","),
            timestamp: timestamp,
          },
        };

        const typedData = JSON.parse(JSON.stringify(typedDataRaw));

        // Sign EIP-712 typed data using wagmi
        const signature = await signTypedDataAsync({
          domain: typedData.domain as any,
          types: typedData.types as any,
          primaryType: typedData.primaryType as any,
          message: typedData.message as any,
        });

        if (!signature || !signature.startsWith("0x")) {
          throw new Error(" Invalid signature format");
        }

        const response = await batchCancelOrders(chainId, {
          order_ids: request.order_ids,
          signature,
          timestamp,
        });
        const cancelledCount = response.cancelled.length;
        const failedCount = response.failed.length;

        if (failedCount > 0) {
          helperToast.info(` Cancelled ${cancelledCount} orders, ${failedCount} failed`);
        } else {
          helperToast.success(` Cancelled ${cancelledCount} orders`);
        }

        // Refresh orders list after successful batch cancellation
        refreshOrders();
        refreshBalances();

        return response;
      } catch (error: any) {
        const message = error?.message || "Failed to cancel orders";
        if (!message.includes("rejected") && !message.includes("denied")) {
          helperToast.error(message);
        }
        throw error;
      }
    },
    [chainId, address, refreshOrders, refreshBalances, signTypedDataAsync]
  );

  const closePositionById = useCallback(
    async (positionId: string, request?: ClosePositionRequest): Promise<CreateOrderResponse> => {
      if (!isAuthenticated(address, chainId)) {
        throw new Error(" Authentication required");
      }

      try {
        const response = await closePosition(chainId, positionId, request);
        helperToast.success(t`Position close order submitted`);

        // Refresh orders list after successful position close order
        refreshOrders();
        refreshBalances();

        return response;
      } catch (error: any) {
        const message = error?.message || "Failed to close position";
        helperToast.error(message);
        throw error;
      }
    },
    [chainId, address, refreshOrders, refreshBalances]
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

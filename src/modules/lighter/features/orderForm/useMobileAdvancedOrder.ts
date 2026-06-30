// src/modules/lighter/features/orderForm/useMobileAdvancedOrder.ts
import { useEffect, useState } from "react";

import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import {
  useOrderPreviewAdapter,
  usePreviewErrorMessage,
  type PreviewState,
} from "../../adapters/useOrderPreviewAdapter";
import { usePlaceOrderAdapter } from "../../adapters/usePlaceOrderAdapter";
import { usePositionsAdapter } from "../../adapters/usePositionsAdapter";

import { getCurrentOrderFormPosition } from "./desktop/orderFormPosition";
import type { AdvancedMode, Side, SizeUnit } from "./types";

type RequestType = "stop_market" | "stop_limit" | "take_profit" | "take_profit_limit";

export type UseMobileAdvancedOrderArgs = {
  type: AdvancedMode;
  side: Side;
  leverage: number;
  marginMode: "cross" | "isolated";
};

export type UseMobileAdvancedOrderReturn = {
  triggerPrice: string;
  setTriggerPrice: (v: string) => void;
  limitPrice: string;
  setLimitPrice: (v: string) => void;
  hasLimitPrice: boolean;
  isTakeProfit: boolean;
  amount: string;
  onAmountInput: (v: string) => void;
  amountUnit: SizeUnit;
  onUnitToggle: () => void;
  pct: number;
  onPctChange: (n: number) => void;
  reduceOnly: boolean;
  setReduceOnly: (b: boolean) => void;
  amountNum: number;
  canSubmit: boolean;
  submitting: boolean;
  preview: PreviewState;
  orderSizeText: string;
  maxOrderValueText: string;
  orderValueText: string;
  previewErrorMessage: string | null;
  markPrice: number | null;
  submit: () => Promise<void>;
};

const REQUEST_TYPE: Record<AdvancedMode, RequestType> = {
  "Stop Market": "stop_market",
  "Stop Limit": "stop_limit",
  "Take Profit Market": "take_profit",
  "Take Profit Limit": "take_profit_limit",
};

function fmtUsd(value?: string | null): string {
  if (!value) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function trimmed(value: number, maxDecimals = 6): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return parseFloat(value.toFixed(maxDecimals)).toString();
}

/**
 * Mobile-native port of desktop AdvancedOrderForm logic (state, conversion-
 * price snapshot, refPrice, amountNum, % slider math, submit) — minus the
 * bonus gate and the OrderBook limit-price subscription (out of scope).
 */
export function useMobileAdvancedOrder({
  type,
  side,
  leverage,
  marginMode,
}: UseMobileAdvancedOrderArgs): UseMobileAdvancedOrderReturn {
  const [triggerPrice, setTriggerPrice] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [amountUnit, setAmountUnit] = useState<SizeUnit>("USD");
  const [pct, setPct] = useState(0);
  const [reduceOnly, setReduceOnly] = useState(false);

  const { placeOrder, submitting } = usePlaceOrderAdapter();
  const { available } = useAvailableBalanceAdapter();
  const market = useMarketInfoAdapter();
  const positions = usePositionsAdapter();
  const baseSymbol = market.symbol || "BTC";
  const currentPosition = getCurrentOrderFormPosition(positions, baseSymbol);

  const hasLimitPrice = type === "Stop Limit" || type === "Take Profit Limit";
  const isTakeProfit = type === "Take Profit Market" || type === "Take Profit Limit";
  const previewOrderType: "market" | "limit" = hasLimitPrice ? "limit" : "market";

  const rawAmount = Number(amount) || 0;
  const triggerPriceNum = Number(triggerPrice) || 0;
  const limitPriceNum = Number(limitPrice) || 0;

  const [conversionPrice, setConversionPrice] = useState<number | null>(null);
  useEffect(() => {
    if (conversionPrice == null && market.markPrice != null && market.markPrice > 0) {
      setConversionPrice(market.markPrice);
    }
  }, [conversionPrice, market.markPrice]);
  const resnap = () => {
    if (market.markPrice != null && market.markPrice > 0) setConversionPrice(market.markPrice);
  };

  const refPrice = (hasLimitPrice ? limitPriceNum : triggerPriceNum) || conversionPrice || 0;
  const amountNum = amountUnit === "USD" ? (refPrice > 0 ? rawAmount / refPrice : 0) : rawAmount;

  const preview = useOrderPreviewAdapter({
    side,
    orderType: previewOrderType,
    amount: amountNum,
    leverage,
    marginMode,
    reduceOnly,
    price: hasLimitPrice ? limitPriceNum : undefined,
  });
  const p = preview.data;
  const availableBalance = p?.available_balance ? Number(p.available_balance) : available ?? 0;
  const buyingPowerUsd = availableBalance > 0 ? availableBalance * leverage : 0;
  const previewErrorMessage = usePreviewErrorMessage(preview);

  const currentPositionAmount = currentPosition?.sizeTokenAmount ?? 0;
  const orderSizeText =
    amountNum > 0
      ? `${trimmed(amountNum, 4)} ${baseSymbol}`
      : currentPositionAmount > 0
        ? `${trimmed(currentPositionAmount, 4)} ${baseSymbol}`
        : "-";
  const maxOrderValueText = p?.order_value ? fmtUsd(p.order_value) : "-";
  const orderValueText =
    amountNum > 0 && refPrice > 0
      ? `$${(amountNum * refPrice).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "-";

  const onAmountInput = (nextRaw: string) => {
    setAmount(nextRaw);
    resnap();
    const typed = Number(nextRaw) || 0;
    if (buyingPowerUsd > 0 && refPrice > 0) {
      const usdValue = amountUnit === "USD" ? typed : typed * refPrice;
      setPct(Math.max(0, Math.min(100, Math.round((usdValue / buyingPowerUsd) * 100))));
    } else {
      setPct(0);
    }
  };
  const onPctChange = (nextPct: number) => {
    setPct(nextPct);
    if (buyingPowerUsd > 0 && refPrice > 0) {
      const nextAmount =
        amountUnit === "USD"
          ? (buyingPowerUsd * (nextPct / 100)).toFixed(2)
          : ((buyingPowerUsd * (nextPct / 100)) / refPrice).toFixed(5);
      setAmount(nextAmount);
    }
    resnap();
  };
  const onUnitToggle = () => {
    const nextUnit: SizeUnit = amountUnit === "USD" ? "BASE" : "USD";
    if (rawAmount > 0 && refPrice > 0) {
      const converted = nextUnit === "USD" ? rawAmount * refPrice : rawAmount / refPrice;
      setAmount(converted.toFixed(nextUnit === "USD" ? 2 : 5));
    }
    resnap();
    setAmountUnit(nextUnit);
  };

  const canSubmit = triggerPriceNum > 0 && amountNum > 0;

  const submit = async (): Promise<void> => {
    await placeOrder({
      side,
      type: REQUEST_TYPE[type],
      amount: amountNum,
      price: hasLimitPrice ? limitPriceNum || undefined : undefined,
      triggerPrice: triggerPriceNum || undefined,
      leverage,
      marginMode,
      reduceOnly,
      timeInForce: hasLimitPrice ? "GTC" : undefined,
      workingType: "MARK_PRICE",
    });
  };

  return {
    triggerPrice,
    setTriggerPrice,
    limitPrice,
    setLimitPrice,
    hasLimitPrice,
    isTakeProfit,
    amount,
    onAmountInput,
    amountUnit,
    onUnitToggle,
    pct,
    onPctChange,
    reduceOnly,
    setReduceOnly,
    amountNum,
    canSubmit,
    submitting,
    preview,
    orderSizeText,
    maxOrderValueText,
    orderValueText,
    previewErrorMessage,
    markPrice: market.markPrice,
    submit,
  };
}

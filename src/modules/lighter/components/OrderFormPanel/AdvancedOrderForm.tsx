import { useEffect, useMemo, useState } from "react";

import { CoinSelect, Row } from "./MarketOrderForm";
import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import { useOrderPreviewAdapter } from "../../adapters/useOrderPreviewAdapter";
import { usePlaceOrderAdapter } from "../../adapters/usePlaceOrderAdapter";
import { usePositionsAdapter } from "../../adapters/usePositionsAdapter";
import { Checkbox } from "../Checkbox/Checkbox";
import { PercentSlider } from "../PercentSlider/PercentSlider";

export type AdvancedType = "Stop Market" | "Stop Limit" | "Take Profit Market" | "Take Profit Limit";

type Props = {
  side: "buy" | "sell";
  type?: AdvancedType;
  isConnected: boolean;
  leverage: number;
  marginMode: "cross" | "isolated";
};

function formatUsd(value?: string) {
  if (!value) return "-";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value?: string) {
  if (!value) return "-";
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function formatTrimmed(value: number, maxDecimals = 6) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return parseFloat(value.toFixed(maxDecimals)).toString();
}

export function AdvancedOrderForm({
  side,
  type = "Stop Market",
  isConnected,
  leverage,
  marginMode,
}: Props) {
  const [triggerPrice, setTriggerPrice] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [amountUnit, setAmountUnit] = useState<"SYMBOL" | "USD">("USD");
  const [pct, setPct] = useState(0);
  const [reduceOnly, setReduceOnly] = useState(false);

  const { placeOrder, submitting } = usePlaceOrderAdapter();
  const { available } = useAvailableBalanceAdapter();
  const market = useMarketInfoAdapter();
  const positions = usePositionsAdapter();
  const baseSymbol = market.symbol || "BTC";
  const currentPosition = positions.find((position) => position.market === baseSymbol) ?? null;

  const triggerLabel = type.startsWith("Take Profit") ? "TP Trigger Price" : "Trigger Price";
  const submitLabelMap: Record<AdvancedType, string> = {
    "Stop Market": "S/L Market",
    "Stop Limit": "S/L Limit",
    "Take Profit Market": "T/P Market",
    "Take Profit Limit": "T/P Limit",
  };
  const hasLimitPrice = type === "Stop Limit" || type === "Take Profit Limit";
  const requestTypeMap: Record<AdvancedType, "stop_market" | "stop_limit" | "take_profit" | "take_profit_limit"> = {
    "Stop Market": "stop_market",
    "Stop Limit": "stop_limit",
    "Take Profit Market": "take_profit",
    "Take Profit Limit": "take_profit_limit",
  };
  const previewOrderType = hasLimitPrice ? "limit" : "market";
  const amountUnitOptions = useMemo(() => [baseSymbol, "USD"], [baseSymbol]);

  const rawAmount = Number(amount) || 0;
  const triggerPriceNum = Number(triggerPrice) || 0;
  const limitPriceNum = Number(limitPrice) || 0;
  const refPrice = (hasLimitPrice ? limitPriceNum : triggerPriceNum) || market.markPrice || 0;
  const amountNum = amountUnit === "USD" && refPrice > 0 ? rawAmount / refPrice : rawAmount;

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

  const availableValue =
    p?.available_balance != null
      ? formatUsd(p.available_balance)
      : available != null
        ? `$${available.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "-";
  const currentPositionAmount = currentPosition?.sizeTokenAmount ?? 0;
  const currentPositionValue =
    amountNum > 0
      ? `${formatTrimmed(amountNum, 4)} ${baseSymbol}`
      : currentPositionAmount > 0
        ? `${formatTrimmed(currentPositionAmount, 4)} ${baseSymbol}`
        : "-";

  useEffect(() => {
    if (amount || currentPositionAmount <= 0 || !market.markPrice || market.markPrice <= 0) return;

    if (amountUnit === "USD") {
      setAmount(parseFloat((currentPositionAmount * market.markPrice).toFixed(6)).toString());
    } else {
      setAmount(parseFloat(currentPositionAmount.toFixed(4)).toString());
    }
  }, [amount, amountUnit, currentPositionAmount, market.markPrice]);

  const onAmountInput = (nextRaw: string) => {
    setAmount(nextRaw);
    const typed = Number(nextRaw) || 0;
    const balanceUsd = p?.available_balance ? Number(p.available_balance) : available;

    if (balanceUsd != null && balanceUsd > 0 && refPrice > 0) {
      const usdValue = amountUnit === "USD" ? typed : typed * refPrice;
      setPct(Math.max(0, Math.min(100, Math.round((usdValue / balanceUsd) * 100))));
    } else {
      setPct(0);
    }
  };

  const onPctChange = (nextPct: number) => {
    setPct(nextPct);
    const balanceUsd = p?.available_balance ? Number(p.available_balance) : available;
    if (balanceUsd != null && refPrice > 0) {
      const nextAmount =
        amountUnit === "USD"
          ? (balanceUsd * (nextPct / 100)).toFixed(2)
          : ((balanceUsd * (nextPct / 100)) / refPrice).toFixed(5);
      setAmount(nextAmount);
    }
  };

  const onUnitChange = (nextValue: string) => {
    const nextUnit = nextValue === "USD" ? "USD" : "SYMBOL";
    if (nextUnit !== amountUnit && rawAmount > 0 && refPrice > 0) {
      const converted = nextUnit === "USD" ? rawAmount * refPrice : rawAmount / refPrice;
      setAmount(converted.toFixed(nextUnit === "USD" ? 2 : 5));
    }
    setAmountUnit(nextUnit);
  };

  const canSubmit = triggerPriceNum > 0 && amountNum > 0;
  const orderValueText =
    amountNum > 0 && refPrice > 0 ? `$${(amountNum * refPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-";
  const maximumOrderValueText = p?.order_value ? formatUsd(p.order_value) : "-";

  const submit = () =>
    placeOrder({
      side,
      type: requestTypeMap[type],
      amount: amountNum,
      price: hasLimitPrice ? limitPriceNum || undefined : undefined,
      triggerPrice: triggerPriceNum || undefined,
      leverage,
      marginMode,
      reduceOnly,
      timeInForce: hasLimitPrice ? "GTC" : undefined,
      workingType: "MARK_PRICE",
    });

  return (
    <div className="ltr-form">
      <div className="ltr-form__section">
        <Row label="Available to Trade" value={availableValue} />
        <Row
          label="Position"
          value={
            currentPositionAmount > 0 ? (
              <span className={currentPosition?.side === "short" ? "ltr-down" : "ltr-up"}>
                {formatTrimmed(currentPositionAmount, 4)}
              </span>
            ) : (
              "-"
            )
          }
        />
      </div>

      <div className="ltr-form__section">
        <div className="ltr-form__field">
          <label className="ltr-form__label">{triggerLabel}</label>
          <input
            className="ltr-form__input"
            value={triggerPrice}
            onChange={(e) => setTriggerPrice(e.target.value)}
            placeholder="0.000000"
            inputMode="decimal"
          />
        </div>

        {hasLimitPrice && (
          <div className="ltr-form__field">
            <label className="ltr-form__label">Limit Price</label>
            <input
              className="ltr-form__input"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder="0.000000"
              inputMode="decimal"
            />
            <button
              type="button"
              className="ltr-form__trailing ltr-form__trailing--link"
              onClick={() => {
                if (market.markPrice) setLimitPrice(market.markPrice.toString());
              }}
            >
              Mid
            </button>
          </div>
        )}

        <div className="ltr-form__field">
          <label className="ltr-form__label">Amount</label>
          <input
            className="ltr-form__input"
            value={amount}
            onChange={(e) => onAmountInput(e.target.value)}
            placeholder={amountUnit === "USD" ? "0.00" : "0.00000"}
            inputMode="decimal"
          />
          <CoinSelect
            value={amountUnit === "USD" ? "USD" : baseSymbol}
            options={amountUnitOptions}
            onChange={onUnitChange}
          />
        </div>

        <PercentSlider value={pct} onChange={onPctChange} side={side} />

        <Checkbox checked={reduceOnly} onChange={setReduceOnly} label="Reduce Only" />

      </div>

      <div className="ltr-form__section">
        {hasLimitPrice && <Row label="Maximum Order Value" value={maximumOrderValueText} />}
        <Row label="Order Size" value={currentPositionValue} />
        {hasLimitPrice && <Row label="Order Value" value={orderValueText} />}
        <Row
          label="Fees"
          value={`Taker: ${formatPct(p?.taker_fee_rate) || "0%"} | Maker: ${formatPct(p?.maker_fee_rate) || "0%"}`}
        />
      </div>

      {isConnected && (
        <button
          onClick={submit}
          disabled={submitting || !canSubmit}
          className={`ltr-form__submit ltr-form__submit--${side}`}
        >
          {canSubmit ? submitLabelMap[type] : `Enter ${triggerLabel}`}
        </button>
      )}
    </div>
  );
}

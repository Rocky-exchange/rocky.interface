import { t, Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import BigNumber from "bignumber.js";
import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./OrderForm.module.scss";
import { calculateOrderSummary, quantityForPercent } from "./orderFormMath";
import { spotApi, SpotApiError, type DepthResp } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { useSpotAssetPrecisions } from "../../hooks/useSpotAssetPrecisions";
import { formatSpotAssetAmount } from "../../model/assetPrecision";
import type { SpotMarket } from "../../model/spotMarkets";

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";

const Decimal = BigNumber.clone({ DECIMAL_PLACES: 40, ROUNDING_MODE: BigNumber.ROUND_DOWN });
const MARKET_BAND = new Decimal("1.05");

type PercentOrderInput = {
  side: Side;
  percent: number;
  price: string;
  baseFree: string;
  quoteFree: string;
};

function balanceFree(asset: string, balances: { asset: string; free: string }[]): string {
  return balances.find((balance) => balance.asset.toUpperCase() === asset.toUpperCase())?.free ?? "0";
}

function positiveDecimal(value: string): BigNumber | null {
  const number = new Decimal(value);
  return number.isFinite() && number.gt(0) ? number : null;
}

function quantityForOrderPercent(input: PercentOrderInput): string {
  return quantityForPercent(input);
}

function isWithinAvailableBalance(
  side: Side,
  price: string,
  amount: string,
  baseFree: string,
  quoteFree: string
): boolean {
  const parsedPrice = positiveDecimal(price);
  const parsedAmount = positiveDecimal(amount);
  if (parsedPrice === null || parsedAmount === null) return false;

  if (side === "SELL") {
    const balance = new Decimal(baseFree);
    return balance.isFinite() && parsedAmount.lte(balance);
  }

  const balance = new Decimal(quoteFree);
  return balance.isFinite() && parsedPrice.times(parsedAmount).lte(balance);
}

function marketPrice(side: Side, bestAsk: string | undefined, bestBid: string | undefined): string {
  const source = positiveDecimal(side === "BUY" ? (bestAsk ?? "") : (bestBid ?? ""));
  if (source === null) return "";
  return side === "BUY"
    ? source.times(MARKET_BAND).toFixed()
    : source.times(new Decimal(2).minus(MARKET_BAND)).toFixed();
}

export function SpotOrderForm({ market }: { market: SpotMarket }) {
  const { i18n } = useLingui();
  const { ready, account, err: accountError, refetch } = useSpotAccount();
  const precisions = useSpotAssetPrecisions();
  const marketSession = useRef({ symbol: market.apiSymbol, generation: 0 });
  const sideTabRefs = useRef<Record<Side, HTMLButtonElement | null>>({ BUY: null, SELL: null });
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { displayBase: base, displayQuote: quote } = market;
  const balances = account?.balances ?? [];
  const baseFree = balanceFree(market.apiBase, balances);
  const quoteFree = balanceFree(market.apiQuote, balances);
  const { data: depth } = usePolling<DepthResp>(
    () => spotApi.depth(market.apiSymbol, 1),
    5000,
    [market.apiSymbol],
    { enabled: orderType === "MARKET" }
  );
  const effectivePrice =
    orderType === "LIMIT" ? price : marketPrice(side, depth?.asks?.[0]?.[0], depth?.bids?.[0]?.[0]);
  const availableValue = side === "BUY" ? quoteFree : baseFree;
  const availableAsset = side === "BUY" ? quote : base;
  const summary = useMemo(() => calculateOrderSummary(side, effectivePrice, amount), [amount, effectivePrice, side]);

  const selectSide = (nextSide: Side) => {
    const nextEffectivePrice =
      orderType === "LIMIT" ? price : marketPrice(nextSide, depth?.asks?.[0]?.[0], depth?.bids?.[0]?.[0]);
    setSide(nextSide);
    setAmount(
      percent === 0
        ? ""
        : quantityForOrderPercent({
            side: nextSide,
            percent,
            price: nextEffectivePrice,
            baseFree,
            quoteFree,
          })
    );
    setMsg(null);
  };

  const selectOrderType = (nextType: OrderType) => {
    const nextEffectivePrice =
      nextType === "LIMIT" ? price : marketPrice(side, depth?.asks?.[0]?.[0], depth?.bids?.[0]?.[0]);
    setOrderType(nextType);
    setAmount(
      percent === 0
        ? ""
        : quantityForOrderPercent({ side, percent, price: nextEffectivePrice, baseFree, quoteFree })
    );
    setMsg(null);
  };

  const activateSideFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, currentSide: Side) => {
    let nextSide: Side | null = null;
    if (event.key === "Home") nextSide = "BUY";
    if (event.key === "End") nextSide = "SELL";
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      nextSide = currentSide === "BUY" ? "SELL" : "BUY";
    }
    if (!nextSide) return;

    event.preventDefault();
    if (nextSide !== side) selectSide(nextSide);
    sideTabRefs.current[nextSide]?.focus();
  };

  const updateAmount = (value: string) => {
    setAmount(value);
    setPercent(0);
  };

  const updatePrice = (value: string) => {
    setPrice(value);
    if (percent === 0) return;
    setAmount(
      quantityForOrderPercent({
        side,
        percent,
        price: value,
        baseFree,
        quoteFree,
      })
    );
  };

  const updatePercent = (value: number) => {
    setPercent(value);
    setAmount(
      quantityForOrderPercent({
        side,
        percent: value,
        price: effectivePrice,
        baseFree,
        quoteFree,
      })
    );
  };

  useEffect(() => {
    if (percent === 0 || busy) return;
    const nextAmount = quantityForOrderPercent({ side, percent, price: effectivePrice, baseFree, quoteFree });
    setAmount((currentAmount) => (currentAmount === nextAmount ? currentAmount : nextAmount));
  }, [baseFree, busy, effectivePrice, percent, quoteFree, side]);

  useLayoutEffect(() => {
    if (marketSession.current.symbol === market.apiSymbol) return;
    marketSession.current = {
      symbol: market.apiSymbol,
      generation: marketSession.current.generation + 1,
    };
    setSide("BUY");
    setOrderType("LIMIT");
    setPrice("");
    setAmount("");
    setPercent(0);
    setMsg(null);
    setBusy(false);
  }, [market.apiSymbol]);

  const canSubmit =
    ready &&
    account?.canTrade === true &&
    !busy &&
    isWithinAvailableBalance(side, effectivePrice, amount, baseFree, quoteFree);

  const submit = async () => {
    if (!canSubmit) return;
    const submittedSession = marketSession.current;
    const isCurrentSession = () =>
      marketSession.current.symbol === submittedSession.symbol &&
      marketSession.current.generation === submittedSession.generation;
    setBusy(true);
    setMsg(null);
    try {
      const response = await spotApi.placeOrder({
        symbol: market.apiSymbol,
        side,
        type: orderType,
        ...(orderType === "LIMIT" ? { price } : {}),
        quantity: amount,
      });
      if (!isCurrentSession()) return;
      const confirmation = side === "BUY" ? i18n._(t`Buy order submitted`) : i18n._(t`Sell order submitted`);
      setMsg({ kind: "ok", text: `${confirmation} · ${response.orderId.slice(0, 12)}…` });
      if (orderType === "LIMIT") setPrice("");
      setAmount("");
      setPercent(0);
      refetch();
    } catch (error: unknown) {
      if (!isCurrentSession()) return;
      const text =
        error instanceof SpotApiError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      setMsg({ kind: "err", text });
    } finally {
      if (isCurrentSession()) setBusy(false);
    }
  };

  const sliderStyle = { "--slider-fill": `${percent}%` } as CSSProperties;

  return (
    <div className={styles.panel}>
      <div className={styles.orderTypeTabs} role="tablist" aria-label="Order type">
        <button
          type="button"
          id="spot-market-tab"
          role="tab"
          aria-selected={orderType === "MARKET"}
          aria-controls="spot-order-form-panel"
          tabIndex={orderType === "MARKET" && !busy ? 0 : -1}
          disabled={busy}
          className={orderType === "MARKET" ? styles.orderTypeActive : undefined}
          onClick={() => selectOrderType("MARKET")}
        >
          <Trans>Market</Trans>
        </button>
        <button
          type="button"
          id="spot-limit-tab"
          role="tab"
          aria-selected={orderType === "LIMIT"}
          aria-controls="spot-order-form-panel"
          tabIndex={orderType === "LIMIT" && !busy ? 0 : -1}
          disabled={busy}
          className={orderType === "LIMIT" ? styles.orderTypeActive : undefined}
          onClick={() => selectOrderType("LIMIT")}
        >
          <Trans>Limit</Trans>
        </button>
      </div>

      <div className={styles.sideTabs} role="tablist" aria-label="Order side">
        <button
          type="button"
          id="spot-buy-tab"
          role="tab"
          aria-selected={side === "BUY"}
          aria-controls="spot-order-form-panel"
          tabIndex={side === "BUY" && !busy ? 0 : -1}
          disabled={busy}
          className={styles.sideTab}
          onClick={() => selectSide("BUY")}
          onKeyDown={(event) => activateSideFromKeyboard(event, "BUY")}
          ref={(node) => {
            sideTabRefs.current.BUY = node;
          }}
        >
          <Trans>Buy</Trans> {base}
        </button>
        <button
          type="button"
          id="spot-sell-tab"
          role="tab"
          aria-selected={side === "SELL"}
          aria-controls="spot-order-form-panel"
          tabIndex={side === "SELL" && !busy ? 0 : -1}
          disabled={busy}
          className={styles.sideTab}
          onClick={() => selectSide("SELL")}
          onKeyDown={(event) => activateSideFromKeyboard(event, "SELL")}
          ref={(node) => {
            sideTabRefs.current.SELL = node;
          }}
        >
          <Trans>Sell</Trans> {base}
        </button>
        <div
          aria-hidden="true"
          data-testid="spot-side-indicator"
          className={`${styles.sideIndicator} ${side === "BUY" ? styles.indicatorBuy : styles.indicatorSell}`}
        />
      </div>

      <div
        id="spot-order-form-panel"
        role="tabpanel"
        aria-labelledby={`spot-${side.toLowerCase()}-tab spot-${orderType.toLowerCase()}-tab`}
        className={styles.body}
      >
        <div className={styles.available}>
          <span>
            <Trans>Available</Trans>
          </span>
          <strong>
            {account ? formatSpotAssetAmount(availableValue, availableAsset, precisions) : "—"} {availableAsset}
          </strong>
        </div>
        {accountError && <div className={styles.accountHint}>{accountError}</div>}

        <div className={`${styles.field} ${orderType === "MARKET" ? styles.readOnlyShell : ""}`}>
          <label htmlFor="spot-order-price" className={styles.fieldLabel}>
            {orderType === "MARKET" ? <Trans>Est. Price</Trans> : <Trans>Price</Trans>}
          </label>
          <input
            id="spot-order-price"
            aria-label={`Price (${quote})`}
            className={styles.input}
            value={orderType === "MARKET" && effectivePrice ? effectivePrice : price}
            onChange={(event) => updatePrice(event.target.value)}
            disabled={busy}
            placeholder={orderType === "MARKET" ? "—" : "500"}
            inputMode="decimal"
            autoComplete="off"
            readOnly={orderType === "MARKET"}
            tabIndex={orderType === "MARKET" ? -1 : undefined}
          />
          <span className={styles.unit}>{quote}</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="spot-order-amount" className={styles.fieldLabel}>
            <Trans>Amount</Trans>
          </label>
          <input
            id="spot-order-amount"
            aria-label={`Amount (${base})`}
            className={styles.input}
            value={amount}
            onChange={(event) => updateAmount(event.target.value)}
            disabled={busy}
            placeholder="0.1"
            inputMode="decimal"
            autoComplete="off"
          />
          <span className={styles.unit}>{base}</span>
        </div>

        <div className={styles.sliderBlock}>
          <input
            aria-label="Order percentage"
            className={`${styles.slider} ${side === "BUY" ? styles.sliderBuy : styles.sliderSell}`}
            style={sliderStyle}
            type="range"
            min="0"
            max="100"
            step="1"
            value={percent}
            onChange={(event) => updatePercent(Number(event.target.value))}
            disabled={busy}
          />
          <div className={styles.percentInput}>
            <input
              aria-label="Order percentage input"
              className={styles.percentInputValue}
              value={percent}
              inputMode="numeric"
              onChange={(event) => {
                const next = Number(event.target.value.replace(/[^0-9]/g, ""));
                if (!Number.isNaN(next)) updatePercent(Math.max(0, Math.min(100, next)));
              }}
              disabled={busy}
            />
            <span aria-hidden="true">%</span>
          </div>
        </div>

        <div className={`${styles.field} ${styles.readOnlyShell}`}>
          <label htmlFor="spot-order-total" className={styles.fieldLabel}>
            <Trans>Total</Trans>
          </label>
          <input
            id="spot-order-total"
            aria-label={`Total (${quote})`}
            className={styles.input}
            value={summary.total}
            placeholder="0.00"
            readOnly
            tabIndex={-1}
          />
          <span className={styles.unit}>{quote}</span>
        </div>

        {ready ? (
          <button
            type="button"
            className={`${styles.submit} ${side === "BUY" ? styles.submitBuy : styles.submitSell}`}
            aria-label={busy ? "Sending…" : `${side} ${base}`}
            onClick={submit}
            disabled={!canSubmit}
          >
            {busy ? (
              <Trans>Sending…</Trans>
            ) : (
              <>
                {side === "BUY" ? <Trans>BUY</Trans> : <Trans>SELL</Trans>} {base} ·{" "}
                {orderType === "MARKET" ? <Trans>Market</Trans> : <Trans>Limit</Trans>}
              </>
            )}
          </button>
        ) : (
          <button type="button" className={`${styles.submit} ${styles.connect}`} onClick={openCantonConnect}>
            <Trans>Connect Wallet</Trans>
          </button>
        )}

        <div className={styles.feeRow}>
          <span>
            <Trans>Fee</Trans> (0.1%)
          </span>
          <strong>
            {summary.fee ? `${summary.fee} ${side === "BUY" ? base : quote}` : `— ${side === "BUY" ? base : quote}`}
          </strong>
        </div>

        {msg && (
          <div className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`} role="status">
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

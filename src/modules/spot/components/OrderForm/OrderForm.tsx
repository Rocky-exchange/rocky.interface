import BigNumber from "bignumber.js";
import { type CSSProperties, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./OrderForm.module.scss";
import { calculateOrderSummary, quantityForPercent } from "./orderFormMath";
import { spotApi, SpotApiError } from "../../api/spotClient";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import type { SpotMarket } from "../../model/spotMarkets";

type Side = "BUY" | "SELL";

const Decimal = BigNumber.clone({ DECIMAL_PLACES: 40, ROUNDING_MODE: BigNumber.ROUND_DOWN });
const FEE_MULTIPLIER = new Decimal("1.001");

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

function formatBalance(value: string): string {
  const number = new Decimal(value);
  if (!number.isFinite()) return "—";
  return number.decimalPlaces(8, BigNumber.ROUND_DOWN).toFormat();
}

function positiveDecimal(value: string): BigNumber | null {
  const number = new Decimal(value);
  return number.isFinite() && number.gt(0) ? number : null;
}

function quantityForOrderPercent(input: PercentOrderInput): string {
  if (input.side === "SELL") return quantityForPercent(input);

  const price = positiveDecimal(input.price);
  const balance = positiveDecimal(input.quoteFree);
  if (price === null || balance === null) return "";

  const percent = Decimal.maximum(0, Decimal.minimum(100, input.percent));
  return balance
    .times(percent)
    .dividedBy(100)
    .dividedBy(price)
    .dividedBy(FEE_MULTIPLIER)
    .decimalPlaces(8, BigNumber.ROUND_DOWN)
    .toFixed();
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
  return balance.isFinite() && parsedPrice.times(parsedAmount).times(FEE_MULTIPLIER).lte(balance);
}

export function SpotOrderForm({ market }: { market: SpotMarket }) {
  const { ready, account, err: accountError, refetch } = useSpotAccount();
  const marketSession = useRef({ symbol: market.apiSymbol, generation: 0 });
  const sideTabRefs = useRef<Record<Side, HTMLButtonElement | null>>({ BUY: null, SELL: null });
  const [side, setSide] = useState<Side>("BUY");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { displayBase: base, displayQuote: quote } = market;
  const balances = account?.balances ?? [];
  const baseFree = balanceFree(market.apiBase, balances);
  const quoteFree = balanceFree(market.apiQuote, balances);
  const availableValue = side === "BUY" ? quoteFree : baseFree;
  const availableAsset = side === "BUY" ? quote : base;
  const summary = useMemo(() => calculateOrderSummary(price, amount), [amount, price]);

  const selectSide = (nextSide: Side) => {
    setSide(nextSide);
    setAmount(
      percent === 0
        ? ""
        : quantityForOrderPercent({
            side: nextSide,
            percent,
            price,
            baseFree,
            quoteFree,
          })
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
        price,
        baseFree,
        quoteFree,
      })
    );
  };

  useEffect(() => {
    if (percent === 0 || busy) return;
    const nextAmount = quantityForOrderPercent({ side, percent, price, baseFree, quoteFree });
    setAmount((currentAmount) => (currentAmount === nextAmount ? currentAmount : nextAmount));
  }, [baseFree, busy, percent, price, quoteFree, side]);

  useLayoutEffect(() => {
    if (marketSession.current.symbol === market.apiSymbol) return;
    marketSession.current = {
      symbol: market.apiSymbol,
      generation: marketSession.current.generation + 1,
    };
    setSide("BUY");
    setPrice("");
    setAmount("");
    setPercent(0);
    setMsg(null);
    setBusy(false);
  }, [market.apiSymbol]);

  const canSubmit =
    ready && account?.canTrade === true && !busy && isWithinAvailableBalance(side, price, amount, baseFree, quoteFree);

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
        type: "LIMIT",
        price,
        quantity: amount,
      });
      if (!isCurrentSession()) return;
      setMsg({ kind: "ok", text: `${response.status} · ${response.orderId.slice(0, 12)}…` });
      setPrice("");
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
        <button type="button" role="tab" aria-selected="false" aria-disabled="true" tabIndex={-1} disabled>
          Market
        </button>
        <button
          type="button"
          id="spot-limit-tab"
          role="tab"
          aria-selected="true"
          aria-controls="spot-order-form-panel"
          tabIndex={0}
          className={styles.orderTypeActive}
        >
          Limit
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
          Buy {base}
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
          Sell {base}
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
        aria-labelledby={`spot-${side.toLowerCase()}-tab spot-limit-tab`}
        className={styles.body}
      >
        <div className={styles.available}>
          <span>Available</span>
          <strong>
            {account ? formatBalance(availableValue) : "—"} {availableAsset}
          </strong>
        </div>
        {accountError && <div className={styles.accountHint}>{accountError}</div>}

        <div className={styles.field}>
          <label htmlFor="spot-order-price" className={styles.fieldLabel}>
            Price
          </label>
          <input
            id="spot-order-price"
            aria-label={`Price (${quote})`}
            className={styles.input}
            value={price}
            onChange={(event) => updatePrice(event.target.value)}
            disabled={busy}
            placeholder="500"
            inputMode="decimal"
            autoComplete="off"
          />
          <span className={styles.unit}>{quote}</span>
        </div>

        <div className={styles.field}>
          <label htmlFor="spot-order-amount" className={styles.fieldLabel}>
            Amount
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
            className={styles.slider}
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
            Total
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
            onClick={submit}
            disabled={!canSubmit}
          >
            {busy ? "Sending…" : `${side} ${base}`}
          </button>
        ) : (
          <button type="button" className={`${styles.submit} ${styles.connect}`} onClick={openCantonConnect}>
            Connect wallet
          </button>
        )}

        <div className={styles.feeRow}>
          <span>Fee (0.1%)</span>
          <strong>{summary.fee ? `${summary.fee} ${quote}` : `— ${quote}`}</strong>
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

import BigNumber from "bignumber.js";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./OrderForm.module.scss";
import { calculateOrderSummary, quantityForPercent } from "./orderFormMath";
import { spotApi, SpotApiError } from "../../api/spotClient";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import type { SpotMarket } from "../../model/spotMarkets";

type Side = "BUY" | "SELL";

const PERCENT_LABELS = [0, 25, 50, 75, 100] as const;
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

  const canSubmit =
    ready && account?.canTrade === true && !busy && isWithinAvailableBalance(side, price, amount, baseFree, quoteFree);

  const submit = async () => {
    if (!canSubmit) return;
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
      setMsg({ kind: "ok", text: `${response.status} · ${response.orderId.slice(0, 12)}…` });
      setPrice("");
      setAmount("");
      setPercent(0);
      refetch();
    } catch (error: unknown) {
      const text =
        error instanceof SpotApiError
          ? `[${error.code}] ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      setMsg({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  };

  const sliderStyle = { "--slider-fill": `${percent}%` } as CSSProperties;

  return (
    <div className={styles.panel}>
      <div className={styles.sideTabs} role="tablist" aria-label="Order side">
        <button
          type="button"
          role="tab"
          aria-selected={side === "BUY"}
          disabled={busy}
          className={`${styles.sideTab} ${side === "BUY" ? styles.sideTabBuyActive : ""}`}
          onClick={() => selectSide("BUY")}
        >
          Buy {base}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={side === "SELL"}
          disabled={busy}
          className={`${styles.sideTab} ${side === "SELL" ? styles.sideTabSellActive : ""}`}
          onClick={() => selectSide("SELL")}
        >
          Sell {base}
        </button>
      </div>

      <div className={styles.orderTypeTabs} role="tablist" aria-label="Order type">
        <button type="button" role="tab" aria-selected="true" className={styles.orderTypeActive}>
          Limit
        </button>
        <button type="button" role="tab" aria-selected="false" disabled>
          Market
        </button>
        <button type="button" role="tab" aria-selected="false" disabled>
          Limit Order
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.available}>
          <span>Available</span>
          <strong>
            {account ? formatBalance(availableValue) : "—"} {availableAsset}
          </strong>
        </div>
        {accountError && <div className={styles.accountHint}>{accountError}</div>}

        <div className={styles.field}>
          <label htmlFor="spot-order-price" className={styles.fieldLabel}>
            Price ({quote})
          </label>
          <div className={styles.inputShell}>
            <input
              id="spot-order-price"
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
        </div>

        <div className={styles.field}>
          <label htmlFor="spot-order-amount" className={styles.fieldLabel}>
            Amount ({base})
          </label>
          <div className={styles.inputShell}>
            <input
              id="spot-order-amount"
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
          <div className={styles.percentLabels} aria-hidden="true">
            {PERCENT_LABELS.map((label) => (
              <span key={label}>{label}%</span>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="spot-order-total" className={styles.fieldLabel}>
            Total ({quote})
          </label>
          <div className={`${styles.inputShell} ${styles.readOnlyShell}`}>
            <input
              id="spot-order-total"
              className={styles.input}
              value={summary.total}
              placeholder="0.00"
              readOnly
              tabIndex={-1}
            />
            <span className={styles.unit}>{quote}</span>
          </div>
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

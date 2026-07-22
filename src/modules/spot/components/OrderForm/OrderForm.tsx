import { type CSSProperties, useMemo, useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./OrderForm.module.scss";
import { calculateOrderSummary, quantityForPercent } from "./orderFormMath";
import { spotApi, SpotApiError } from "../../api/spotClient";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import type { SpotMarket } from "../../model/spotMarkets";

type Side = "BUY" | "SELL";

const PERCENT_LABELS = [0, 25, 50, 75, 100] as const;

function balanceFree(asset: string, balances: { asset: string; free: string }[]): string {
  return balances.find((balance) => balance.asset.toUpperCase() === asset.toUpperCase())?.free ?? "0";
}

function formatBalance(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("en-US", { maximumFractionDigits: 8 });
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
    setAmount("");
    setPercent(0);
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
      quantityForPercent({
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
      quantityForPercent({
        side,
        percent: value,
        price,
        baseFree,
        quoteFree,
      })
    );
  };

  const submit = async () => {
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

  const disabled = busy || !summary.total || !ready;
  const sliderStyle = { "--slider-fill": `${percent}%` } as CSSProperties;

  return (
    <div className={styles.panel}>
      <div className={styles.sideTabs} role="tablist" aria-label="Order side">
        <button
          type="button"
          role="tab"
          aria-selected={side === "BUY"}
          className={`${styles.sideTab} ${side === "BUY" ? styles.sideTabBuyActive : ""}`}
          onClick={() => selectSide("BUY")}
        >
          Buy {base}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={side === "SELL"}
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
              placeholder="0.1"
              inputMode="decimal"
              autoComplete="off"
            />
            <span className={styles.unit}>{base}</span>
          </div>
        </div>

        <div className={styles.sliderBlock}>
          <input
            aria-label="Order size percentage"
            className={styles.slider}
            style={sliderStyle}
            type="range"
            min="0"
            max="100"
            step="1"
            value={percent}
            onChange={(event) => updatePercent(Number(event.target.value))}
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
            disabled={disabled}
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

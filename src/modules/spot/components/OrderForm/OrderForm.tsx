import { useMemo, useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./OrderForm.module.scss";
import { spotApi, SpotApiError } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import type { SpotMarket } from "../../model/spotMarkets";

type Side = "BUY" | "SELL";
const MUTED_TEXT_STYLE = { color: "var(--ltr-text-muted)" } as const;

export function SpotOrderForm({ market }: { market: SpotMarket }) {
  const ready = useSpotAuthReady();
  const [side, setSide] = useState<Side>("BUY");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { displayBase: base, displayQuote: quote } = market;
  const notional = useMemo(() => {
    const p = parseFloat(price);
    const q = parseFloat(qty);
    if (!isFinite(p) || !isFinite(q)) return "—";
    return (p * q).toLocaleString("en-US", { maximumFractionDigits: 4 });
  }, [price, qty]);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await spotApi.placeOrder({
        symbol: market.apiSymbol,
        side,
        type: "LIMIT",
        price,
        quantity: qty,
      });
      setMsg({ kind: "ok", text: `${r.status} · ${r.orderId.slice(0, 12)}…` });
      setPrice("");
      setQty("");
    } catch (e: unknown) {
      const text = e instanceof SpotApiError ? `[${e.code}] ${e.message}` : e instanceof Error ? e.message : String(e);
      setMsg({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !price || !qty || !ready;

  return (
    <div className={styles.panel}>
      <div className={styles.sideTabs}>
        <button
          type="button"
          className={`${styles.sideTab} ${side === "BUY" ? styles.sideTabBuyActive : ""}`}
          onClick={() => setSide("BUY")}
        >
          Buy {base}
        </button>
        <button
          type="button"
          className={`${styles.sideTab} ${side === "SELL" ? styles.sideTabSellActive : ""}`}
          onClick={() => setSide("SELL")}
        >
          Sell {base}
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Price ({quote})</span>
          <input
            className={styles.input}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="500"
            inputMode="decimal"
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Quantity ({base})</span>
          <input
            className={styles.input}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0.1"
            inputMode="decimal"
          />
        </div>
        <div className={styles.summary}>
          <span>Notional</span>
          <span className={styles.summaryValue}>
            {notional} <span style={MUTED_TEXT_STYLE}>{quote}</span>
          </span>
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
          <button type="button" className={styles.submit} onClick={openCantonConnect}>
            Connect wallet
          </button>
        )}
        {msg && <div className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";

import { spotApi, SpotApiError } from "../../api/spotClient";
import styles from "./OrderForm.module.scss";

type Side = "BUY" | "SELL";

export function SpotOrderForm({ symbol }: { symbol: string }) {
  const [side, setSide] = useState<Side>("BUY");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [base, quote] = useMemo(() => symbol.split("-"), [symbol]);
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
        symbol,
        side,
        type: "LIMIT",
        price,
        quantity: qty,
      });
      setMsg({ kind: "ok", text: `${r.status} · ${r.orderId.slice(0, 12)}…` });
      setPrice("");
      setQty("");
    } catch (e: unknown) {
      const text =
        e instanceof SpotApiError
          ? `[${e.code}] ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      setMsg({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !price || !qty;

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
            {notional} <span style={{ color: "var(--ltr-text-muted)" }}>{quote}</span>
          </span>
        </div>
        <button
          type="button"
          className={`${styles.submit} ${side === "BUY" ? styles.submitBuy : styles.submitSell}`}
          onClick={submit}
          disabled={disabled}
        >
          {busy ? "Sending…" : `${side} ${base}`}
        </button>
        {msg && (
          <div className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

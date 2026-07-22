import { useMemo, useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./OrderForm.module.scss";
import { spotApi, SpotApiError, type Account, type Ticker24h } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { usePolling } from "../../hooks/usePolling";

type Side = "BUY" | "SELL";

function availableOf(account: Account | null, asset: string): number | null {
  if (!account) return null;
  const row = account.balances.find((b) => b.asset === asset);
  if (!row) return 0;
  const free = parseFloat(row.free);
  return isFinite(free) ? free : 0;
}

function fmtAmount(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function SpotOrderForm({ symbol }: { symbol: string }) {
  const ready = useSpotAuthReady();
  const [side, setSide] = useState<Side>("BUY");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [base, quote] = useMemo(() => symbol.split("-"), [symbol]);

  // Balances for the affordability guard + "Available" row. Same source the
  // Accounts panel polls; a second light poll here keeps the form standalone.
  const { data: account, refetch: refetchAccount } = usePolling<Account>(
    () => spotApi.account(),
    5000,
    [],
    { enabled: ready },
  );
  // Last trade price for one-click prefill (public endpoint, works pre-auth).
  const { data: ticker } = usePolling<Ticker24h>(() => spotApi.ticker(symbol), 5000, [symbol]);
  const lastPrice = ticker && parseFloat(ticker.lastPrice) > 0 ? ticker.lastPrice : null;

  const quoteAvail = availableOf(account ?? null, quote ?? "USDA");
  const baseAvail = availableOf(account ?? null, base ?? "");

  const priceNum = parseFloat(price);
  const qtyNum = parseFloat(qty);
  const notionalNum = isFinite(priceNum) && isFinite(qtyNum) ? priceNum * qtyNum : null;
  const notional =
    notionalNum === null ? "—" : notionalNum.toLocaleString("en-US", { maximumFractionDigits: 4 });

  // Affordability: BUY locks price*qty of quote; SELL locks qty of base.
  // Only guard once balances have actually loaded (null = still unknown).
  const insufficient = useMemo(() => {
    if (side === "BUY") {
      if (quoteAvail === null || notionalNum === null) return false;
      return notionalNum > quoteAvail;
    }
    if (baseAvail === null || !isFinite(qtyNum)) return false;
    return qtyNum > baseAvail;
  }, [side, quoteAvail, baseAvail, notionalNum, qtyNum]);

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
      refetchAccount();
    } catch (e: unknown) {
      const text = e instanceof SpotApiError ? `[${e.code}] ${e.message}` : e instanceof Error ? e.message : String(e);
      setMsg({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  };

  const fillMax = () => {
    if (side === "SELL") {
      if (baseAvail !== null && baseAvail > 0) setQty(String(baseAvail));
      return;
    }
    if (quoteAvail !== null && quoteAvail > 0 && isFinite(priceNum) && priceNum > 0) {
      // Truncate to 8dp so the resulting notional never exceeds the balance.
      setQty((Math.floor((quoteAvail / priceNum) * 1e8) / 1e8).toString());
    }
  };

  const disabled = busy || !price || !qty || !ready || insufficient;
  const available = side === "BUY" ? quoteAvail : baseAvail;
  const availableAsset = side === "BUY" ? quote : base;

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
      <div className={styles.typeTabs}>
        <span className={styles.typeTabActive}>Limit</span>
        <span className={styles.typeTabDisabled} title="Market orders are not available yet">
          Market
        </span>
      </div>
      <div className={styles.body}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>
            Price ({quote})
            {lastPrice && (
              <button type="button" className={styles.fillChip} onClick={() => setPrice(lastPrice)}>
                Last {parseFloat(lastPrice).toLocaleString("en-US", { maximumFractionDigits: 8 })}
              </button>
            )}
          </span>
          <input
            className={styles.input}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Limit price"
            inputMode="decimal"
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>
            Quantity ({base})
            {ready && available !== null && (
              <button type="button" className={styles.fillChip} onClick={fillMax}>
                Max
              </button>
            )}
          </span>
          <input
            className={styles.input}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0.1"
            inputMode="decimal"
          />
        </div>
        {ready && (
          <div className={styles.summary}>
            <span>Available</span>
            <span className={styles.summaryValue}>
              {fmtAmount(available)} <span className={styles.summaryUnit}>{availableAsset}</span>
            </span>
          </div>
        )}
        <div className={styles.summary}>
          <span>Notional</span>
          <span className={styles.summaryValue}>
            {notional} <span className={styles.summaryUnit}>{quote}</span>
          </span>
        </div>
        {insufficient && (
          <div className={`${styles.msg} ${styles.msgErr}`}>
            Insufficient {availableAsset} — transfer funds to spot first (Account panel below).
          </div>
        )}
        {ready ? (
          <button
            type="button"
            className={`${styles.submit} ${side === "BUY" ? styles.submitBuy : styles.submitSell}`}
            onClick={submit}
            disabled={disabled}
          >
            {busy ? "Sending…" : `${side} ${base} · Limit`}
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

import { Trans, t } from "@lingui/macro";
import { useMemo, useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./OrderForm.module.scss";
import { spotApi, SpotApiError, type Account, type DepthResp, type Ticker24h } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { usePolling } from "../../hooks/usePolling";

type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";
const MARKET_BAND = 1.05; // 5% protective band — mirrors backend gateway

function availableOf(account: Account | null, asset: string): number | null {
  if (!account) return null;
  // Case-insensitive: the backend keys some assets with mixed case (e.g.
  // "cETH"), while symbol.split("-") on "CETH-USDA" yields uppercase "CETH".
  // USDA/CBTC/cETH/CC are all distinct case-insensitively, so this is safe.
  const row = account.balances.find((b) => b.asset.toLowerCase() === asset.toLowerCase());
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
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
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

  // Top-of-book for the MARKET cap estimate (backend computes the real cap).
  const { data: depth } = usePolling<DepthResp>(
    () => spotApi.depth(symbol, 1), 5000, [symbol], { enabled: orderType === "MARKET" });
  const bestAsk = depth?.asks?.[0]?.[0] ? parseFloat(depth.asks[0][0]) : null;
  const bestBid = depth?.bids?.[0]?.[0] ? parseFloat(depth.bids[0][0]) : null;
  const capEst = bestAsk !== null ? bestAsk * MARKET_BAND : null;
  const floorEst = bestBid !== null ? bestBid * (2 - MARKET_BAND) : null;

  const quoteAvail = availableOf(account ?? null, quote ?? "USDA");
  const baseAvail = availableOf(account ?? null, base ?? "");

  const priceNum = parseFloat(price);
  const qtyNum = parseFloat(qty);
  const effPriceNum = orderType === "MARKET" ? ((side === "BUY" ? capEst : floorEst) ?? NaN) : priceNum;
  const notionalNum = isFinite(effPriceNum) && isFinite(qtyNum) ? effPriceNum * qtyNum : null;
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
        type: orderType,
        ...(orderType === "LIMIT" ? { price } : {}),
        quantity: qty,
      });
      setMsg({ kind: "ok", text: `${r.status} · ${r.orderId.slice(0, 12)}…` });
      if (orderType === "LIMIT") setPrice("");
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
    if (quoteAvail !== null && quoteAvail > 0 && isFinite(effPriceNum) && effPriceNum > 0) {
      // Truncate to 8dp so the resulting notional never exceeds the balance.
      setQty((Math.floor((quoteAvail / effPriceNum) * 1e8) / 1e8).toString());
    }
  };

  const [pct, setPct] = useState(0);

  // %-of-available slider (mirrors the Futures form): BUY sizes qty from
  // available quote at the entered price; SELL sizes qty from available base.
  const applyPct = (nextPct: number) => {
    setPct(nextPct);
    if (nextPct <= 0) return;
    if (side === "SELL") {
      if (baseAvail !== null && baseAvail > 0) {
        setQty((Math.floor(baseAvail * (nextPct / 100) * 1e8) / 1e8).toString());
      }
      return;
    }
    if (quoteAvail !== null && quoteAvail > 0 && isFinite(effPriceNum) && effPriceNum > 0) {
      setQty((Math.floor(((quoteAvail * (nextPct / 100)) / effPriceNum) * 1e8) / 1e8).toString());
    }
  };

  const marketReady =
    orderType === "LIMIT" || (side === "BUY" ? capEst !== null : floorEst !== null);
  const disabled =
    busy || !qty || !ready || insufficient || !marketReady ||
    (orderType === "LIMIT" && !price);
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
          <Trans>Buy</Trans> {base}
        </button>
        <button
          type="button"
          className={`${styles.sideTab} ${side === "SELL" ? styles.sideTabSellActive : ""}`}
          onClick={() => setSide("SELL")}
        >
          <Trans>Sell</Trans> {base}
        </button>
      </div>
      <div className={styles.typeTabs}>
        <button
          type="button"
          className={orderType === "LIMIT" ? styles.typeTabActive : styles.typeTab}
          onClick={() => setOrderType("LIMIT")}
        >
          <Trans>Limit</Trans>
        </button>
        <button
          type="button"
          className={orderType === "MARKET" ? styles.typeTabActive : styles.typeTab}
          onClick={() => setOrderType("MARKET")}
        >
          <Trans>Market</Trans>
        </button>
      </div>
      <div className={styles.body}>
        {orderType === "LIMIT" && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              <Trans>Price</Trans> ({quote})
              {lastPrice && (
                <button type="button" className={styles.fillChip} onClick={() => setPrice(lastPrice)}>
                  <Trans>Last</Trans> {parseFloat(lastPrice).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                </button>
              )}
            </span>
            <input
              className={styles.input}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t`Limit price`}
              inputMode="decimal"
            />
          </div>
        )}
        {orderType === "MARKET" && (
          <div className={styles.summary}>
            <span><Trans>Est. price</Trans></span>
            <span className={styles.summaryValue}>
              {side === "BUY"
                ? bestAsk !== null ? `≤ ${(bestAsk * MARKET_BAND).toLocaleString("en-US", { maximumFractionDigits: 8 })}` : "—"
                : bestBid !== null ? `≥ ${(bestBid * (2 - MARKET_BAND)).toLocaleString("en-US", { maximumFractionDigits: 8 })}` : "—"}
              <span className={styles.summaryUnit}> {quote} · <Trans>max slippage 5%</Trans></span>
            </span>
          </div>
        )}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>
            <Trans>Quantity</Trans> ({base})
            {ready && available !== null && (
              <button type="button" className={styles.fillChip} onClick={fillMax}>
                <Trans>Max</Trans>
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
          <div className={styles.sliderRow}>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={(e) => applyPct(Number(e.target.value))}
              className={styles.slider}
              aria-label="percent of available"
            />
            <span className={styles.sliderValue}>{pct}%</span>
          </div>
        )}
        {ready && (
          <div className={styles.summary}>
            <span>
              <Trans>Available</Trans>
            </span>
            <span className={styles.summaryValue}>
              {fmtAmount(available)} <span className={styles.summaryUnit}>{availableAsset}</span>
            </span>
          </div>
        )}
        <div className={styles.summary}>
          <span>
            <Trans>Notional</Trans>
          </span>
          <span className={styles.summaryValue}>
            {orderType === "MARKET" && notionalNum !== null ? "≈ " : ""}
            {notional} <span className={styles.summaryUnit}>{quote}</span>
          </span>
        </div>
        <div className={styles.summary}>
          <span>
            <Trans>Fees</Trans>
          </span>
          <span className={styles.summaryValue}>
            {/* Spot T1 tier (fee_tiers): maker 4 bps / taker 10 bps */}
            <span className={styles.summaryUnit}>Maker 0.04% · Taker 0.10%</span>
          </span>
        </div>
        {insufficient && (
          <div className={`${styles.msg} ${styles.msgErr}`}>
            <Trans>Insufficient {availableAsset} — transfer funds to spot first (Account panel below).</Trans>
          </div>
        )}
        {ready ? (
          <button
            type="button"
            className={`${styles.submit} ${side === "BUY" ? styles.submitBuy : styles.submitSell}`}
            onClick={submit}
            disabled={disabled}
          >
            {busy ? <Trans>Sending…</Trans> : `${side} ${base} · ${orderType === "MARKET" ? "Market" : "Limit"}`}
          </button>
        ) : (
          <button type="button" className={styles.submit} onClick={openCantonConnect}>
            <Trans>Connect wallet</Trans>
          </button>
        )}
        {msg && <div className={`${styles.msg} ${msg.kind === "ok" ? styles.msgOk : styles.msgErr}`}>{msg.text}</div>}
      </div>
    </div>
  );
}

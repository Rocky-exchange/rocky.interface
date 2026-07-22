import { type CSSProperties, useState } from "react";

import styles from "./OrderBook.module.scss";
import { spotApi, type DepthResp, type Trade } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";

type Tab = "book" | "trades";

function barWidthStyle(total: number, maxTotal: number): CSSProperties {
  return { width: `${(total / maxTotal) * 100}%` };
}

function fmtNum(v: string | number, digits = 2): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function BookBody({ market }: { market: SpotMarket }) {
  const { data, err } = usePolling<DepthResp>(
    () => spotApi.depth(market.apiSymbol, 20),
    1000,
    [market.apiSymbol]
  );
  if (err) return <div className={styles.err}>{err}</div>;
  if (!data) return <div className={styles.empty}>Loading…</div>;

  const asks = data.asks.slice(0, 15);
  const bids = data.bids.slice(0, 15);
  if (asks.length === 0 && bids.length === 0) {
    return <div className={styles.empty}>No resting orders</div>;
  }

  const askRows = asks.reduce<Array<{ p: string; q: string; total: number }>>((acc, [p, q]) => {
    const prev = acc.length ? acc[acc.length - 1].total : 0;
    acc.push({ p, q, total: prev + parseFloat(q) });
    return acc;
  }, []);
  const bidRows = bids.reduce<Array<{ p: string; q: string; total: number }>>((acc, [p, q]) => {
    const prev = acc.length ? acc[acc.length - 1].total : 0;
    acc.push({ p, q, total: prev + parseFloat(q) });
    return acc;
  }, []);
  const maxTotal = Math.max(askRows[askRows.length - 1]?.total ?? 0, bidRows[bidRows.length - 1]?.total ?? 0, 1e-9);
  const bestAsk = parseFloat(asks[0]?.[0] || "0");
  const bestBid = parseFloat(bids[0]?.[0] || "0");
  const mid = (bestAsk + bestBid) / 2;
  const spread = bestAsk - bestBid;
  const spreadPct = bestAsk > 0 ? (spread / bestAsk) * 100 : 0;

  return (
    <>
      <div className={styles.rows}>
        {askRows
          .slice()
          .reverse()
          .map((r, i) => (
            <div key={`a${i}`} className={styles.row}>
              <div
                className={`${styles.rowBar} ${styles.askBar}`}
                style={barWidthStyle(r.total, maxTotal)}
              />
              <span className={`${styles.rowText} ${styles.ask}`}>{fmtNum(r.p)}</span>
              <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.q, 4)}</span>
              <span className={`${styles.rowText} ${styles.right}`}>{r.total.toFixed(4)}</span>
            </div>
          ))}
      </div>
      <div className={styles.mid}>
        <span className={styles.midPrice}>{fmtNum(mid)}</span>
        <span>
          Spread {spread.toFixed(2)} ({spreadPct.toFixed(3)}%)
        </span>
      </div>
      <div className={styles.rows}>
        {bidRows.map((r, i) => (
          <div key={`b${i}`} className={styles.row}>
            <div className={`${styles.rowBar} ${styles.bidBar}`} style={barWidthStyle(r.total, maxTotal)} />
            <span className={`${styles.rowText} ${styles.bid}`}>{fmtNum(r.p)}</span>
            <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.q, 4)}</span>
            <span className={`${styles.rowText} ${styles.right}`}>{r.total.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function TradesBody({ market }: { market: SpotMarket }) {
  const { data } = usePolling<Trade[]>(() => spotApi.trades(market.apiSymbol, 30), 1500, [market.apiSymbol]);
  if (!data || data.length === 0) return <div className={styles.empty}>No trades yet</div>;
  return (
    <div className={styles.rows}>
      {data.map((t) => {
        const takerBuy = !t.isBuyerMaker;
        const cls = takerBuy ? styles.bid : styles.ask;
        const time = new Date(t.time).toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        return (
          <div key={t.id} className={styles.row}>
            <span className={`${styles.rowText} ${cls}`}>{fmtNum(t.price)}</span>
            <span className={`${styles.rowText} ${styles.tradeSize}`}>{fmtNum(t.qty, 4)}</span>
            <span className={`${styles.rowText} ${styles.tradeTime}`}>{time}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SpotOrderBookPanel({ market }: { market: SpotMarket }) {
  const [tab, setTab] = useState<Tab>("book");
  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        {(["book", "trades"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "book" ? "Orderbook" : "Trades"}
          </button>
        ))}
      </div>
      <div className={styles.header}>
        <span>Price</span>
        <span className={styles.right}>Size</span>
        <span className={styles.right}>{tab === "book" ? "Total" : "Time"}</span>
      </div>
      {tab === "book" ? <BookBody market={market} /> : <TradesBody market={market} />}
    </div>
  );
}

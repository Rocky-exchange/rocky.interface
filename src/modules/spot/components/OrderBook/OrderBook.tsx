import { type CSSProperties, type KeyboardEvent, useRef, useState } from "react";

import styles from "./OrderBook.module.scss";
import { spotApi, type DepthResp, type Trade } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";

type Tab = "book" | "trades";
type BookView = "all" | "asks" | "bids";

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

function BookBody({ market, view }: { market: SpotMarket; view: BookView }) {
  const { data, err } = usePolling<DepthResp>(() => spotApi.depth(market.apiSymbol, 20), 1000, [market.apiSymbol]);
  if (err) return <div className={styles.err}>{err}</div>;
  if (!data) return <div className={styles.empty}>Loading…</div>;

  const asks = data.asks.slice(0, 15);
  const bids = data.bids.slice(0, 15);
  if (asks.length === 0 && bids.length === 0) {
    return <div className={styles.empty}>No resting orders</div>;
  }

  const askRows = asks.reduce<Array<{ p: string; q: string; total: number; notional: number }>>((acc, [p, q]) => {
    const prev = acc.length ? acc[acc.length - 1].total : 0;
    acc.push({ p, q, total: prev + parseFloat(q), notional: parseFloat(p) * parseFloat(q) });
    return acc;
  }, []);
  const bidRows = bids.reduce<Array<{ p: string; q: string; total: number; notional: number }>>((acc, [p, q]) => {
    const prev = acc.length ? acc[acc.length - 1].total : 0;
    acc.push({ p, q, total: prev + parseFloat(q), notional: parseFloat(p) * parseFloat(q) });
    return acc;
  }, []);
  const maxTotal = Math.max(askRows[askRows.length - 1]?.total ?? 0, bidRows[bidRows.length - 1]?.total ?? 0, 1e-9);
  const bestAsk = asks[0] ? parseFloat(asks[0][0]) : null;
  const bestBid = bids[0] ? parseFloat(bids[0][0]) : null;
  const referencePrice = bestAsk !== null && bestBid !== null ? (bestAsk + bestBid) / 2 : bestAsk ?? bestBid;
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;
  const spreadPct = spread !== null && bestAsk !== null && bestAsk > 0 ? (spread / bestAsk) * 100 : null;

  return (
    <>
      {view !== "bids" && (
        <div className={styles.rows}>
          {askRows
            .slice()
            .reverse()
            .map((r, i) => (
              <div key={`a${i}`} className={styles.row}>
                <div className={`${styles.rowBar} ${styles.askBar}`} style={barWidthStyle(r.total, maxTotal)} />
                <span className={`${styles.rowText} ${styles.ask}`}>{fmtNum(r.p)}</span>
                <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.q, 4)}</span>
                <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.notional)}</span>
              </div>
            ))}
        </div>
      )}
      <div className={styles.mid}>
        <span className={styles.midPrice}>{fmtNum(referencePrice ?? Number.NaN)}</span>
        <span>
          {spread === null || spreadPct === null
            ? "Spread —"
            : `Spread ${spread.toFixed(2)} (${spreadPct.toFixed(3)}%)`}
        </span>
      </div>
      {view !== "asks" && (
        <div className={styles.rows}>
          {bidRows.map((r, i) => (
            <div key={`b${i}`} className={styles.row}>
              <div className={`${styles.rowBar} ${styles.bidBar}`} style={barWidthStyle(r.total, maxTotal)} />
              <span className={`${styles.rowText} ${styles.bid}`}>{fmtNum(r.p)}</span>
              <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.q, 4)}</span>
              <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.notional)}</span>
            </div>
          ))}
        </div>
      )}
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
  const [bookView, setBookView] = useState<BookView>("all");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ book: null, trades: null });

  const activateFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, currentTab: Tab) => {
    let nextTab: Tab | null = null;
    if (event.key === "Home") nextTab = "book";
    if (event.key === "End") nextTab = "trades";
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      nextTab = currentTab === "book" ? "trades" : "book";
    }
    if (!nextTab) return;

    event.preventDefault();
    setTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  const bookViewButtons: Array<{ view: BookView; label: string; lines: Array<"ask" | "bid"> }> = [
    { view: "all", label: "Show full order book", lines: ["ask", "ask", "bid"] },
    { view: "asks", label: "Show asks only", lines: ["ask", "ask", "ask"] },
    { view: "bids", label: "Show bids only", lines: ["bid", "bid", "bid"] },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.topBar}>
        <div className={styles.tabs} role="tablist" aria-label="Order book data">
          {(["book", "trades"] as const).map((t) => (
            <button
              key={t}
              type="button"
              id={`spot-${t}-tab`}
              role="tab"
              aria-selected={tab === t}
              aria-controls="spot-order-book-data-panel"
              tabIndex={tab === t ? 0 : -1}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
              onClick={() => setTab(t)}
              onKeyDown={(event) => activateFromKeyboard(event, t)}
              ref={(node) => {
                tabRefs.current[t] = node;
              }}
            >
              {t === "book" ? "Order Book" : "Recent Trades"}
            </button>
          ))}
        </div>
        {tab === "book" && (
          <div className={styles.bookViews} data-testid="spot-orderbook-toolbar">
            <div className={styles.bookViewButtons}>
              {bookViewButtons.map(({ view, label, lines }) => (
                <button
                  key={view}
                  type="button"
                  className={`${styles.bookViewButton} ${bookView === view ? styles.bookViewActive : ""}`}
                  aria-label={label}
                  aria-pressed={bookView === view}
                  onClick={() => setBookView(view)}
                >
                  <span className={styles.bookViewIcon} aria-hidden="true">
                    {lines.map((line, index) => (
                      <span key={`${line}-${index}`} className={line === "ask" ? styles.askLine : styles.bidLine} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.bookSelectors} aria-hidden="true">
              <span>{market.displayQuote}</span>
              <span>1</span>
            </div>
          </div>
        )}
      </div>
      <div
        id="spot-order-book-data-panel"
        role="tabpanel"
        aria-labelledby={`spot-${tab}-tab`}
        className={styles.dataPanel}
      >
        <div className={styles.header}>
          <span>Price ({market.displayQuote})</span>
          <span className={styles.right}>Amount ({market.displayBase})</span>
          <span className={styles.right}>{tab === "book" ? `Total (${market.displayQuote})` : "Time"}</span>
        </div>
        {tab === "book" ? (
          <BookBody key={market.apiSymbol} market={market} view={bookView} />
        ) : (
          <TradesBody key={market.apiSymbol} market={market} />
        )}
      </div>
    </div>
  );
}

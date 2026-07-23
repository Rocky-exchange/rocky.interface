import { Trans } from "@lingui/macro";
import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import styles from "./OrderBook.module.scss";
import {
  aggregateOrderBookLevels,
  buildOrderBookGroupOptions,
  orderBookPriceFractionDigits,
} from "../../../lighter/adapters/orderBookAggregation";
import { spotApi, type DepthResp, type Trade } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";

type Tab = "book" | "trades";
type BookView = "all" | "asks" | "bids";
type PriceLevel = string;

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

function BookBody({
  market,
  view,
  priceLevel,
  priceDigits,
}: {
  market: SpotMarket;
  view: BookView;
  priceLevel: PriceLevel;
  priceDigits: number;
}) {
  const { data, err } = usePolling<DepthResp>(() => spotApi.depth(market.apiSymbol, 20), 1000, [market.apiSymbol]);
  if (err) return <div className={styles.err}>{err}</div>;
  if (!data)
    return (
      <div className={styles.empty}>
        <Trans>Loading…</Trans>
      </div>
    );

  const tickSize = Number(priceLevel);
  const asks = aggregateOrderBookLevels(data.asks, "ask", tickSize).slice(0, 15);
  const bids = aggregateOrderBookLevels(data.bids, "bid", tickSize).slice(0, 15);
  if (asks.length === 0 && bids.length === 0) {
    return (
      <div className={styles.empty}>
        <Trans>No resting orders</Trans>
      </div>
    );
  }

  const askRows = asks.map((level) => ({
    p: level.price,
    q: level.size,
    total: level.total,
    notional: level.quoteSize,
  }));
  const bidRows = bids.map((level) => ({
    p: level.price,
    q: level.size,
    total: level.total,
    notional: level.quoteSize,
  }));
  const maxTotal = Math.max(askRows[askRows.length - 1]?.total ?? 0, bidRows[bidRows.length - 1]?.total ?? 0, 1e-9);
  const bestAsk = asks[0]?.price ?? null;
  const bestBid = bids[0]?.price ?? null;
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
                <span className={`${styles.rowText} ${styles.ask}`}>{fmtNum(r.p, priceDigits)}</span>
                <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.q, 4)}</span>
                <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.notional)}</span>
              </div>
            ))}
        </div>
      )}
      <div className={styles.mid}>
        <span className={styles.midPrice}>{fmtNum(referencePrice ?? Number.NaN, priceDigits)}</span>
        <span>
          <Trans>Spread</Trans>{" "}
          {spread === null || spreadPct === null
            ? "—"
            : `${spread.toFixed(priceDigits)} (${spreadPct.toFixed(3)}%)`}
        </span>
      </div>
      {view !== "asks" && (
        <div className={styles.rows}>
          {bidRows.map((r, i) => (
            <div key={`b${i}`} className={styles.row}>
              <div className={`${styles.rowBar} ${styles.bidBar}`} style={barWidthStyle(r.total, maxTotal)} />
              <span className={`${styles.rowText} ${styles.bid}`}>{fmtNum(r.p, priceDigits)}</span>
              <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.q, 4)}</span>
              <span className={`${styles.rowText} ${styles.right}`}>{fmtNum(r.notional)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TradesBody({ market, priceDigits }: { market: SpotMarket; priceDigits: number }) {
  const { data } = usePolling<Trade[]>(() => spotApi.trades(market.apiSymbol, 30), 1500, [market.apiSymbol]);
  if (!data || data.length === 0)
    return (
      <div className={styles.empty}>
        <Trans>No trades yet</Trans>
      </div>
    );
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
            <span className={`${styles.rowText} ${cls}`}>{fmtNum(t.price, priceDigits)}</span>
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
  const [priceLevel, setPriceLevel] = useState<PriceLevel>("");
  const [priceLevelMenuOpen, setPriceLevelMenuOpen] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ book: null, trades: null });
  const priceLevelControlRef = useRef<HTMLDivElement>(null);
  const priceLevelOptionsKeyRef = useRef("");
  const { data: markets } = usePolling(() => spotApi.markets(), 60_000);
  const marketTickSize = useMemo(
    () => markets?.find((item) => item.symbol.toUpperCase() === market.apiSymbol.toUpperCase())?.tick_size,
    [market.apiSymbol, markets]
  );
  const priceLevels = useMemo(() => buildOrderBookGroupOptions(marketTickSize, 5), [marketTickSize]);
  const activePriceLevel = priceLevels.includes(priceLevel) ? priceLevel : (priceLevels[0] ?? "");
  const priceDigits = orderBookPriceFractionDigits(marketTickSize ?? activePriceLevel);

  useEffect(() => {
    const key = `${market.apiSymbol}:${priceLevels.join(",")}`;
    if (key !== priceLevelOptionsKeyRef.current) {
      priceLevelOptionsKeyRef.current = key;
      setPriceLevel(priceLevels[0] ?? "");
      return;
    }

    if (!priceLevels.includes(priceLevel)) {
      setPriceLevel(priceLevels[0] ?? "");
    }
  }, [market.apiSymbol, priceLevel, priceLevels]);

  useEffect(() => {
    if (!priceLevelMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!priceLevelControlRef.current?.contains(event.target as Node)) {
        setPriceLevelMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [priceLevelMenuOpen]);

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
              {t === "book" ? <Trans>Order Book</Trans> : <Trans>Recent Trades</Trans>}
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
            <div className={styles.bookSelectors}>
              <span>{market.displayQuote}</span>
              <div className={styles.selectorWrap} ref={priceLevelControlRef}>
                <button
                  type="button"
                  className={styles.selectorButton}
                  aria-label="Order book price level"
                  aria-haspopup="menu"
                  aria-expanded={priceLevelMenuOpen}
                  onClick={() => setPriceLevelMenuOpen((open) => !open)}
                >
                  {activePriceLevel || "—"}
                  <svg
                    className={`${styles.caretSvg} ${priceLevelMenuOpen ? styles.caretOpen : ""}`}
                    width="10"
                    height="10"
                    viewBox="0 0 256 256"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
                  </svg>
                </button>
                {priceLevelMenuOpen && (
                  <div className={styles.selectorMenu} role="menu" aria-label="Order book price levels">
                    {priceLevels.map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={styles.selectorMenuItem}
                        role="menuitemradio"
                        aria-checked={activePriceLevel === level}
                        onClick={() => {
                          setPriceLevel(level);
                          setPriceLevelMenuOpen(false);
                        }}
                      >
                        <span>{level}</span>
                        {activePriceLevel === level && (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            aria-hidden="true"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
          <span>
            <Trans>Price</Trans> ({market.displayQuote})
          </span>
          <span className={styles.right}>
            <Trans>Amount</Trans> ({market.displayBase})
          </span>
          <span className={styles.right}>
            {tab === "book" ? (
              <>
                <Trans>Total</Trans> ({market.displayQuote})
              </>
            ) : (
              <Trans>Time</Trans>
            )}
          </span>
        </div>
        {!activePriceLevel ? (
          <div className={styles.empty}>
            <Trans>Loading…</Trans>
          </div>
        ) : tab === "book" ? (
          <BookBody
            key={market.apiSymbol}
            market={market}
            view={bookView}
            priceLevel={activePriceLevel}
            priceDigits={priceDigits}
          />
        ) : (
          <TradesBody key={market.apiSymbol} market={market} priceDigits={priceDigits} />
        )}
      </div>
    </div>
  );
}

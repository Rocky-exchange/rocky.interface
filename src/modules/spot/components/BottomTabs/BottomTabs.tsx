import { Trans } from "@lingui/macro";
import { type KeyboardEvent, useRef, useState } from "react";

import styles from "./BottomTabs.module.scss";
import { spotApi, type MyTrade, type SpotOrder } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";

const MUTED_TEXT_STYLE = { color: "var(--ltr-text-muted)" } as const;
const SECONDARY_TEXT_STYLE = { color: "var(--ltr-text-secondary)" } as const;

function fmtTime(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtNum(v: string, maxDigits = 8): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return v;
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDigits });
}

function OrderStatus({ status }: { status: SpotOrder["status"] }) {
  switch (status) {
    case "NEW":
      return <Trans>New</Trans>;
    case "PARTIALLY_FILLED":
      return <Trans>Partially filled</Trans>;
    case "FILLED":
      return <Trans>Filled</Trans>;
    case "CANCELED":
      return <Trans>Cancelled</Trans>;
  }
}

function OpenOrders({ market }: { market: SpotMarket }) {
  const ready = useSpotAuthReady();
  const { data, err, refetch } = usePolling<SpotOrder[]>(
    () => spotApi.openOrders(market.apiSymbol),
    2000,
    [market.apiSymbol],
    { enabled: ready },
  );
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(() => new Set());
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  if (!ready)
    return (
      <div className={styles.empty}>
        <Trans>Connect wallet from the header to view your open orders</Trans>
      </div>
    );

  const cancel = async (orderId: string) => {
    setCancelErr(null);
    setCancellingIds((current) => new Set(current).add(orderId));
    try {
      await spotApi.cancelOrder(market.apiSymbol, orderId);
      refetch();
    } catch (error: unknown) {
      setCancelErr(error instanceof Error ? error.message : String(error));
    } finally {
      setCancellingIds((current) => {
        const next = new Set(current);
        next.delete(orderId);
        return next;
      });
    }
  };

  if (err)
    return (
      <div className={styles.empty} role="alert">
        {err}
      </div>
    );
  if (!data)
    return (
      <div className={styles.empty} role="status">
        <Trans>Loading…</Trans>
      </div>
    );
  if (data.length === 0)
    return (
      <div className={styles.empty} role="status">
        <Trans>No open orders</Trans>
      </div>
    );

  return (
    <div className={styles.body}>
      {cancelErr && (
        <div className={styles.inlineError} role="alert">
          {cancelErr}
        </div>
      )}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>
              <Trans>Time</Trans>
            </th>
            <th>
              <Trans>Side</Trans>
            </th>
            <th>
              <Trans>Price</Trans>
            </th>
            <th>
              <Trans>Qty</Trans>
            </th>
            <th>
              <Trans>Filled</Trans>
            </th>
            <th>
              <Trans>Status</Trans>
            </th>
            <th>
              <Trans>Action</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((order) => (
            <tr key={order.orderId}>
              <td style={MUTED_TEXT_STYLE}>{fmtTime(order.time)}</td>
              <td className={order.side === "BUY" ? styles.buy : styles.sell}>{order.side}</td>
              <td>{fmtNum(order.price, 2)}</td>
              <td>{fmtNum(order.origQty, 8)}</td>
              <td>{fmtNum(order.executedQty, 8)}</td>
              <td style={SECONDARY_TEXT_STYLE}>{order.status}</td>
              <td>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => cancel(order.orderId)}
                  disabled={cancellingIds.has(order.orderId)}
                >
                  {cancellingIds.has(order.orderId) ? "…" : <Trans>Cancel</Trans>}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeHistory({ market }: { market: SpotMarket }) {
  const ready = useSpotAuthReady();
  // NOTE: the backend keys spot_trades on the settlement symbol (market.apiSymbol),
  // same source openOrders reads. If a symbol form ever returns no rows, the
  // mismatch is in the shared apiSymbol model, not here.
  const { data, err } = usePolling<MyTrade[]>(
    () => spotApi.myTrades(market.apiSymbol),
    3000,
    [market.apiSymbol],
    { enabled: ready },
  );

  if (!ready)
    return (
      <div className={styles.empty}>
        <Trans>Connect wallet from the header to view your trade history</Trans>
      </div>
    );

  if (err)
    return (
      <div className={styles.empty} role="alert">
        {err}
      </div>
    );
  if (!data)
    return (
      <div className={styles.empty} role="status">
        <Trans>Loading…</Trans>
      </div>
    );
  if (data.length === 0)
    return (
      <div className={styles.empty} role="status">
        <Trans>No trades yet</Trans>
      </div>
    );

  return (
    <div className={styles.body}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>
              <Trans>Time</Trans>
            </th>
            <th>
              <Trans>Side</Trans>
            </th>
            <th>
              <Trans>Price</Trans>
            </th>
            <th>
              <Trans>Qty</Trans>
            </th>
            <th>
              <Trans>Total</Trans>
            </th>
            <th>
              <Trans>Fee</Trans>
            </th>
            <th>
              <Trans>Role</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((trade) => (
            <tr key={trade.id}>
              <td style={MUTED_TEXT_STYLE}>{fmtTime(trade.time)}</td>
              <td className={trade.isBuyer ? styles.buy : styles.sell}>
                {trade.isBuyer ? <Trans>BUY</Trans> : <Trans>SELL</Trans>}
              </td>
              <td>${fmtNum(trade.price, 2)}</td>
              <td>
                {fmtNum(trade.qty, 8)} {market.displayBase}
              </td>
              <td>${fmtNum(trade.quoteQty, 2)}</td>
              <td style={MUTED_TEXT_STYLE}>
                {fmtNum(trade.commission, 6)} {trade.commissionAsset}
              </td>
              <td style={SECONDARY_TEXT_STYLE}>{trade.isMaker ? "Maker" : "Taker"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderHistory({ market }: { market: SpotMarket }) {
  const ready = useSpotAuthReady();
  const { data, err } = usePolling<SpotOrder[]>(
    () => spotApi.allOrders(market.apiSymbol),
    3000,
    [market.apiSymbol],
    { enabled: ready },
  );

  if (!ready)
    return (
      <div className={styles.empty}>
        <Trans>Connect wallet from the header to view your order history</Trans>
      </div>
    );

  if (err)
    return (
      <div className={styles.empty} role="alert">
        {err}
      </div>
    );
  if (!data)
    return (
      <div className={styles.empty} role="status">
        <Trans>Loading…</Trans>
      </div>
    );
  if (data.length === 0)
    return (
      <div className={styles.empty} role="status">
        <Trans>No order history</Trans>
      </div>
    );

  return (
    <div className={styles.body}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>
              <Trans>Time</Trans>
            </th>
            <th>
              <Trans>Side</Trans>
            </th>
            <th>
              <Trans>Price</Trans>
            </th>
            <th>
              <Trans>Qty</Trans>
            </th>
            <th>
              <Trans>Filled</Trans>
            </th>
            <th>
              <Trans>Status</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((order) => (
            <tr key={order.orderId}>
              <td style={MUTED_TEXT_STYLE}>{fmtTime(order.time ?? order.updateTime)}</td>
              <td className={order.side === "BUY" ? styles.buy : styles.sell}>{order.side}</td>
              <td>${fmtNum(order.price, 2)}</td>
              <td>
                {fmtNum(order.origQty, 8)} {market.displayBase}
              </td>
              <td>
                {fmtNum(order.executedQty, 8)} {market.displayBase}
              </td>
              <td style={SECONDARY_TEXT_STYLE}>
                <OrderStatus status={order.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type EnabledTab = "open-orders" | "order-history" | "trade-history";

const ENABLED_TABS: EnabledTab[] = ["open-orders", "order-history", "trade-history"];

export function SpotBottomTabs({ market }: { market: SpotMarket }) {
  const [activeTab, setActiveTab] = useState<EnabledTab>("open-orders");
  const tabRefs = useRef<Record<EnabledTab, HTMLButtonElement | null>>({
    "open-orders": null,
    "order-history": null,
    "trade-history": null,
  });

  const activateFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, currentTab: EnabledTab) => {
    const i = ENABLED_TABS.indexOf(currentTab);
    let nextTab: EnabledTab | null = null;
    if (event.key === "Home") nextTab = ENABLED_TABS[0];
    if (event.key === "End") nextTab = ENABLED_TABS[ENABLED_TABS.length - 1];
    if (event.key === "ArrowRight") nextTab = ENABLED_TABS[(i + 1) % ENABLED_TABS.length];
    if (event.key === "ArrowLeft")
      nextTab = ENABLED_TABS[(i - 1 + ENABLED_TABS.length) % ENABLED_TABS.length];
    if (!nextTab) return;

    event.preventDefault();
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Spot account workspace">
        <button
          type="button"
          id="spot-open-orders-tab"
          role="tab"
          aria-selected={activeTab === "open-orders"}
          aria-controls="spot-bottom-panel"
          tabIndex={activeTab === "open-orders" ? 0 : -1}
          className={`${styles.tab} ${activeTab === "open-orders" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("open-orders")}
          onKeyDown={(event) => activateFromKeyboard(event, "open-orders")}
          ref={(node) => {
            tabRefs.current["open-orders"] = node;
          }}
        >
          <Trans>Open Orders</Trans>
        </button>
        <button
          type="button"
          id="spot-order-history-tab"
          role="tab"
          aria-selected={activeTab === "order-history"}
          aria-controls="spot-bottom-panel"
          tabIndex={activeTab === "order-history" ? 0 : -1}
          className={`${styles.tab} ${activeTab === "order-history" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("order-history")}
          onKeyDown={(event) => activateFromKeyboard(event, "order-history")}
          ref={(node) => {
            tabRefs.current["order-history"] = node;
          }}
        >
          <Trans>Order History</Trans>
        </button>
        <button
          type="button"
          id="spot-trade-history-tab"
          role="tab"
          aria-selected={activeTab === "trade-history"}
          aria-controls="spot-bottom-panel"
          tabIndex={activeTab === "trade-history" ? 0 : -1}
          className={`${styles.tab} ${activeTab === "trade-history" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("trade-history")}
          onKeyDown={(event) => activateFromKeyboard(event, "trade-history")}
          ref={(node) => {
            tabRefs.current["trade-history"] = node;
          }}
        >
          <Trans>Trade History</Trans>
        </button>
        <div className={styles.viewControls} data-testid="spot-bottom-view-controls" aria-hidden="true">
          <span className={styles.viewControlActive}>
            <i className={styles.askLine} />
            <i className={styles.bidLine} />
          </span>
          <span>
            <i className={styles.askLine} />
            <i className={styles.askLine} />
          </span>
          <span>
            <i className={styles.bidLine} />
            <i className={styles.bidLine} />
          </span>
        </div>
      </div>
      <div
        id="spot-bottom-panel"
        role="tabpanel"
        aria-labelledby={
          activeTab === "order-history"
            ? "spot-order-history-tab"
            : activeTab === "trade-history"
              ? "spot-trade-history-tab"
              : "spot-open-orders-tab"
        }
        className={styles.tabPanel}
      >
        {activeTab === "open-orders" && <OpenOrders key={market.apiSymbol} market={market} />}
        {activeTab === "order-history" && <OrderHistory key={market.apiSymbol} market={market} />}
        {activeTab === "trade-history" && <TradeHistory key={market.apiSymbol} market={market} />}
      </div>
    </div>
  );
}

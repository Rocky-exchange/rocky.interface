import { type KeyboardEvent, useRef, useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./BottomTabs.module.scss";
import { spotApi, type SpotOrder } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";
import { SpotAccountsPanel } from "../Accounts/Accounts";

const CONNECT_HINT_STYLE = { marginLeft: 8, color: "var(--ltr-text-muted)" } as const;
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
        <button type="button" className={styles.connectCta} onClick={openCantonConnect}>
          Connect wallet
        </button>
        <span style={CONNECT_HINT_STYLE}>to view your open orders</span>
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
        Loading…
      </div>
    );
  if (data.length === 0)
    return (
      <div className={styles.empty} role="status">
        No open orders
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
            <th>Time</th>
            <th>Side</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Filled</th>
            <th>Status</th>
            <th>Action</th>
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
                  {cancellingIds.has(order.orderId) ? "…" : "Cancel"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type EnabledTab = "assets" | "open-orders";

export function SpotBottomTabs({ market }: { market: SpotMarket }) {
  const [activeTab, setActiveTab] = useState<EnabledTab>("assets");
  const tabRefs = useRef<Record<EnabledTab, HTMLButtonElement | null>>({
    assets: null,
    "open-orders": null,
  });

  const activateFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, currentTab: EnabledTab) => {
    let nextTab: EnabledTab | null = null;
    if (event.key === "Home") nextTab = "assets";
    if (event.key === "End") nextTab = "open-orders";
    if (event.key === "ArrowRight") nextTab = currentTab === "assets" ? "open-orders" : "assets";
    if (event.key === "ArrowLeft") nextTab = currentTab === "assets" ? "open-orders" : "assets";
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
          id="spot-assets-tab"
          role="tab"
          aria-selected={activeTab === "assets"}
          aria-controls="spot-bottom-panel"
          tabIndex={activeTab === "assets" ? 0 : -1}
          className={`${styles.tab} ${activeTab === "assets" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("assets")}
          onKeyDown={(event) => activateFromKeyboard(event, "assets")}
          ref={(node) => {
            tabRefs.current.assets = node;
          }}
        >
          Assets
        </button>
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
          Open Orders
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          tabIndex={-1}
          className={styles.tab}
          disabled
        >
          Order History
        </button>
        <button
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          tabIndex={-1}
          className={styles.tab}
          disabled
        >
          Trade History
        </button>
      </div>
      <div
        id="spot-bottom-panel"
        role="tabpanel"
        aria-labelledby={activeTab === "assets" ? "spot-assets-tab" : "spot-open-orders-tab"}
        className={styles.tabPanel}
      >
        {activeTab === "assets" ? (
          <SpotAccountsPanel market={market} />
        ) : (
          <OpenOrders key={market.apiSymbol} market={market} />
        )}
      </div>
    </div>
  );
}

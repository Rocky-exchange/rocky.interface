import { useState } from "react";

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
  const { data, err } = usePolling<SpotOrder[]>(
    () => spotApi.openOrders(market.apiSymbol),
    2000,
    [market.apiSymbol],
    { enabled: ready },
  );
  const [cancellingId, setCancellingId] = useState<string | null>(null);

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
    setCancellingId(orderId);
    try {
      await spotApi.cancelOrder(market.apiSymbol, orderId);
    } finally {
      setCancellingId(null);
    }
  };

  if (err) return <div className={styles.empty}>{err}</div>;
  if (!data) return <div className={styles.empty}>Loading…</div>;
  if (data.length === 0) return <div className={styles.empty}>No open orders</div>;

  return (
    <div className={styles.body}>
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
                  disabled={cancellingId === order.orderId}
                >
                  {cancellingId === order.orderId ? "…" : "Cancel"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SpotBottomTabs({ market }: { market: SpotMarket }) {
  const [activeTab, setActiveTab] = useState<"assets" | "open-orders">("assets");

  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Spot account workspace">
        <button
          type="button"
          id="spot-assets-tab"
          role="tab"
          aria-selected={activeTab === "assets"}
          aria-controls="spot-bottom-panel"
          className={`${styles.tab} ${activeTab === "assets" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("assets")}
        >
          Assets
        </button>
        <button
          type="button"
          id="spot-open-orders-tab"
          role="tab"
          aria-selected={activeTab === "open-orders"}
          aria-controls="spot-bottom-panel"
          className={`${styles.tab} ${activeTab === "open-orders" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("open-orders")}
        >
          Open Orders
        </button>
        <button type="button" role="tab" aria-selected="false" aria-disabled="true" className={styles.tab} disabled>
          Order History
        </button>
        <button type="button" role="tab" aria-selected="false" aria-disabled="true" className={styles.tab} disabled>
          Trade History
        </button>
      </div>
      <div
        id="spot-bottom-panel"
        role="tabpanel"
        aria-labelledby={activeTab === "assets" ? "spot-assets-tab" : "spot-open-orders-tab"}
        className={styles.tabPanel}
      >
        {activeTab === "assets" ? <SpotAccountsPanel market={market} /> : <OpenOrders market={market} />}
      </div>
    </div>
  );
}

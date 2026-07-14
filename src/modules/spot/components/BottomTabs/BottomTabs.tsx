import { useState } from "react";

import { spotApi, type SpotOrder } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import styles from "./BottomTabs.module.scss";

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

function OpenOrders({ symbol }: { symbol: string }) {
  const { data, err } = usePolling<SpotOrder[]>(() => spotApi.openOrders(symbol), 2000, [symbol]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const cancel = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      await spotApi.cancelOrder(symbol, orderId);
    } finally {
      setCancellingId(null);
    }
  };

  if (err) return <div className={styles.empty}>{err}</div>;
  if (!data || data.length === 0) return <div className={styles.empty}>No open orders</div>;

  return (
    <div className={styles.body}>
      <div className={styles.tableHeader}>
        <span>Time</span>
        <span>Side</span>
        <span className={styles.right}>Price</span>
        <span className={styles.right}>Qty</span>
        <span className={styles.right}>Filled</span>
        <span className={styles.right}>Status</span>
        <span className={styles.right}>Action</span>
      </div>
      {data.map((o) => (
        <div key={o.orderId} className={styles.row}>
          <span style={{ color: "var(--ltr-text-muted)" }}>{fmtTime(o.time)}</span>
          <span className={o.side === "BUY" ? styles.buy : styles.sell}>{o.side}</span>
          <span className={styles.right}>{o.price}</span>
          <span className={styles.right}>{o.origQty}</span>
          <span className={styles.right}>{o.executedQty}</span>
          <span className={styles.right} style={{ color: "var(--ltr-text-secondary)" }}>
            {o.status}
          </span>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => cancel(o.orderId)}
            disabled={cancellingId === o.orderId}
          >
            {cancellingId === o.orderId ? "…" : "Cancel"}
          </button>
        </div>
      ))}
    </div>
  );
}

export function SpotBottomTabs({ symbol }: { symbol: string }) {
  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${styles.tabActive}`}>
          Open Orders
        </button>
        {/* Placeholder tabs — order/trade history are follow-up work */}
        <button type="button" className={styles.tab} disabled>
          Order History
        </button>
        <button type="button" className={styles.tab} disabled>
          Trade History
        </button>
      </div>
      <OpenOrders symbol={symbol} />
    </div>
  );
}

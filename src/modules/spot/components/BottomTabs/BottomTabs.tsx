import { useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import { spotApi, type SpotOrder } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
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

function fmtNum(v: string, maxDigits = 8): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return v;
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDigits });
}

function OpenOrders({ symbol }: { symbol: string }) {
  const ready = useSpotAuthReady();
  const { data, err } = usePolling<SpotOrder[]>(
    () => spotApi.openOrders(symbol),
    2000,
    [symbol],
    { enabled: ready },
  );
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  if (!ready)
    return (
      <div className={styles.empty}>
        <button type="button" className={styles.connectCta} onClick={openCantonConnect}>
          Connect wallet
        </button>
        <span style={{ marginLeft: 8, color: "var(--ltr-text-muted)" }}>to view your open orders</span>
      </div>
    );

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
          <span className={styles.right}>{fmtNum(o.price, 2)}</span>
          <span className={styles.right}>{fmtNum(o.origQty, 8)}</span>
          <span className={styles.right}>{fmtNum(o.executedQty, 8)}</span>
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

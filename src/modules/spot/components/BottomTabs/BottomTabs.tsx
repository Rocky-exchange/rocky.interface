import { Trans } from "@lingui/macro";
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
          <Trans>Connect wallet</Trans>
        </button>
        <span style={{ marginLeft: 8, color: "var(--ltr-text-muted)" }}>
          <Trans>to view your open orders</Trans>
        </span>
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
  if (!data || data.length === 0) return (
    <div className={styles.empty}>
      <Trans>No open orders</Trans>
    </div>
  );

  return (
    <div className={styles.body}>
      <div className={styles.tableHeader}>
        <span><Trans>Time</Trans></span>
        <span><Trans>Side</Trans></span>
        <span className={styles.right}><Trans>Price</Trans></span>
        <span className={styles.right}><Trans>Qty</Trans></span>
        <span className={styles.right}><Trans>Filled</Trans></span>
        <span className={styles.right}><Trans>Status</Trans></span>
        <span className={styles.right}><Trans>Action</Trans></span>
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
            {cancellingId === o.orderId ? "…" : <Trans>Cancel</Trans>}
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
          <Trans>Open Orders</Trans>
        </button>
        {/* Placeholder tabs — order/trade history are follow-up work */}
        <button type="button" className={styles.tab} disabled>
          <Trans>Order History</Trans>
        </button>
        <button type="button" className={styles.tab} disabled>
          <Trans>Trade History</Trans>
        </button>
      </div>
      <OpenOrders symbol={symbol} />
    </div>
  );
}

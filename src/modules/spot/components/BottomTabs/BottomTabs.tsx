import { useState } from "react";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";

import styles from "./BottomTabs.module.scss";
import { spotApi, type SpotOrder } from "../../api/spotClient";
import { useSpotAuthReady } from "../../api/spotSession";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";

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
          <span style={MUTED_TEXT_STYLE}>{fmtTime(o.time)}</span>
          <span className={o.side === "BUY" ? styles.buy : styles.sell}>{o.side}</span>
          <span className={styles.right}>{fmtNum(o.price, 2)}</span>
          <span className={styles.right}>{fmtNum(o.origQty, 8)}</span>
          <span className={styles.right}>{fmtNum(o.executedQty, 8)}</span>
          <span className={styles.right} style={SECONDARY_TEXT_STYLE}>
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

export function SpotBottomTabs({ market }: { market: SpotMarket }) {
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
      <OpenOrders market={market} />
    </div>
  );
}

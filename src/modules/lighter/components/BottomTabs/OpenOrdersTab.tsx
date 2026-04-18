import { useCallback, useMemo, useState } from "react";

import { useCancelOrderHandler } from "@/modules/cex/lib/api";
import { useOrdersInfoData } from "context/SyntheticsStateContext/hooks/globalsHooks";
import { getByKey } from "lib/objects";

import type { BottomTabFilterMode, OpenOrdersMarketFilter, OpenOrdersTypeFilter } from "./BottomTabs";
import { ModifyOrderModal } from "./ModifyOrderModal";
import styles from "./OpenOrdersTab.module.scss";
import { useOpenOrdersAdapter, type LighterOpenOrder } from "../../adapters/useOpenOrdersAdapter";

type OpenOrderRow = {
  market: string;
  side: "long" | "short" | "-";
  date: string;
  type: string;
  amount: string;
  filled: string;
  price: string;
  markPrice: string;
  reduceOnly: string;
  margin: string;
  triggerConditions: string;
  expiresIn: string;
  tpSl: string;
};

function formatNumber(value: number | null | undefined, maximumFractionDigits = 4) {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatPrice(value: number | null | undefined, maximumFractionDigits = 6) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "-";
  return Number(value).toFixed(Math.min(maximumFractionDigits, 6));
}

function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function formatDate(timestamp: number) {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  const second = `${date.getSeconds()}`.padStart(2, "0");
  return `${month}/${day}/${year} ${hour}:${minute}:${second}`;
}

function EditOrderIcon() {
  return (
    <span className={styles.actionIcon}>
      <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
        <rect width="256" height="256" fill="none" />
        <path
          d="M96,216H48a8,8,0,0,1-8-8V163.31a8,8,0,0,1,2.34-5.65L165.66,34.34a8,8,0,0,1,11.31,0L221.66,79a8,8,0,0,1,0,11.31Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="16"
        />
        <line
          x1="216"
          y1="216"
          x2="96"
          y2="216"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="16"
        />
        <line
          x1="136"
          y1="64"
          x2="192"
          y2="120"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="16"
        />
      </svg>
    </span>
  );
}

function CancelOrderIcon() {
  return (
    <span className={styles.actionIcon}>
      <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
        <rect width="256" height="256" fill="none" />
        <line
          x1="200"
          y1="56"
          x2="56"
          y2="200"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="16"
        />
        <line
          x1="200"
          y1="200"
          x2="56"
          y2="56"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="16"
        />
      </svg>
    </span>
  );
}

function LoadingSpinnerIcon() {
  return (
    <span className={styles.actionIcon}>
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={styles.loadingSpinner}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    </span>
  );
}

function toRow(order: LighterOpenOrder): OpenOrderRow {
  return {
    market: order.market,
    side: order.side,
    date: formatDate(order.createdAt),
    type: order.type === "limit" ? "Limit" : "Market",
    amount: formatNumber(order.amount, 4),
    filled: order.filled == null || order.filled === 0 ? "-" : formatNumber(order.filled, 4),
    price: formatPrice(order.price),
    markPrice: formatPrice(order.markPrice),
    reduceOnly: order.reduceOnly == null ? "-" : order.reduceOnly ? "Yes" : "No",
    margin: formatUsd(order.margin),
    triggerConditions: order.triggerConditions ?? "-",
    expiresIn: order.expiresIn ?? "-",
    tpSl: "- / -",
  };
}

function matchesTypeFilter(order: LighterOpenOrder, filter: OpenOrdersTypeFilter) {
  if (filter === "All") return true;
  if (filter === "Limit") return order.type === "limit" && !order.triggerConditions;
  if (filter === "S/L Market") return order.type === "market" && Boolean(order.triggerConditions) && order.side === "short";
  if (filter === "S/L Limit") return order.type === "limit" && Boolean(order.triggerConditions) && order.side === "short";
  if (filter === "T/P Market") return order.type === "market" && Boolean(order.triggerConditions) && order.side === "long";
  if (filter === "T/P Limit") return order.type === "limit" && Boolean(order.triggerConditions) && order.side === "long";
  return false;
}

export function OpenOrdersTab({
  mode = "all",
  marketFilter = "All",
  typeFilter = "All",
}: {
  mode?: BottomTabFilterMode;
  marketFilter?: OpenOrdersMarketFilter;
  typeFilter?: OpenOrdersTypeFilter;
}) {
  const [editingOrderKey, setEditingOrderKey] = useState<string>();
  const [closingOrderKey, setClosingOrderKey] = useState<string>();
  const orders = useOpenOrdersAdapter();
  const ordersInfoData = useOrdersInfoData();
  const { cancelSingleOrder } = useCancelOrderHandler();
  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        if (mode === "all") return true;
        if (mode === "asks") return order.side === "short";
        return order.side === "long";
      })
      .filter((order) => (marketFilter === "All" ? true : order.market === marketFilter))
      .filter((order) => matchesTypeFilter(order, typeFilter));
  }, [marketFilter, mode, orders, typeFilter]);

  const handleCancelOrder = useCallback(
    async (order: LighterOpenOrder) => {
      if (!order.orderKey || closingOrderKey) return;

      const orderInfo = getByKey(ordersInfoData, order.orderKey);
      if (!orderInfo) return;

      try {
        await cancelSingleOrder(
          orderInfo,
          () => setClosingOrderKey(order.orderKey),
          () => setClosingOrderKey(undefined)
        );
      } catch (error) {
        void error;
        setClosingOrderKey(undefined);
      }
    },
    [cancelSingleOrder, closingOrderKey, ordersInfoData]
  );

  return (
    <div className={styles.root}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th>
              <span className={styles.sortHeader}>
                <span>Date</span>
                <span className={styles.sortCaret}>⌄</span>
              </span>
            </th>
            <th>Type</th>
            <th>Amount</th>
            <th>Filled</th>
            <th>Price</th>
            <th>Mark Price</th>
            <th>Reduce Only</th>
            <th>Margin</th>
            <th>Trigger Conditions</th>
            <th>Expires in</th>
            <th>TP / SL</th>
            <th className={styles.cancelAllHeader}>Cancel All</th>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map((order, index) => {
            const row = toRow(order);
            const isClosing = closingOrderKey === order.orderKey;
            return (
              <tr key={order.orderKey ?? order.id ?? `${row.market}-${index}`}>
                <td>
                  <span
                    className={
                      row.side === "short"
                        ? `${styles.marketCell} ${styles.marketCellShort}`
                        : `${styles.marketCell} ${styles.marketCellLong}`
                    }
                  >
                    <span className={styles.marketStripe} />
                    <span className={styles.marketContent}>
                      <span className={styles.market}>{row.market}</span>
                    </span>
                  </span>
                </td>
                <td
                  className={row.side === "long" ? styles.sideLong : styles.sideShort}
                >
                  {row.side === "long" ? "Long" : "Short"}
                </td>
                <td className={`${styles.mono} ${row.date === "-" ? styles.placeholder : ""}`}>{row.date}</td>
                <td className={row.type === "-" ? styles.placeholder : ""}>{row.type}</td>
                <td className={`${styles.mono} ${row.amount === "-" ? styles.placeholder : ""}`}>{row.amount}</td>
                <td className={`${styles.mono} ${row.filled === "-" ? styles.placeholder : ""}`}>{row.filled}</td>
                <td className={`${styles.mono} ${row.price === "-" ? styles.placeholder : ""}`}>{row.price}</td>
                <td className={`${styles.mono} ${row.markPrice === "-" ? styles.placeholder : ""}`}>{row.markPrice}</td>
                <td className={row.reduceOnly === "-" ? styles.placeholder : ""}>{row.reduceOnly}</td>
                <td className={`${styles.mono} ${row.margin === "-" ? styles.placeholder : ""}`}>{row.margin}</td>
                <td className={row.triggerConditions === "-" ? styles.placeholder : ""}>{row.triggerConditions}</td>
                <td className={row.expiresIn === "-" ? styles.placeholder : ""}>{row.expiresIn}</td>
                <td className={row.tpSl === "-" ? styles.placeholder : ""}>{row.tpSl}</td>
                <td className={styles.cancelActions}>
                  <button
                    type="button"
                    className={styles.editAction}
                    disabled={!order.orderKey || isClosing}
                    onClick={() => {
                      if (!order.orderKey) return;
                      setEditingOrderKey(order.orderKey);
                    }}
                  >
                    <EditOrderIcon />
                  </button>
                  <button
                    type="button"
                    className={styles.cancelAction}
                    disabled={!order.orderKey || isClosing}
                    onClick={() => void handleCancelOrder(order)}
                  >
                    {isClosing ? <LoadingSpinnerIcon /> : <CancelOrderIcon />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ModifyOrderModal orderKey={editingOrderKey} onClose={() => setEditingOrderKey(undefined)} />
    </div>
  );
}

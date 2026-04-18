import { useMemo } from "react";

import type { BottomTabFilterMode, OpenOrdersMarketFilter } from "./BottomTabs";
import styles from "./OrderHistoryTab.module.scss";
import { type LighterOrderHistoryRow, useOrderHistoryAdapter } from "../../adapters/useOrderHistoryAdapter";

type Row = {
  market: string;
  side: "long" | "short" | "--";
  date: string;
  type: string;
  amount: string;
  filled: string;
  price: string;
  average: string;
  reduceOnly: string;
  status: string;
};

function formatNumber(value: number | null | undefined, maximumFractionDigits = 4) {
  if (value == null || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatPrice(value: number | null | undefined, maximumFractionDigits = 6) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "--";
  return Number(value).toFixed(Math.min(maximumFractionDigits, 6));
}

function formatDate(timestamp: number) {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "--";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  const second = `${date.getSeconds()}`.padStart(2, "0");
  return `${month}/${day}/${year} ${hour}:${minute}:${second}`;
}

function toRow(order: LighterOrderHistoryRow): Row {
  return {
    market: order.market,
    side: order.side,
    date: formatDate(order.date),
    type: order.type,
    amount: formatNumber(order.amount, 4),
    filled: formatNumber(order.filled, 4),
    price: formatPrice(order.price),
    average: formatPrice(order.average),
    reduceOnly: order.reduceOnly == null ? "--" : order.reduceOnly ? "Yes" : "No",
    status:
      order.status === "filled"
        ? "Filled"
        : order.status === "cancelled"
          ? "Cancelled"
          : order.status === "rejected"
            ? "Rejected"
            : order.status === "expired"
              ? "Expired"
              : "--",
  };
}

export function OrderHistoryTab({
  mode = "all",
  marketFilter = "All",
}: {
  mode?: BottomTabFilterMode;
  marketFilter?: OpenOrdersMarketFilter;
}) {
  const orders = useOrderHistoryAdapter();
  const rows = useMemo(() => {
    const filteredOrders = orders.filter((order) => {
      if (marketFilter !== "All" && order.market !== marketFilter) return false;
      if (mode === "all") return true;
      if (mode === "asks") return order.side === "short";
      return order.side === "long";
    });
    return filteredOrders.map(toRow);
  }, [marketFilter, mode, orders]);

  return (
    <div className={styles.root}>
      <table className={styles.table}>
        <colgroup>
          <col className={styles.colMarket} />
          <col className={styles.colSide} />
          <col className={styles.colDate} />
          <col className={styles.colType} />
          <col className={styles.colAmount} />
          <col className={styles.colFilled} />
          <col className={styles.colPrice} />
          <col className={styles.colAverage} />
          <col className={styles.colReduceOnly} />
          <col className={styles.colStatus} />
        </colgroup>
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
            <th>Average</th>
            <th>Reduce Only</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            return (
              <tr key={`${row.market}-${index}`}>
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
                <td className={`${styles.mono} ${row.date === "--" ? styles.placeholder : ""}`}>{row.date}</td>
                <td className={row.type === "--" ? styles.placeholder : ""}>{row.type}</td>
                <td className={`${styles.mono} ${row.amount === "--" ? styles.placeholder : ""}`}>{row.amount}</td>
                <td className={`${styles.mono} ${row.filled === "--" ? styles.placeholder : ""}`}>{row.filled}</td>
                <td className={`${styles.mono} ${row.price === "--" ? styles.placeholder : ""}`}>{row.price}</td>
                <td className={`${styles.mono} ${row.average === "--" ? styles.placeholder : ""}`}>{row.average}</td>
                <td className={row.reduceOnly === "--" ? styles.placeholder : ""}>{row.reduceOnly}</td>
                <td className={`${styles.status} ${row.status === "--" ? styles.placeholder : ""}`}>{row.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

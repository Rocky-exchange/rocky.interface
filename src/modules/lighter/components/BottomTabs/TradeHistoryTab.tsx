import { useMemo } from "react";

import type { BottomTabFilterMode } from "./BottomTabs";
import styles from "./TradeHistoryTab.module.scss";
import { type LighterTradeHistoryRow, useTradeHistoryAdapter } from "../../adapters/useTradeHistoryAdapter";

type Row = {
  market: string;
  side: string;
  date: string;
  tradeValue: string;
  size: string;
  price: string;
  closedPnl: string;
  fee: string;
  role: string;
  type: string;
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

function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
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

function toRow(trade: LighterTradeHistoryRow): Row {
  return {
    market: trade.market,
    side: trade.side,
    date: formatDate(trade.date),
    tradeValue: formatUsd(trade.tradeValue),
    size: formatNumber(trade.size, 4),
    price: formatPrice(trade.price),
    closedPnl: formatUsd(trade.closedPnl),
    fee: formatUsd(trade.fee),
    role: trade.role || "--",
    type: trade.type || "--",
  };
}

export function TradeHistoryTab({ mode = "all" }: { mode?: BottomTabFilterMode }) {
  const trades = useTradeHistoryAdapter();
  const rows = useMemo(() => {
    const filteredTrades = trades.filter((trade) => {
      if (mode === "all") return true;
      if (mode === "asks") return trade.side.includes("Short");
      return trade.side.includes("Long");
    });
    return filteredTrades.map(toRow);
  }, [mode, trades]);

  return (
    <div className={styles.root}>
      <table className={styles.table}>
        <colgroup>
          <col className={styles.colMarket} />
          <col className={styles.colSide} />
          <col className={styles.colDate} />
          <col className={styles.colTradeValue} />
          <col className={styles.colSize} />
          <col className={styles.colPrice} />
          <col className={styles.colClosedPnl} />
          <col className={styles.colFee} />
          <col className={styles.colRole} />
          <col className={styles.colType} />
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
            <th>Trade Value</th>
            <th>Size</th>
            <th>Price</th>
            <th>Closed PnL</th>
            <th>Fee</th>
            <th>Role</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            return (
              <tr key={`${row.market}-${index}`}>
                <td>
                  <span
                    className={
                      row.side.includes("Short")
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
                  className={row.side.includes("Long") ? styles.sideLong : styles.sideShort}
                >
                  {row.side}
                </td>
                <td className={`${styles.mono} ${row.date === "--" ? styles.placeholder : ""}`}>{row.date}</td>
                <td className={`${styles.mono} ${row.tradeValue === "--" ? styles.placeholder : ""}`}>{row.tradeValue}</td>
                <td className={`${styles.mono} ${row.size === "--" ? styles.placeholder : ""}`}>{row.size}</td>
                <td className={`${styles.mono} ${row.price === "--" ? styles.placeholder : ""}`}>{row.price}</td>
                <td className={`${styles.mono} ${row.closedPnl === "--" ? styles.placeholder : ""}`}>{row.closedPnl}</td>
                <td className={`${styles.mono} ${row.fee === "--" ? styles.placeholder : ""}`}>{row.fee}</td>
                <td className={row.role === "--" ? styles.placeholder : ""}>{row.role}</td>
                <td className={row.type === "--" ? styles.placeholder : ""}>{row.type}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

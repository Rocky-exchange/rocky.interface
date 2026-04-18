import { useCallback, useMemo, useState } from "react";

import { useClosePositionHandler } from "@/modules/cex/lib/api/useClosePositionHandler";
import type { BottomTabFilterMode } from "./BottomTabs";
import styles from "./PositionsTab.module.scss";
import { TpSlPositionModal } from "./TpSlPositionModal";
import { usePositionsAdapter, type LighterPosition } from "../../adapters/usePositionsAdapter";

type PositionRow = {
  market: string;
  leverage: string;
  side: "long" | "short" | null;
  size: string;
  positionValue: string;
  entryPrice: string;
  markPrice: string;
  liqPrice: string;
  unrealizedPnl: string;
  unrealizedPnlPct: string;
  unrealizedPnlValue: number | null;
  margin: string;
  funding: string;
  tpSl: string;
};

function ClosePositionIcon() {
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

function EditTpSlIcon() {
  return (
    <span className={styles.editIcon}>
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

function formatNumber(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatUsd(value: number | null | undefined, maximumFractionDigits = 2) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value)}`;
}

function formatPrice(value: number | null | undefined, maximumFractionDigits = 4) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "--";
  return formatNumber(value, maximumFractionDigits);
}

function formatSignedUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "--";
  const prefix = value >= 0 ? "$" : "-$";
  return `${prefix}${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))}`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `(${value >= 0 ? "+" : ""}${value.toFixed(2)}%)`;
}

function toRow(position: LighterPosition): PositionRow {
  return {
    market: position.market,
    leverage: position.leverage && position.leverage !== "0x" ? position.leverage : "--",
    side: position.side,
    size: position.sizeTokenAmount > 0 ? formatNumber(position.sizeTokenAmount, 4) : "--",
    positionValue: position.positionValue > 0 ? formatUsd(position.positionValue) : "--",
    entryPrice: formatPrice(position.entryPrice),
    markPrice: formatPrice(position.markPrice),
    liqPrice: formatPrice(position.liqPrice),
    unrealizedPnl: formatSignedUsd(position.unrealizedPnl),
    unrealizedPnlPct: formatPercent(position.unrealizedPnlPct),
    unrealizedPnlValue: Number.isFinite(position.unrealizedPnl) ? position.unrealizedPnl : null,
    margin: position.margin > 0 ? formatUsd(position.margin) : "--",
    funding: position.funding == null ? "--" : formatUsd(position.funding),
    tpSl:
      position.takeProfit != null || position.stopLoss != null
        ? `${formatPrice(position.takeProfit)} / ${formatPrice(position.stopLoss)}`
        : "-- / --",
  };
}

export function PositionsTab({ mode = "all" }: { mode?: BottomTabFilterMode }) {
  const positions = usePositionsAdapter();
  const [editingTpSlPositionKey, setEditingTpSlPositionKey] = useState<string | undefined>();
  const [closingId, setClosingId] = useState<string | null>(null);
  const { closePositionViaApi, isReady } = useClosePositionHandler();

  const handleClose = useCallback(
    async (positionId: string) => {
      if (!positionId || closingId) return;
      setClosingId(positionId);
      try {
        await closePositionViaApi(positionId);
      } catch {
        // helperToast already surfaced the error from useClosePositionHandler
      } finally {
        setClosingId(null);
      }
    },
    [closePositionViaApi, closingId]
  );

  const filteredPositions = useMemo(() => {
    return positions.filter((position) => {
      if (mode === "all") return true;
      if (mode === "asks") return position.side === "short";
      return position.side === "long";
    });
  }, [mode, positions]);

  const rows = useMemo(() => filteredPositions.map(toRow), [filteredPositions]);

  const editingPosition = useMemo(() => {
    if (!editingTpSlPositionKey) return undefined;
    return filteredPositions.find((position, index) => `${position.market}-${index}` === editingTpSlPositionKey);
  }, [editingTpSlPositionKey, filteredPositions]);

  return (
    <div className={styles.root}>
      <table className={styles.table}>
        <colgroup>
          <col className={styles.colMarket} />
          <col className={styles.colSize} />
          <col className={styles.colPositionValue} />
          <col className={styles.colEntry} />
          <col className={styles.colMark} />
          <col className={styles.colLiq} />
          <col className={styles.colPnl} />
          <col className={styles.colMargin} />
          <col className={styles.colFunding} />
          <col className={styles.colTpSl} />
          <col className={styles.colCloseAll} />
        </colgroup>
        <thead>
          <tr>
            <th>Market</th>
            <th>Size</th>
            <th>Position Value</th>
            <th>Entry Price</th>
            <th>Mark Price</th>
            <th>Liq. Price</th>
            <th>Unrealized PnL</th>
            <th>Margin</th>
            <th>Funding</th>
            <th>TP / SL</th>
            <th>Close All</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowKey = `${row.market}-${index}`;
            const positionId = filteredPositions[index]?.positionId ?? "";
            const isClosingThis = closingId === positionId;
            const pnlTone =
              row.unrealizedPnlValue == null ? styles.placeholder : row.unrealizedPnlValue >= 0 ? styles.up : styles.down;
            return (
              <tr key={rowKey}>
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
                      <span className={styles.marketSymbol}>{row.market}</span>
                      <span className={styles.leverageBadge}>{row.leverage}</span>
                    </span>
                  </span>
                </td>
                <td className={`${styles.mono} ${styles.numeric} ${row.size === "--" ? styles.placeholder : ""}`}>{row.size}</td>
                <td className={`${styles.mono} ${styles.numeric} ${row.positionValue === "--" ? styles.placeholder : ""}`}>{row.positionValue}</td>
                <td className={`${styles.mono} ${styles.numeric} ${row.entryPrice === "--" ? styles.placeholder : ""}`}>{row.entryPrice}</td>
                <td className={`${styles.mono} ${styles.numeric} ${row.markPrice === "--" ? styles.placeholder : ""}`}>{row.markPrice}</td>
                <td className={`${styles.mono} ${styles.numeric} ${row.liqPrice === "--" ? styles.placeholder : ""}`}>{row.liqPrice}</td>
                <td>
                  <span className={`${styles.pnlCell} ${pnlTone}`}>
                    <span>{row.unrealizedPnl}</span>
                    {row.unrealizedPnlPct ? <span className={styles.pnlPct}>{row.unrealizedPnlPct}</span> : null}
                  </span>
                </td>
                <td className={`${styles.mono} ${styles.numeric} ${row.margin === "--" ? styles.placeholder : ""}`}>{row.margin}</td>
                <td className={`${styles.mono} ${styles.numeric} ${row.funding === "--" ? styles.placeholder : ""}`}>{row.funding}</td>
                <td>
                  <span className={styles.tpSl}>
                    <span className={row.tpSl === "-- / --" ? styles.placeholder : ""}>{row.tpSl}</span>
                    <button
                      type="button"
                      className={styles.editBadge}
                      aria-label={`Edit take profit / stop loss for ${row.market}`}
                      onClick={() => setEditingTpSlPositionKey(rowKey)}
                    >
                      <EditTpSlIcon />
                    </button>
                  </span>
                </td>
                <td className={styles.closeActionCell}>
                  <button
                    type="button"
                    className={styles.closeActionButton}
                    aria-label={`Close ${row.market} position`}
                    onClick={() => handleClose(positionId)}
                    disabled={!isReady || !positionId || isClosingThis}
                    style={isClosingThis ? { opacity: 0.5, cursor: "default" } : undefined}
                  >
                    <ClosePositionIcon />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <TpSlPositionModal position={editingPosition} onClose={() => setEditingTpSlPositionKey(undefined)} />
    </div>
  );
}

import { Trans, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { useCallback, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import { useClosePositionHandler } from "@/modules/lighter/api";
import type { ClosePositionRequest } from "@/modules/lighter/api/types";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";

import type { BottomTabFilterMode } from "./BottomTabs";
import styles from "./PositionsTab.module.scss";
import { TpSlPositionModal } from "./TpSlPositionModal";
import { usePositionsAdapter, type LighterPosition } from "../../adapters/usePositionsAdapter";

type PositionRow = {
  /** 持仓 ID;完整持仓详情(symbol/side/qty/markPrice)通过它从 usePositionsAdapter() 的原始列表中查找,用于构造平仓的反向订单。 */
  positionId: string;
  /** 数字形式的 base-asset 数量(如 0.5 BTC),用于显示 */
  sizeTokenAmount: number;
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

function CloseSpinnerIcon() {
  return (
    <span className={styles.actionIcon}>
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={styles.loadingSpinner}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
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
    positionId: position.positionId,
    sizeTokenAmount: Number.isFinite(position.sizeTokenAmount) ? position.sizeTokenAmount : 0,
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
  const { i18n } = useLingui();
  const positions = usePositionsAdapter();
  const { chainId } = useChainId();
  const cantonSession = useCantonSession();
  const accountKey = useMemo(
    () => (cantonSession.connected ? cantonSession.party || cantonSession.username || "canton-session" : undefined),
    [cantonSession.connected, cantonSession.party, cantonSession.username]
  );
  const { mutate } = useSWRConfig();
  const { closePositionViaApi, isReady: isCloseReady } = useClosePositionHandler();
  const [editingTpSlPositionKey, setEditingTpSlPositionKey] = useState<string | undefined>();
  const [closingPositionId, setClosingPositionId] = useState<string | undefined>();

  const handleClosePosition = useCallback(
    async (positionId: string) => {
      if (!positionId || closingPositionId) return;
      if (!isCloseReady) return;

      // Closing is a real opposing order now (rocky-backend has no
      // close-by-id endpoint), so we need the position's symbol/side/qty/
      // markPrice, not just its USD value -- look up the full record.
      const position = positions.find((p) => p.positionId === positionId);
      if (!position || !position.side || !(position.sizeTokenAmount > 0) || !(position.markPrice > 0)) {
        helperToast.error(t`Unable to close position: missing symbol, side, size, or mark price`);
        return;
      }

      setClosingPositionId(positionId);
      try {
        const closeRequest: ClosePositionRequest = {
          symbol: position.symbol,
          side: position.side,
          qty: String(position.sizeTokenAmount),
          markPrice: String(position.markPrice),
        };
        await closePositionViaApi(positionId, closeRequest);
        // 手动触发持仓/订单 SWR 重算,不用等 2s 轮询;与 ModifyOrderModal 内的 mutate 保持一致。
        await Promise.all([
          mutate(["primit-positions", chainId, accountKey], undefined, { revalidate: true }),
          mutate(["primit-orders", chainId, accountKey], undefined, { revalidate: true }),
        ]);
      } catch (_error) {
        // closePositionViaApi 内部已经 toast,无需在这里重复处理
      } finally {
        setClosingPositionId(undefined);
      }
    },
    [accountKey, chainId, closePositionViaApi, closingPositionId, isCloseReady, mutate, positions]
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
            <th>
              <Trans>Market</Trans>
            </th>
            <th>
              <Trans>Size</Trans>
            </th>
            <th>
              <Trans>Position Value</Trans>
            </th>
            <th>
              <Trans>Entry Price</Trans>
            </th>
            <th>
              <Trans>Mark Price</Trans>
            </th>
            <th>
              <Trans>Liq. Price</Trans>
            </th>
            <th>
              <Trans>Unrealized PnL</Trans>
            </th>
            <th>
              <Trans>Margin</Trans>
            </th>
            <th>
              <Trans>Funding</Trans>
            </th>
            <th>
              <Trans>TP / SL</Trans>
            </th>
            <th>
              <Trans>Close All</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowKey = `${row.market}-${index}`;
            const pnlTone =
              row.unrealizedPnlValue == null
                ? styles.placeholder
                : row.unrealizedPnlValue >= 0
                  ? styles.up
                  : styles.down;
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
                <td className={`${styles.mono} ${styles.numeric} ${row.size === "--" ? styles.placeholder : ""}`}>
                  {row.size}
                </td>
                <td
                  className={`${styles.mono} ${styles.numeric} ${row.positionValue === "--" ? styles.placeholder : ""}`}
                >
                  {row.positionValue}
                </td>
                <td className={`${styles.mono} ${styles.numeric} ${row.entryPrice === "--" ? styles.placeholder : ""}`}>
                  {row.entryPrice}
                </td>
                <td className={`${styles.mono} ${styles.numeric} ${row.markPrice === "--" ? styles.placeholder : ""}`}>
                  {row.markPrice}
                </td>
                <td className={`${styles.mono} ${styles.numeric} ${row.liqPrice === "--" ? styles.placeholder : ""}`}>
                  {row.liqPrice}
                </td>
                <td>
                  <span className={`${styles.pnlCell} ${pnlTone}`}>
                    <span>{row.unrealizedPnl}</span>
                    {row.unrealizedPnlPct ? <span className={styles.pnlPct}>{row.unrealizedPnlPct}</span> : null}
                  </span>
                </td>
                <td className={`${styles.mono} ${styles.numeric} ${row.margin === "--" ? styles.placeholder : ""}`}>
                  {row.margin}
                </td>
                <td className={`${styles.mono} ${styles.numeric} ${row.funding === "--" ? styles.placeholder : ""}`}>
                  {row.funding}
                </td>
                <td>
                  <span className={styles.tpSl}>
                    <span className={row.tpSl === "-- / --" ? styles.placeholder : ""}>{row.tpSl}</span>
                    <button
                      type="button"
                      className={styles.editBadge}
                      aria-label={i18n._(t`Edit take profit / stop loss for ${row.market}`)}
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
                    aria-label={i18n._(t`Close ${row.market} position`)}
                    disabled={!row.positionId || !isCloseReady || closingPositionId === row.positionId}
                    onClick={() => void handleClosePosition(row.positionId)}
                  >
                    {closingPositionId === row.positionId ? <CloseSpinnerIcon /> : <ClosePositionIcon />}
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

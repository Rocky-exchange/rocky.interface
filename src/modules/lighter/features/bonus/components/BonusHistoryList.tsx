import { Trans } from "@lingui/macro";

import { formatUsdcx } from "./BonusBalanceCard";
import styles from "./BonusHistoryList.module.scss";
import type { BonusApiError, BonusHistoryRow } from "../api/bonus.types";

export type BonusHistoryListProps = {
  rows: BonusHistoryRow[];
  error?: BonusApiError | Error;
  isLoading: boolean;
  hasMore: boolean;
  loadMore(): void;
};

export function BonusHistoryList({ rows, error, isLoading, hasMore, loadMore }: BonusHistoryListProps) {
  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>
            <Trans>Ledger attribution</Trans>
          </p>
          <h2 id="bonus-history-heading" className={styles.heading}>
            <Trans>Attribution history</Trans>
          </h2>
        </div>
        <span className={styles.rowCount}>{rows.length.toLocaleString()}</span>
      </div>

      {error && rows.length > 0 ? (
        <p className={styles.staleWarning} role="status">
          <Trans>Showing saved attribution history while the latest refresh is unavailable.</Trans>
        </p>
      ) : null}

      {error && rows.length === 0 ? (
        <p className={`${styles.state} ${styles.error}`} role="alert">
          {error.message}
        </p>
      ) : isLoading && rows.length === 0 ? (
        <p className={styles.state} role="status" aria-live="polite">
          <Trans>Loading attribution history…</Trans>
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.state} role="status">
          <Trans>No attribution events yet.</Trans>
        </p>
      ) : (
        <div className={styles.tableViewport} role="region" aria-labelledby="bonus-history-heading" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">
                  <Trans>Event</Trans>
                </th>
                <th scope="col">
                  <Trans>Time</Trans>
                </th>
                <th scope="col" className={styles.numeric}>
                  <Trans>Total</Trans>
                </th>
                <th scope="col" className={styles.numeric}>
                  <Trans>Principal share</Trans>
                </th>
                <th scope="col" className={styles.numeric}>
                  <Trans>Trial funds share</Trans>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className={eventTone(row.event_type)}>{eventLabel(row.event_type)}</span>
                  </td>
                  <td className={styles.time}>{formatTime(row.occurred_at)}</td>
                  <td className={styles.numeric}>{formatUsdcx(row.total_cost, 4)}</td>
                  <td className={styles.numeric}>{formatUsdcx(row.principal_share, 4)}</td>
                  <td className={styles.numeric}>{formatUsdcx(row.bonus_share, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && hasMore ? (
        <button type="button" className={styles.loadMore} onClick={loadMore} disabled={isLoading}>
          {isLoading ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
        </button>
      ) : null}
    </section>
  );
}

function eventLabel(eventType: string): React.ReactNode {
  switch (eventType) {
    case "trade_fee":
    case "trading_fee":
      return <Trans>Trading fee</Trans>;
    case "realized_pnl":
      return <Trans>Realized PnL</Trans>;
    case "trade_loss":
      return <Trans>Realized loss</Trans>;
    case "trade_pnl_gain":
      return <Trans>Realized profit</Trans>;
    case "funding":
      return <Trans>Funding</Trans>;
    case "funding_paid":
      return <Trans>Funding paid</Trans>;
    case "funding_received":
      return <Trans>Funding received</Trans>;
    case "withdrawal_recall":
      return <Trans>Withdrawal recall</Trans>;
    case "expiry_7d":
    case "expiry_recall":
      return <Trans>Expiry recall</Trans>;
    case "manual_admin":
    case "manual_recall":
      return <Trans>Manual recall</Trans>;
    case "fraud_freeze":
      return <Trans>Frozen funds recall</Trans>;
    default:
      return eventType.includes("recall") ? <Trans>Trial funds recall</Trans> : <Trans>Bonus event</Trans>;
  }
}

function eventTone(eventType: string): string {
  if (eventType === "trade_pnl_gain" || eventType === "funding_received") return styles.gain;
  if (eventType.includes("recall")) return styles.recall;
  return styles.cost;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

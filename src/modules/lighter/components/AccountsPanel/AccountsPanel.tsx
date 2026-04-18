import styles from "./AccountsPanel.module.scss";
import { useUnifiedAccountAdapter } from "../../adapters/useUnifiedAccountAdapter";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ltr-mono`}>{value}</span>
    </div>
  );
}

function formatUsd(value: number | null | undefined) {
  if (value == null) return "-";
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function formatLeverage(value: number | null | undefined) {
  if (value == null) return "-";
  return `${value.toFixed(2)}x`;
}

export function AccountsPanel() {
  const account = useUnifiedAccountAdapter();

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <div className={styles.head}>Accounts</div>
        <Row label="Perpetuals Equity" value={formatUsd(account.perpetualsEquity)} />
        <Row label="Spot Equity" value={formatUsd(account.spotEquity)} />
      </div>
      <div className={styles.section}>
        <div className={styles.head}>Perpetuals Overview</div>
        <Row label="Unrealized PnL" value={formatUsd(account.unrealizedPnl)} />
        <Row label="Cross Leverage" value={formatLeverage(account.crossLeverage)} />
        <Row label="Cross Margin Usage" value={formatUsd(account.crossMarginUsage)} />
        <Row label="Maintenance Margin" value={formatUsd(account.maintenanceMargin)} />
        <Row label="Cross Margin Ratio" value={formatPercent(account.crossMarginRatio)} />
      </div>
    </div>
  );
}

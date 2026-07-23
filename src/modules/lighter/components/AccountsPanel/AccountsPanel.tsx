import { Trans } from "@lingui/macro";
import { useEffect, useState, type ReactNode } from "react";

import { transferSpotBalance } from "@/shared/lib/canton-wallet/funds";

import styles from "./AccountsPanel.module.scss";
import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import { useUnifiedAccountAdapter } from "../../adapters/useUnifiedAccountAdapter";

function Row({ label, value }: { label: ReactNode; value: string }) {
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

function formatUsda(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function AccountsPanel() {
  const account = useUnifiedAccountAdapter();
  const { available: cachedFundingAvailable, setAvailable: setCachedFundingAvailable } = useAvailableBalanceAdapter();
  const [fundingAvailable, setFundingAvailable] = useState<number | null>(
    cachedFundingAvailable ?? account.perpetualsEquity ?? 0
  );
  const [transferAmount, setTransferAmount] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    setFundingAvailable(cachedFundingAvailable ?? account.perpetualsEquity ?? 0);
  }, [account.perpetualsEquity, cachedFundingAvailable]);

  const onTransfer = async (direction: "toSpot" | "toFunding") => {
    setTransferBusy(true);
    setTransferMessage(null);
    setTransferError(null);
    try {
      const result = await transferSpotBalance({
        asset: "USDA",
        amount: transferAmount.trim(),
        direction,
      });
      const nextFundingAvailable = Number(result.fundingAvailable);
      if (Number.isFinite(nextFundingAvailable)) {
        setFundingAvailable(nextFundingAvailable);
        setCachedFundingAvailable(nextFundingAvailable);
      }
      setTransferAmount("");
      setTransferMessage(
        direction === "toSpot" ? `Moved ${result.amount} USDA to Spot` : `Moved ${result.amount} USDA to Futures`
      );
    } catch (error: unknown) {
      setTransferError(error instanceof Error ? error.message : String(error));
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <div className={styles.root}>
      <div className={`${styles.section} ${styles.accountSummary}`}>
        <div className={styles.accountHead}>
          <Trans>Futures Account</Trans>
        </div>
        <Row label="USDA (available)" value={formatUsda(fundingAvailable)} />
        <div className={styles.transferHead}>
          <Trans>Transfer</Trans>
        </div>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Transfer amount"
          placeholder="Amount"
          value={transferAmount}
          disabled={transferBusy}
          className={styles.transferInput}
          onChange={(event) => setTransferAmount(event.target.value)}
        />
        <div className={styles.transferActions}>
          <button
            type="button"
            className={styles.transferButton}
            disabled={transferBusy || !transferAmount.trim()}
            aria-busy={transferBusy}
            onClick={() => onTransfer("toSpot")}
          >
            {transferBusy ? "…" : <Trans>Futures → Spot</Trans>}
          </button>
          <button
            type="button"
            className={styles.transferButton}
            disabled={transferBusy || !transferAmount.trim()}
            aria-busy={transferBusy}
            onClick={() => onTransfer("toFunding")}
          >
            {transferBusy ? "…" : <Trans>Spot → Futures</Trans>}
          </button>
        </div>
        {transferMessage && (
          <div className={styles.transferMessage} role="status">
            {transferMessage}
          </div>
        )}
        {transferError && (
          <div className={styles.transferError} role="alert">
            {transferError}
          </div>
        )}
      </div>
      <div className={styles.section}>
        <div className={styles.head}>
          <Trans>Perpetuals Overview</Trans>
        </div>
        <Row label={<Trans>Perpetuals Equity</Trans>} value={formatUsd(account.perpetualsEquity)} />
        <Row label={<Trans>Unrealized PnL</Trans>} value={formatUsd(account.unrealizedPnl)} />
        <Row label={<Trans>Cross Leverage</Trans>} value={formatLeverage(account.crossLeverage)} />
        <Row label={<Trans>Cross Margin Usage</Trans>} value={formatUsd(account.crossMarginUsage)} />
        <Row label={<Trans>Maintenance Margin</Trans>} value={formatUsd(account.maintenanceMargin)} />
        <Row label={<Trans>Cross Margin Ratio</Trans>} value={formatPercent(account.crossMarginRatio)} />
      </div>
    </div>
  );
}

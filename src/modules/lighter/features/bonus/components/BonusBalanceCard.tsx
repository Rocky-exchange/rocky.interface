import { Trans } from "@lingui/macro";

import styles from "./BonusBalanceCard.module.scss";
import type { BonusBalanceInfoResponse } from "../api/bonus.types";

export type BonusBalanceCardProps = {
  balance: BonusBalanceInfoResponse;
};

export function formatUsda(value?: string, maximumFractionDigits = 2): string {
  const amount = Number(value ?? "0");
  return `${Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits }) : "0"} USDA`;
}

export function BonusBalanceCard({ balance }: BonusBalanceCardProps) {
  return (
    <section className={styles.card} aria-labelledby="bonus-balance-heading">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>
            <Trans>Balance composition</Trans>
          </p>
          <h2 id="bonus-balance-heading" className={styles.heading}>
            <Trans>USDA account breakdown</Trans>
          </h2>
        </div>
        <span className={styles.asset}>USDA</span>
      </div>

      <ul className={styles.rows} aria-labelledby="bonus-balance-heading">
        <li className={styles.row}>
          <span className={styles.label}>
            <Trans>Total platform balance</Trans>
          </span>
          <strong className={styles.value}>{formatUsda(balance.total_available)}</strong>
        </li>
        <li className={styles.row}>
          <span className={styles.label}>
            <Trans>Available trial funds</Trans>
          </span>
          <strong className={styles.value}>{formatUsda(balance.bonus_free)}</strong>
        </li>
        <li className={styles.row}>
          <span className={styles.label}>
            <Trans>Trial funds in margin</Trans>
          </span>
          <strong className={styles.value}>{formatUsda(balance.bonus_locked)}</strong>
        </li>
        <li className={`${styles.row} ${styles.withdrawable}`}>
          <span className={styles.label}>
            <Trans>Effective withdrawable balance</Trans>
          </span>
          <strong className={styles.value}>{formatUsda(balance.effective_withdrawable)}</strong>
        </li>
      </ul>
    </section>
  );
}

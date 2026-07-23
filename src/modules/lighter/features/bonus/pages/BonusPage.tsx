import { Trans } from "@lingui/macro";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import "../../../styles/global.scss";
import styles from "./BonusPage.module.scss";
import { useBonusBalance, useBonusHistory, useBonusStatus } from "../api/useBonus";
import { BonusBalanceCard, formatUsda } from "../components/BonusBalanceCard";
import { BonusCountdown } from "../components/BonusCountdown";
import { BonusHistoryList } from "../components/BonusHistoryList";

export function BonusPage() {
  const { connected } = useCantonSession();
  const status = useBonusStatus();

  useLighterBody();

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav />
      </div>
      <main className={styles.main}>
        {!connected ? (
          <DisconnectedState />
        ) : status.isLoading && !status.data ? (
          <PageState heading={<Trans>Loading trial funds</Trans>} label={<Trans>Loading trial funds status…</Trans>} />
        ) : status.error && !status.data ? (
          <PageState heading={<Trans>Trial funds unavailable</Trans>} label={status.error.message} error />
        ) : !status.data?.has_bonus ? (
          <NoBonusState />
        ) : (
          <BonusDashboardContainer status={status.data} statusError={status.error} />
        )}
      </main>
    </div>
  );
}

function BonusDashboardContainer({
  status,
  statusError,
}: {
  status: NonNullable<ReturnType<typeof useBonusStatus>["data"]>;
  statusError: ReturnType<typeof useBonusStatus>["error"];
}) {
  const balance = useBonusBalance();
  const history = useBonusHistory(20);

  return (
    <BonusDashboard
      status={status}
      statusError={statusError}
      balance={balance.data}
      balanceError={balance.error}
      balanceLoading={balance.isLoading}
      history={history}
    />
  );
}

function DisconnectedState() {
  return (
    <section className={`${styles.statePanel} ${styles.disconnected}`}>
      <p className={styles.eyebrow}>
        <Trans>Rocky trial funds</Trans>
      </p>
      <h1 className={styles.stateTitle}>
        <Trans>Connect to inspect your bonus ledger</Trans>
      </h1>
      <p className={styles.stateCopy}>
        <Trans>Your Canton session keeps trial-funds balances and attribution history private.</Trans>
      </p>
      <button type="button" className={styles.primaryAction} onClick={openCantonConnect}>
        <Trans>Connect wallet</Trans>
      </button>
    </section>
  );
}

function NoBonusState() {
  return (
    <section className={`${styles.statePanel} ${styles.noBonus}`}>
      <div className={styles.emptyIndex}>00</div>
      <div>
        <p className={styles.eyebrow}>
          <Trans>Bonus status</Trans>
        </p>
        <h1 className={styles.stateTitle}>
          <Trans>No trial funds are active</Trans>
        </h1>
        <p className={styles.stateCopy}>
          <Trans>Redeem an eligible Rocky code to activate seven days of trading credit.</Trans>
        </p>
      </div>
      <Link to="/bonus/redeem" className={styles.primaryAction}>
        <Trans>Redeem trial funds</Trans>
      </Link>
    </section>
  );
}

function PageState({
  heading,
  label,
  error = false,
}: {
  heading?: React.ReactNode;
  label: React.ReactNode;
  error?: boolean;
}) {
  return (
    <section className={styles.statePanel} role={error ? "alert" : "status"} aria-live="polite">
      {heading ? <h1 className={styles.stateTitle}>{heading}</h1> : null}
      <p className={error ? styles.errorText : styles.stateCopy}>{label}</p>
    </section>
  );
}

function BonusDashboard({
  status,
  statusError,
  balance,
  balanceError,
  balanceLoading,
  history,
}: {
  status: NonNullable<ReturnType<typeof useBonusStatus>["data"]>;
  statusError: ReturnType<typeof useBonusStatus>["error"];
  balance: ReturnType<typeof useBonusBalance>["data"];
  balanceError: ReturnType<typeof useBonusBalance>["error"];
  balanceLoading: boolean;
  history: ReturnType<typeof useBonusHistory>;
}) {
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>
            <Trans>Seven-day trading credit</Trans>
          </p>
          <h1 className={styles.title}>
            <Trans>Trial funds console</Trans>
          </h1>
        </div>
        <Link to="/bonus/redeem" className={styles.secondaryAction}>
          <Trans>Redeem another code</Trans>
        </Link>
      </header>

      {statusError ? (
        <div className={`${styles.notice} ${styles.noticeWarning}`} role="status">
          <Trans>Showing saved trial-funds data while the latest refresh is unavailable.</Trans>
        </div>
      ) : null}

      {status.status === "frozen" ? (
        <div className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
          <Trans>Trial funds are frozen. New opening orders are not tradable.</Trans>
        </div>
      ) : null}
      {status.status === "expired_pending" ? (
        <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert">
          <Trans>Trial funds have expired. New opening orders are not tradable.</Trans>
        </div>
      ) : null}
      {status.status === "recalled" ? (
        <div className={styles.notice} role="status">
          <Trans>Recoverable trial funds have been recalled. Attribution history remains available.</Trans>
        </div>
      ) : null}

      <section className={styles.summaryGrid}>
        <article className={styles.lifecycleCard}>
          <div className={styles.lifecycleTopline}>
            <span className={styles.statusChip} data-status={status.status}>
              {statusLabel(status.status)}
            </span>
            <span className={styles.grantTier}>{status.grant_tier || "ROCKY"}</span>
          </div>
          <p className={styles.balanceLabel}>
            <Trans>Remaining trial funds</Trans>
          </p>
          <div className={styles.heroBalance}>{formatUsda(status.bonus_balance)}</div>
          <div className={styles.lifecycleMeta}>
            <span>
              <Trans>Initial grant</Trans>
            </span>
            <strong>{formatUsda(status.bonus_initial)}</strong>
          </div>

          <div className={styles.expiryRail}>
            <div className={styles.expiryHeading}>
              <span>
                <Trans>Expiry rail</Trans>
              </span>
              <span>{formatExpiry(status.expires_at)}</span>
            </div>
            <BonusCountdown expiresAt={status.expires_at} className={styles.countdown} />
          </div>
        </article>

        {balance ? (
          <BonusBalanceCard balance={balance} />
        ) : balanceError ? (
          <PageState label={balanceError.message} error />
        ) : (
          <PageState
            label={balanceLoading ? <Trans>Loading balance breakdown…</Trans> : <Trans>Balance unavailable.</Trans>}
          />
        )}
      </section>

      <section className={styles.rulesPanel} aria-labelledby="bonus-rules-heading">
        <div className={styles.rulesHeadingBlock}>
          <p className={styles.eyebrow}>
            <Trans>Trading controls</Trans>
          </p>
          <h2 id="bonus-rules-heading" className={styles.sectionTitle}>
            <Trans>Capital rules</Trans>
          </h2>
        </div>
        <div className={styles.ruleGrid}>
          <article className={styles.rule}>
            <span className={styles.ruleIndex}>01</span>
            <h3>
              <Trans>50 / 50 cost attribution</Trans>
            </h3>
            <p>
              <Trans>
                Trading costs use 50% trial funds and 50% principal while both balances remain positive, with the
                trial-funds share capped by remaining trial funds.
              </Trans>
            </p>
          </article>
          <article className={styles.rule}>
            <span className={styles.ruleIndex}>02</span>
            <h3>
              <Trans>Principal stays yours</Trans>
            </h3>
            <p>
              <Trans>Trading profits remain principal and trial funds are non-withdrawable.</Trans>
            </p>
          </article>
          <article className={styles.rule}>
            <span className={styles.ruleIndex}>03</span>
            <h3>
              <Trans>Position envelope</Trans>
            </h3>
            <p className={styles.leverageLine}>
              <Trans>Maximum leverage</Trans> <strong>{status.max_leverage}x</strong>
            </p>
            <p>
              <Trans>
                The 60% net-direction limit can restrict opposite opening orders; reduce-only orders remain available.
              </Trans>
            </p>
          </article>
        </div>
      </section>

      <BonusHistoryList
        rows={history.rows}
        error={history.error}
        isLoading={history.isLoading}
        hasMore={history.hasMore}
        loadMore={history.loadMore}
      />
    </>
  );
}

function statusLabel(status: string): React.ReactNode {
  switch (status) {
    case "active":
      return <Trans>Active</Trans>;
    case "frozen":
      return <Trans>Frozen</Trans>;
    case "expired_pending":
      return <Trans>Expired — positions pending</Trans>;
    case "recalled":
      return <Trans>Recalled</Trans>;
    default:
      return <Trans>Unavailable</Trans>;
  }
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function useLighterBody(): void {
  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);
}

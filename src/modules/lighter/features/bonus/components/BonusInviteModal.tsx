import { t, Trans } from "@lingui/macro";
import { ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  claimOgTrialFund,
  getOgBenefits,
  type OgBenefits,
} from "@/modules/campaigns/api/campaign.api";
import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { ModalWithPortal } from "@/shared/ui";

import ArrowRightIcon from "img/ic_arrow_right.svg?react";
import InfoIcon from "img/ic_info_circle_stroke.svg?react";
import LockIcon from "img/ic_lock.svg?react";

import { BonusCountdown } from "./BonusCountdown";
import styles from "./BonusInviteModal.module.scss";
import {
  type BonusBalanceInfoResponse,
  type BonusHistoryRow,
  type BonusRedeemResponse,
  type BonusStatusResponse,
} from "../api/bonus.types";
import { notifyBonusDataChanged, useBonusBalance, useBonusHistory, useBonusStatus } from "../api/useBonus";

type Props = {
  open: boolean;
  onClose: () => void;
};

type ModalView = "invite" | "overview" | "history";
type AttributionFilter = "all" | "tradingFee" | "funding" | "realizedLoss";
const HISTORY_PAGE_SIZE = 6;
const HISTORY_FETCH_SIZE = 20;

export function BonusInviteModal({ open, onClose }: Props) {
  const titleId = useId();
  const session = useCantonSession();
  const status = useBonusStatus();
  const openRef = useRef(open);
  const pendingRef = useRef(false);
  const attemptRef = useRef(0);
  const [viewOverride, setViewOverride] = useState<ModalView | null>(null);
  const [rulesExpanded, setRulesExpanded] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [benefits, setBenefits] = useState<OgBenefits | null>(null);
  const [benefitsLoading, setBenefitsLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<BonusRedeemResponse | null>(null);

  const view: ModalView = viewOverride ?? (status.data?.has_bonus ? "overview" : "invite");

  useEffect(() => {
    openRef.current = open;
    if (!open) {
      attemptRef.current += 1;
      pendingRef.current = false;
      setViewOverride(null);
      setRulesExpanded(true);
      setPending(false);
      setFeedback(null);
      setBenefits(null);
      setBenefitsLoading(false);
      setRedeemResult(null);
    }
  }, [open]);

  useEffect(() => {
    let active = true;
    if (!open || !session.connected || status.data?.has_bonus) return () => {
      active = false;
    };
    setBenefitsLoading(true);
    void getOgBenefits()
      .then((result) => {
        if (active) setBenefits(result);
      })
      .catch(() => {
        if (active) setFeedback("Unable to check eligibility. Please try again.");
      })
      .finally(() => {
        if (active) setBenefitsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, session.connected, status.data?.has_bonus]);

  const handleClaim = async () => {
    if (pendingRef.current) return;
    if (!session.connected) {
      setFeedback("Connect your wallet to continue.");
      return;
    }
    if (!benefits?.eligible) {
      setFeedback("暂无资格");
      return;
    }

    pendingRef.current = true;
    const attempt = ++attemptRef.current;
    setPending(true);
    setFeedback(null);

    try {
      await claimOgTrialFund();
      notifyBonusDataChanged();
      await status.mutate().catch(() => undefined);
      if (openRef.current && attemptRef.current === attempt) setViewOverride("overview");
    } catch (error) {
      if (openRef.current && attemptRef.current === attempt) {
        setFeedback(error instanceof Error ? error.message : "Claim failed. Please try again.");
      }
    } finally {
      if (attemptRef.current === attempt) {
        pendingRef.current = false;
        if (openRef.current) setPending(false);
      }
    }
  };

  return (
    <ModalWithPortal
      isVisible={open}
      setIsVisible={(isVisible) => {
        if (!isVisible) onClose();
      }}
      label={
        <span id={titleId} className={styles.srOnly}>
          {view === "history" ? (
            <Trans>Trial funds usage history</Trans>
          ) : view === "overview" ? (
            <Trans>Trial funds overview</Trans>
          ) : (
            <Trans>Claim trial funds</Trans>
          )}
        </span>
      }
      contentPadding={false}
      disableOverflowHandling
      className={styles.modalRoot}
      contentClassName={styles.modalPanel}
      primitSize="big"
    >
      {open && view === "history" ? (
        <BonusAttributionHistory
          titleId={`${titleId}-history`}
          status={status.data}
          onBack={() => setViewOverride("overview")}
        />
      ) : open && view === "overview" ? (
        <BonusOverview
          titleId={`${titleId}-overview`}
          status={status.data}
          redeemResult={redeemResult}
          onShowHistory={() => setViewOverride("history")}
        />
      ) : open ? (
        <div className={styles.layout}>
          <section className={styles.formPane} aria-labelledby={`${titleId}-visible`}>
            <div className={styles.eyebrow} aria-hidden="true">
              RX BONUS
            </div>
            <h2 id={`${titleId}-visible`} className={styles.title}>
              <Trans>Claim trial funds</Trans>
            </h2>
            <p className={styles.subtitle}>
              <Trans>Eligible OG users can actively claim 20U in trial funds.</Trans>
            </p>

            <div className={styles.divider} aria-hidden="true" />

            <div className={styles.form}>
              <div className={styles.claimAmount}>
                <span><Trans>TRIAL FUNDS</Trans></span>
                <strong>20U</strong>
                <small>
                  {benefits?.eligible ? <Trans>OG ELIGIBLE</Trans> : <Trans>暂无资格</Trans>}
                </small>
              </div>
              {!session.connected ? (
                <button type="button" className={styles.connectBonus} onClick={openCantonConnect}>
                  <Trans>Connect wallet</Trans>
                </button>
              ) : null}
              <button
                className={styles.submit}
                type="button"
                onClick={() => void handleClaim()}
                disabled={!session.connected || pending || benefitsLoading || !benefits?.eligible}
              >
                {pending ? <Trans>Claiming…</Trans> : benefits?.eligible ? <Trans>Claim 20U</Trans> : <Trans>暂无资格</Trans>}
                <ArrowRightIcon className={styles.submitIcon} aria-hidden="true" />
              </button>
              <div className={styles.feedback} aria-live="polite">
                {feedback}
              </div>
            </div>

            <button
              type="button"
              className={styles.rulesToggle}
              aria-expanded={rulesExpanded}
              onClick={() => setRulesExpanded((expanded) => !expanded)}
            >
              <Trans>View rules</Trans>
              <ArrowRightIcon
                className={`${styles.rulesArrow} ${rulesExpanded ? styles.rulesArrowOpen : ""}`}
                aria-hidden="true"
              />
            </button>

            {rulesExpanded ? (
              <div className={styles.rules} id={`${titleId}-rules`}>
                <InfoIcon className={styles.infoIcon} aria-hidden="true" />
                <ul>
                  <li>
                    <Trans>Each eligible OG user can claim trial funds once. Trial funds are valid for seven days.</Trans>
                  </li>
                  <li>
                    <Trans>Trial funds can be used as perpetual contract margin and cannot be withdrawn.</Trans>
                  </li>
                  <li>
                    <Trans>Profits generated using trial funds belong to you.</Trans>
                  </li>
                </ul>
              </div>
            ) : null}
          </section>

          <aside className={styles.artPane} aria-hidden="true">
            <img className={styles.art} src="/images/bonus/invite-code-gift.png" alt="" width="1122" height="1402" />
          </aside>
        </div>
      ) : null}
    </ModalWithPortal>
  );
}

function BonusOverview({
  titleId,
  status,
  redeemResult,
  onShowHistory,
}: {
  titleId: string;
  status?: BonusStatusResponse;
  redeemResult: BonusRedeemResponse | null;
  onShowHistory: () => void;
}) {
  const balance = useBonusBalance();
  const [detail, setDetail] = useState<"attribution" | "rules">("attribution");
  const expiresAt = status?.expires_at || redeemResult?.expires_at;
  const fallbackBonus = redeemResult?.amount;

  return (
    <section className={styles.overview} aria-labelledby={titleId} aria-busy={balance.isLoading}>
      <header className={styles.overviewHeader}>
        <div>
          <div className={styles.overviewEyebrow} aria-hidden="true">
            RX BONUS
          </div>
          <h2 id={titleId} className={styles.overviewTitle}>
            <Trans>Trial funds overview</Trans>
          </h2>
          <p className={styles.overviewSubtitle}>
            <Trans>Trial funds are trading credits provided by the platform and cannot be withdrawn.</Trans>
          </p>
        </div>
        <BonusCountdown expiresAt={expiresAt} className={styles.countdown} />
      </header>

      <div className={styles.overviewBody}>
        <div className={styles.overviewMetrics}>
          <div className={styles.totalCard}>
            <span>
              <Trans>Total available</Trans>
            </span>
            <strong>{formatUsd(balance.data?.total_available ?? fallbackBonus)}</strong>
          </div>

          <OverviewBalance
            balance={balance.data}
            error={Boolean(balance.error)}
            onRetry={() => void balance.mutate()}
          />

          <div className={styles.detailCard} aria-live="polite">
            <InfoIcon className={styles.overviewInfoIcon} aria-hidden="true" />
            <p>
              {detail === "attribution" ? (
                <Trans>Eligible trading costs use trial funds first; principal covers any remaining amount.</Trans>
              ) : (
                <Trans>Trial funds are valid for seven days and cannot be withdrawn.</Trans>
              )}
            </p>
          </div>

          <div className={styles.detailTabs}>
            <button
              type="button"
              className={detail === "attribution" ? styles.detailTabActive : undefined}
              onClick={onShowHistory}
            >
              <Trans>Attribution details</Trans>
            </button>
            <span aria-hidden="true" />
            <button
              type="button"
              className={detail === "rules" ? styles.detailTabActive : undefined}
              aria-pressed={detail === "rules"}
              onClick={() => setDetail("rules")}
            >
              <Trans>Rules</Trans>
            </button>
          </div>
        </div>

        <aside className={styles.overviewArtPane}>
          <div className={`${styles.overviewArtCard} ${styles.principalCard}`}>
            <span>
              <Trans>Principal</Trans>
            </span>
            <strong>{formatUsd(balance.data?.principal_free)}</strong>
          </div>
          <div className={`${styles.overviewArtCard} ${styles.trialCard}`}>
            <span>
              <Trans>Trial funds</Trans>
            </span>
            <strong>{formatUsd(balance.data?.bonus_free ?? fallbackBonus)}</strong>
          </div>
          <img
            className={styles.overviewArt}
            src="/images/bonus/trial-funds-overview-chest.png"
            alt=""
            width="1024"
            height="1536"
            aria-hidden="true"
          />
        </aside>
      </div>

      <div className={styles.withdrawBanner}>
        <strong>
          <Trans>Currently withdrawable: {formatUsd(balance.data?.effective_withdrawable)}</Trans>
        </strong>
        <span>
          <Trans>Withdrawing will first recall unlocked trial funds.</Trans>
        </span>
      </div>
    </section>
  );
}

function OverviewBalance({
  balance,
  error,
  onRetry,
}: {
  balance?: BonusBalanceInfoResponse;
  error: boolean;
  onRetry: () => void;
}) {
  if (!balance) {
    return (
      <div className={styles.balanceState} role={error ? "alert" : "status"}>
        <span>{error ? <Trans>Unable to load the latest balance.</Trans> : <Trans>Loading balance…</Trans>}</span>
        {error ? (
          <button type="button" onClick={onRetry}>
            <Trans>Retry</Trans>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <dl className={styles.balanceList}>
      <BalanceRow label={<Trans>Principal (withdrawable)</Trans>} value={formatUsd(balance.principal_free)} />
      <BalanceRow label={<Trans>Principal in margin</Trans>} value={formatUsd(balance.principal_locked)} locked />
      <BalanceRow label={<Trans>Trial funds (available)</Trans>} value={formatUsd(balance.bonus_free)} />
      <BalanceRow label={<Trans>Trial funds in margin</Trans>} value={formatUsd(balance.bonus_locked)} locked />
    </dl>
  );
}

function BonusAttributionHistory({
  titleId,
  status,
  onBack,
}: {
  titleId: string;
  status?: BonusStatusResponse;
  onBack: () => void;
}) {
  const history = useBonusHistory(HISTORY_FETCH_SIZE);
  const [eventType, setEventType] = useState<AttributionFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportReady, setExportReady] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRecords = useMemo(
    () =>
      history.rows.filter((record) => {
        const matchesEvent = matchesAttributionFilter(record.event_type, eventType);
        const searchText = [
          record.event_type,
          record.attribution_rule,
          record.source_trade_id,
          record.source_funding_id,
          record.id,
        ]
          .join(" ")
          .toLowerCase();
        return matchesEvent && (!normalizedSearch || searchText.includes(normalizedSearch));
      }),
    [eventType, history.rows, normalizedSearch]
  );
  const localPageCount = Math.max(1, Math.ceil(filteredRecords.length / HISTORY_PAGE_SIZE));
  const visibleRecords = filteredRecords.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);
  const hasActiveFilter = eventType !== "all" || Boolean(normalizedSearch);
  const canLoadRemotePage = !hasActiveFilter && history.hasMore;
  const canGoNext = page < localPageCount || canLoadRemotePage;
  const dateRange = formatHistoryDateRange(history.rows);
  const principalAttributed = sumHistoryValue(history.rows, "principal_share");
  const trialAttributed = status?.bonus_consumed_total ?? sumHistoryValue(history.rows, "bonus_share");

  useEffect(() => {
    setPage((current) => Math.min(current, localPageCount));
  }, [localPageCount]);

  const nextPage = () => {
    if (page < localPageCount) {
      setPage((current) => current + 1);
      return;
    }
    if (canLoadRemotePage) {
      history.loadMore();
      setPage((current) => current + 1);
    }
  };

  const exportRows = () => {
    if (!history.rows.length) return;
    downloadHistoryCsv(history.rows);
    setExportReady(true);
  };

  return (
    <section className={styles.history} aria-labelledby={titleId} aria-busy={history.isLoading}>
      <header className={styles.historyHeader}>
        <button type="button" className={styles.historyBack} onClick={onBack}>
          <ArrowRightIcon aria-hidden="true" />
          <Trans>Back to overview</Trans>
        </button>
        <div>
          <h2 id={titleId} className={styles.historyTitle}>
            <Trans>Trial funds usage history</Trans>
          </h2>
          <p className={styles.historySubtitle}>
            <Trans>Review how trading costs are split between principal and trial funds.</Trans>
          </p>
        </div>
      </header>

      <div className={styles.historyToolbar}>
        <label className={styles.historyDate}>
          <span>
            <Trans>Date range</Trans>
          </span>
          <input value={dateRange} readOnly />
        </label>
        <label className={styles.historySelect}>
          <span className={styles.srOnly}>
            <Trans>Event type</Trans>
          </span>
          <select
            value={eventType}
            aria-label={t`Event type`}
            onChange={(event) => {
              setEventType(event.target.value as AttributionFilter);
              setPage(1);
            }}
          >
            <option value="all">{t`All event types`}</option>
            <option value="tradingFee">{t`Trading fee`}</option>
            <option value="funding">{t`Funding`}</option>
            <option value="realizedLoss">{t`Realized loss`}</option>
          </select>
        </label>
        <label className={styles.historySearch}>
          <span className={styles.srOnly}>
            <Trans>Search event, source, or rule</Trans>
          </span>
          <input
            value={search}
            aria-label={t`Search event, source, or rule`}
            placeholder={t`Search event, source, or rule`}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <button type="button" className={styles.historyExport} onClick={exportRows} disabled={!history.rows.length}>
          <Trans>Export</Trans>
        </button>
      </div>

      <div className={styles.historyStats}>
        <HistoryStat
          label={<Trans>Cumulative trial funds attributed</Trans>}
          value={formatUsd(trialAttributed, 4)}
          kind="trial"
        />
        <HistoryStat
          label={<Trans>Principal attributed in loaded records</Trans>}
          value={formatUsd(principalAttributed, 4)}
          kind="principal"
        />
      </div>

      <div className={styles.historyTableWrap}>
        <table className={styles.historyTable} aria-label={t`Trial funds usage history records`}>
          <caption className={styles.srOnly}>
            <Trans>Trial funds usage history records</Trans>
          </caption>
          <colgroup>
            <col className={styles.historyTimeColumn} />
            <col className={styles.historyEventColumn} />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <Trans>Time</Trans>
              </th>
              <th scope="col">
                <Trans>Event</Trans>
              </th>
              <th scope="col">
                <Trans>Total (USD)</Trans>
              </th>
              <th scope="col">
                <Trans>Principal (USD)</Trans>
              </th>
              <th scope="col">
                <Trans>Trial funds (USD)</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRecords.map((record) => {
              const timestamp = splitHistoryTimestamp(record.occurred_at);
              const tone = getAttributionTone(record.event_type);
              const source = getHistorySource(record);
              const amountClass =
                record.event_type === "trade_pnl_gain" || record.event_type === "funding_received"
                  ? styles.historyPositive
                  : styles.historyNegative;
              return (
                <tr key={record.id}>
                  <td className={styles.historyTime}>
                    <span>{timestamp.date}</span>
                    <span>{timestamp.time}</span>
                  </td>
                  <td>
                    <span className={styles.historyEventBadge} data-event={tone}>
                      <AttributionEventLabel eventType={record.event_type} />
                    </span>
                    <span className={styles.historyMarket}>{source}</span>
                  </td>
                  <td className={amountClass}>{formatHistoryAmount(record.total_cost, record.event_type)}</td>
                  <td>{formatHistoryAmount(record.principal_share, record.event_type)}</td>
                  <td className={amountClass}>{formatHistoryAmount(record.bonus_share, record.event_type)}</td>
                </tr>
              );
            })}
            {history.isLoading && visibleRecords.length === 0 ? (
              <tr>
                <td className={styles.historyEmpty} colSpan={5} role="status">
                  <Trans>Loading attribution history…</Trans>
                </td>
              </tr>
            ) : history.error && history.rows.length === 0 ? (
              <tr>
                <td className={styles.historyEmpty} colSpan={5} role="alert">
                  <Trans>Unable to load attribution history.</Trans>{" "}
                  <button type="button" className={styles.inlineRetry} onClick={() => void history.refresh()}>
                    <Trans>Retry</Trans>
                  </button>
                </td>
              </tr>
            ) : visibleRecords.length === 0 ? (
              <tr>
                <td className={styles.historyEmpty} colSpan={5}>
                  {history.rows.length ? (
                    <Trans>No matching records.</Trans>
                  ) : (
                    <Trans>No attribution events yet.</Trans>
                  )}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <footer className={styles.historyFooter}>
        <div className={styles.historyNotice} aria-live="polite">
          <InfoIcon aria-hidden="true" />
          <span>
            {exportReady ? (
              <Trans>Exported the currently loaded attribution records.</Trans>
            ) : history.error && history.rows.length > 0 ? (
              <Trans>Showing loaded records while the latest history request is unavailable.</Trans>
            ) : (
              <Trans>Eligible trading costs use trial funds first; principal covers any remaining amount.</Trans>
            )}
          </span>
        </div>
        <div className={styles.historyPagination}>
          <button
            type="button"
            aria-label={t`Previous page`}
            disabled={page === 1}
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          >
            <ArrowRightIcon aria-hidden="true" />
          </button>
          <strong>
            {page} / {localPageCount}
            {history.hasMore ? "+" : ""}
          </strong>
          <button type="button" aria-label={t`Next page`} disabled={!canGoNext || history.isLoading} onClick={nextPage}>
            <ArrowRightIcon aria-hidden="true" />
          </button>
        </div>
        <div className={styles.historyPageSize}>
          <Trans>6 per page</Trans>
        </div>
      </footer>
    </section>
  );
}

function HistoryStat({ label, value, kind }: { label: ReactNode; value: string; kind: "trial" | "principal" }) {
  return (
    <div className={styles.historyStat} data-kind={kind}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AttributionEventLabel({ eventType }: { eventType: string }) {
  switch (eventType) {
    case "trade_fee":
    case "trading_fee":
      return <Trans>Trading fee</Trans>;
    case "funding":
      return <Trans>Funding</Trans>;
    case "funding_paid":
      return <Trans>Funding paid</Trans>;
    case "funding_received":
      return <Trans>Funding received</Trans>;
    case "trade_loss":
      return <Trans>Realized loss</Trans>;
    case "realized_pnl":
      return <Trans>Realized PnL</Trans>;
    case "trade_pnl_gain":
      return <Trans>Realized profit</Trans>;
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

function BalanceRow({ label, value, locked = false }: { label: ReactNode; value: string; locked?: boolean }) {
  return (
    <div>
      <dt>
        {locked ? <LockIcon className={styles.balanceLock} aria-hidden="true" /> : null}
        <span>{label}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatUsd(value?: string, fractionDigits = 2): string {
  if (value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

function formatHistoryAmount(value: string, eventType: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const absolute = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
  const isGain = eventType === "trade_pnl_gain" || eventType === "funding_received";
  return amount === 0 ? "$0.0000" : isGain ? `+$${absolute}` : `-$${absolute}`;
}

function sumHistoryValue(rows: BonusHistoryRow[], field: "bonus_share" | "principal_share"): string {
  return rows
    .reduce((total, row) => {
      const value = Number(row[field]);
      return Number.isFinite(value) ? total + value : total;
    }, 0)
    .toString();
}

function matchesAttributionFilter(eventType: string, filter: AttributionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "tradingFee") return eventType === "trade_fee" || eventType === "trading_fee";
  if (filter === "funding") return eventType.includes("funding");
  return eventType === "trade_loss" || eventType === "realized_pnl";
}

function getAttributionTone(eventType: string): "tradingFee" | "funding" | "realizedLoss" | "gain" {
  if (eventType === "trade_pnl_gain" || eventType === "funding_received") return "gain";
  if (eventType.includes("funding")) return "funding";
  if (eventType === "trade_loss" || eventType === "realized_pnl") return "realizedLoss";
  return "tradingFee";
}

function splitHistoryTimestamp(value: string): { date: string; time: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" };
  const [formattedDate = "—", formattedTime = "—"] = date.toLocaleString().split(", ");
  return { date: formattedDate, time: formattedTime };
}

function formatHistoryDateRange(rows: BonusHistoryRow[]): string {
  const timestamps = rows.map((row) => Date.parse(row.occurred_at)).filter(Number.isFinite);
  if (!timestamps.length) return "—";
  const earliest = new Date(Math.min(...timestamps)).toLocaleDateString();
  const latest = new Date(Math.max(...timestamps)).toLocaleDateString();
  return earliest === latest ? earliest : `${earliest} – ${latest}`;
}

function getHistorySource(row: BonusHistoryRow): string {
  if (row.source_trade_id) return shortId(row.source_trade_id);
  if (row.source_funding_id) return shortId(row.source_funding_id);
  return row.attribution_rule || "—";
}

function shortId(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function downloadHistoryCsv(rows: BonusHistoryRow[]): void {
  const columns: (keyof BonusHistoryRow)[] = [
    "id",
    "event_type",
    "total_cost",
    "principal_share",
    "bonus_share",
    "attribution_rule",
    "source_trade_id",
    "source_funding_id",
    "occurred_at",
  ];
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(","))].join(
    "\n"
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "rocky-bonus-attribution.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

import { i18n } from "@lingui/core";
import { Trans, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import cx from "classnames";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import TokenIcon from "@/shared/components/TokenIcon/TokenIcon";

import {
  emptyWalletBalanceRows,
  fetchWalletBalanceSnapshot,
  getWalletProviderLabel,
  type WalletBalanceRow,
  type WalletBalanceSnapshot,
} from "./balances";
import styles from "./CantonFundsModal.module.scss";
import type { ConsoleWalletPendingOffer } from "./console";
import {
  acceptUsdcxWalletTransfers,
  authorizeUsdcxWallet,
  fetchPlatformAccountBalance,
  fetchPendingUsdcxOffers,
  fetchUsdcxAutoAccept,
  setUsdcxAutoAccept,
  submitCantonWalletDeposit,
  submitPlatformWithdrawal,
  type CantonDepositResult,
  type CantonFundsAsset,
  type UsdcxPendingOffersResult,
} from "./funds";
import { useCantonSession } from "./useCantonSession";
import { useCantonWallet } from "./useCantonWallet";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FundsAction = "deposit" | "withdraw";
type HistoryTab = "deposit" | "withdraw";
type LocalHistoryRow = {
  id: string;
  type: HistoryTab;
  time: string;
  asset: CantonFundsAsset;
  amount: string;
  status: string;
  reference?: string;
  explorerUrl?: string;
};

const FIXED_FUNDS_ASSET: CantonFundsAsset = "USDCx";
const FIXED_WITHDRAWAL_FEE_AMOUNT = 1;
const FIXED_WITHDRAWAL_FEE_LABEL = "1USDCx";

export function CantonFundsModal({ open, onClose }: Props) {
  const { i18n } = useLingui();
  const { connected, party, provider } = useCantonSession();
  const { disconnect } = useCantonWallet();
  const [snapshot, setSnapshot] = useState<WalletBalanceSnapshot | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [activeAction, setActiveAction] = useState<FundsAction | "">("");
  const [historyTab, setHistoryTab] = useState<HistoryTab>("deposit");
  const [localHistory, setLocalHistory] = useState<LocalHistoryRow[]>([]);
  const [depositBusy, setDepositBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawAvailable, setWithdrawAvailable] = useState<number | null>(null);
  const [withdrawAvailableLoading, setWithdrawAvailableLoading] = useState(false);
  const [authorizationBusy, setAuthorizationBusy] = useState(false);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [autoAcceptBusy, setAutoAcceptBusy] = useState(false);
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [pendingOffers, setPendingOffers] = useState<UsdcxPendingOffersResult>({
    offers: [],
    listingAvailable: false,
  });
  const [depositResult, setDepositResult] = useState<CantonDepositResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const didRefreshOnOpenRef = useRef(false);

  const walletParty = snapshot?.party || party;
  const walletProvider = snapshot?.provider || provider;
  const walletLabel = snapshot?.label || getWalletProviderLabel(provider);
  const walletRows = snapshot?.balances ?? emptyWalletBalanceRows();
  const usdcxBalance = getBalanceAmount(walletRows, "USDCx");
  const withdrawAmountNumber = Number(withdrawAmount.trim());
  const withdrawAmountIsPositive = Number.isFinite(withdrawAmountNumber) && withdrawAmountNumber > 0;
  const withdrawRequiredAmount = requiredWithdrawalAmount(withdrawAmountNumber);
  const withdrawExceedsAvailable =
    withdrawAvailable !== null && withdrawAmountIsPositive && withdrawRequiredAmount > withdrawAvailable;
  const withdrawAvailableError =
    withdrawExceedsAvailable && withdrawAvailable !== null
      ? i18n._(
          t`Insufficient platform balance for this withdrawal. Available: ${formatDisplayAmount(withdrawAvailable)} ${FIXED_FUNDS_ASSET}. Required: ${formatDisplayAmount(withdrawRequiredAmount)} ${FIXED_FUNDS_ASSET} including fee.`
        )
      : "";
  const dashboardRefreshing = balanceLoading || offersLoading || withdrawAvailableLoading;
  const visibleHistory = useMemo(
    () => localHistory.filter((item) => item.type === historyTab).slice(0, 5),
    [historyTab, localHistory]
  );
  const walletExplorerUrl = getCantonScanPartyUrl(walletParty);

  const refreshBalances = useCallback(async () => {
    if (!connected) return;
    setBalanceLoading(true);
    try {
      setSnapshot(await fetchWalletBalanceSnapshot());
    } finally {
      setBalanceLoading(false);
    }
  }, [connected]);

  const refreshWithdrawAvailable = useCallback(async () => {
    if (!connected) {
      setWithdrawAvailable(null);
      return null;
    }
    setWithdrawAvailableLoading(true);
    try {
      const available = await fetchPlatformAccountBalance(FIXED_FUNDS_ASSET);
      setWithdrawAvailable(available);
      return available;
    } finally {
      setWithdrawAvailableLoading(false);
    }
  }, [connected]);

  const refreshPendingOffers = useCallback(async () => {
    if (!connected || !walletParty) return;
    setOffersLoading(true);
    try {
      setPendingOffers(await fetchPendingUsdcxOffers({ provider: walletProvider, party: walletParty }));
    } catch (err) {
      setPendingOffers({ offers: [], listingAvailable: walletProvider === "console" });
      setError(errorMessage(err));
    } finally {
      setOffersLoading(false);
    }
  }, [connected, walletParty, walletProvider]);

  const refreshAutoAccept = useCallback(async () => {
    if (!connected || walletProvider !== "rocky") {
      setAutoAcceptEnabled(false);
      return;
    }
    try {
      const result = await fetchUsdcxAutoAccept();
      setAutoAcceptEnabled(result.enabled);
    } catch (_error) {
      setAutoAcceptEnabled(false);
    }
  }, [connected, walletProvider]);

  const refreshWalletDashboard = useCallback(async () => {
    await Promise.all([refreshBalances(), refreshWithdrawAvailable(), refreshPendingOffers(), refreshAutoAccept()]);
  }, [refreshAutoAccept, refreshBalances, refreshPendingOffers, refreshWithdrawAvailable]);

  useEffect(() => {
    if (!open || !connected) {
      didRefreshOnOpenRef.current = false;
      return;
    }
    if (didRefreshOnOpenRef.current) return;
    didRefreshOnOpenRef.current = true;
    void refreshWalletDashboard();
  }, [connected, open, refreshWalletDashboard]);

  useEffect(() => {
    if (!copiedKey) return;
    const id = window.setTimeout(() => setCopiedKey(""), 1500);
    return () => window.clearTimeout(id);
  }, [copiedKey]);

  if (!open) return null;

  async function handleDeposit(event: FormEvent) {
    event.preventDefault();
    const amount = depositAmount.trim();
    const asset = FIXED_FUNDS_ASSET;
    setDepositBusy(true);
    setError("");
    setNotice("");
    setDepositResult(null);
    try {
      const result = await submitCantonWalletDeposit({
        provider: walletProvider,
        walletParty,
        asset,
        amount,
      });
      setDepositResult(result);
      setDepositAmount("");
      setNotice(depositNotice(result));
      setHistoryTab("deposit");
      const depositUpdateId = result.canton_update_id || result.accept_update_id;
      prependHistory({
        type: "deposit",
        asset,
        amount: `+${formatEnteredAmount(amount)} ${asset}`,
        status: result.platform_credit_status === "confirmed" ? "Completed" : "Submitted",
        reference: depositUpdateId || result.deposit_ref,
        explorerUrl: getCantonScanUpdateUrl(depositUpdateId),
      });
      await refreshWalletDashboard();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDepositBusy(false);
    }
  }

  async function handleWithdraw(event: FormEvent) {
    event.preventDefault();
    const amount = withdrawAmount.trim();
    const asset = FIXED_FUNDS_ASSET;
    setWithdrawBusy(true);
    setError("");
    setNotice("");
    try {
      const latestAvailable = await refreshWithdrawAvailable();
      const requiredAmount = requiredWithdrawalAmount(Number(amount));
      const latestAvailableError =
        latestAvailable !== null && withdrawAmountIsPositive && requiredAmount > latestAvailable
          ? i18n._(
              t`Insufficient platform balance for this withdrawal. Available: ${formatDisplayAmount(latestAvailable)} ${asset}. Required: ${formatDisplayAmount(requiredAmount)} ${asset} including fee.`
            )
          : "";
      if (latestAvailableError) {
        setError(latestAvailableError);
        return;
      }
      const result = await submitPlatformWithdrawal({
        asset,
        amount,
        destinationParty: walletParty,
      });
      setWithdrawAmount("");
      const withdrawalRef = result.withdrawal_id || result.withdrawal_request_id;
      const withdrawalUpdateId =
        stringField(result, "canton_update_id") || stringField(result, "update_id") || stringField(result, "tx_hash");
      setNotice(withdrawalRef ? i18n._(t`Withdrawal submitted: ${withdrawalRef}`) : i18n._(t`Withdrawal submitted`));
      setHistoryTab("withdraw");
      prependHistory({
        type: "withdraw",
        asset,
        amount: `-${formatEnteredAmount(amount)} ${asset}`,
        status: result.status ? String(result.status) : "Submitted",
        reference: withdrawalUpdateId || withdrawalRef,
        explorerUrl: getCantonScanUpdateUrl(withdrawalUpdateId),
      });
      await refreshWalletDashboard();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWithdrawBusy(false);
    }
  }

  function prependHistory(row: Omit<LocalHistoryRow, "id" | "time">) {
    setLocalHistory((prev) => [
      {
        ...row,
        id: `${row.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  async function handleUsdcxAuthorization() {
    setAuthorizationBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authorizeUsdcxWallet();
      setNotice(
        result.status === "confirmed"
          ? i18n._(t`USDCx authorization confirmed`)
          : i18n._(t`USDCx authorization submitted`)
      );
      await refreshWalletDashboard();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAuthorizationBusy(false);
    }
  }

  async function handleAcceptUsdcxOffers() {
    setAcceptBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await acceptUsdcxWalletTransfers({ provider: walletProvider, party: walletParty });
      setNotice(
        result.acceptedCount > 0
          ? i18n._(t`Accepted ${result.acceptedCount} USDCx offer(s)`)
          : i18n._(t`No pending USDCx offers`)
      );
      await refreshWalletDashboard();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAcceptBusy(false);
    }
  }

  async function handleDisconnect() {
    await disconnect();
    onClose();
  }

  async function handleToggleAutoAccept() {
    const next = !autoAcceptEnabled;
    setAutoAcceptBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await setUsdcxAutoAccept(next);
      setAutoAcceptEnabled(result.enabled);
      setNotice(result.enabled ? i18n._(t`USDCx auto-accept enabled`) : i18n._(t`USDCx auto-accept disabled`));
      if (result.enabled) {
        await handleAcceptUsdcxOffers();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAutoAcceptBusy(false);
    }
  }

  async function copyValue(value: string | undefined, key: string) {
    if (!value) return;
    if (await writeClipboardText(value)) {
      setCopiedKey(key);
    }
  }

  const autoAcceptStateLabel = autoAcceptEnabled ? i18n._(t`enabled`) : i18n._(t`disabled`);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rocky-wallet-dashboard-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <RockyGlyph />
            </span>
            <div className={styles.brandText}>
              <span className={styles.brandTitle}>{walletLabel}</span>
              {walletParty ? (
                <div className={styles.brandParty}>
                  <span title={walletParty}>{abbreviateMiddle(walletParty, 30)}</span>
                  <button
                    type="button"
                    onClick={() => copyValue(walletParty, "header-party")}
                    aria-label="Copy wallet party id"
                  >
                    {copiedKey === "header-party" ? "Copied" : <CopyIcon />}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className={styles.headerActions}>
            <a
              className={cx(styles.explorerLink, !walletExplorerUrl && styles.explorerLinkDisabled)}
              href={walletExplorerUrl || "https://www.cantonscan.com/"}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!walletExplorerUrl}
              onClick={(event) => {
                if (!walletExplorerUrl) event.preventDefault();
              }}
            >
              <span>Explorer</span>
              <ExternalIcon />
            </a>
            <span className={styles.headerDivider} />
            <button type="button" className={styles.disconnectButton} onClick={handleDisconnect}>
              <span>Disconnect</span>
              <LogoutIcon />
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close wallet dashboard">
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.balanceCard}>
            <div className={styles.sectionHeader}>
              <h3>
                USDCx Balances
                <button
                  type="button"
                  className={cx(styles.refreshButton, dashboardRefreshing && styles.refreshButtonLoading)}
                  onClick={() => {
                    void refreshWalletDashboard();
                  }}
                  disabled={dashboardRefreshing}
                  aria-label={dashboardRefreshing ? i18n._(t`Refreshing...`) : i18n._(t`Refresh balances`)}
                  title={dashboardRefreshing ? i18n._(t`Refreshing...`) : i18n._(t`Refresh balances`)}
                >
                  <RefreshIcon />
                </button>
              </h3>
            </div>

            <div className={styles.balanceGrid}>
              <div className={styles.balanceItem}>
                <UsdcxIcon className={styles.tokenIcon} />
                <div>
                  <div className={styles.balanceLabel}>Wallet Balance</div>
                  <div className={styles.balanceValue}>
                    {formatFixedBalance(usdcxBalance)} <span>USDCx</span>
                  </div>
                  <div className={styles.balanceCaption}>On-chain balance</div>
                </div>
              </div>
              <div className={styles.balanceItem}>
                <div className={styles.exchangeIcon}>
                  <img src="/favicon.svg" alt="" />
                </div>
                <div>
                  <div className={styles.balanceLabel}>Exchange Balance</div>
                  <div className={styles.balanceValue}>
                    {withdrawAvailable === null ? "-" : formatFixedAmount(withdrawAvailable)}{" "}
                    <span>{FIXED_FUNDS_ASSET}</span>
                  </div>
                  <div className={styles.balanceCaption}>On connected exchange</div>
                </div>
              </div>
            </div>

            {snapshot?.message ? <div className={styles.snapshotMessage}>{snapshot.message}</div> : null}
          </section>

          <section className={styles.actionGrid}>
            <button
              type="button"
              className={cx(styles.actionCard, styles.depositAction, activeAction === "deposit" && styles.actionActive)}
              onClick={() => setActiveAction((prev) => (prev === "deposit" ? "" : "deposit"))}
            >
              <span className={styles.actionIcon}>
                <DepositIcon />
              </span>
              <span>
                <strong>Deposit</strong>
                <small>Deposit USDCx to Rocky Exchange</small>
              </span>
              <ChevronIcon />
            </button>
            <button
              type="button"
              className={cx(
                styles.actionCard,
                styles.withdrawAction,
                activeAction === "withdraw" && styles.actionActive
              )}
              onClick={() => setActiveAction((prev) => (prev === "withdraw" ? "" : "withdraw"))}
            >
              <span className={styles.actionIcon}>
                <WithdrawIcon />
              </span>
              <span>
                <strong>Withdraw</strong>
                <small>Withdraw USDCx to your Wallet</small>
              </span>
              <ChevronIcon />
            </button>
          </section>

          {activeAction ? (
            <section className={styles.operationPanel}>
              {activeAction === "deposit" ? (
                <form className={styles.operationForm} onSubmit={handleDeposit}>
                  <div className={styles.operationHeader}>
                    <div>
                      <h3>Deposit</h3>
                      <p>Transfer funds from the connected wallet to the exchange account.</p>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <span>Asset</span>
                      <div className={styles.fixedAssetValue}>
                        <UsdcxIcon />
                        <strong>{FIXED_FUNDS_ASSET}</strong>
                      </div>
                    </div>
                    <label className={styles.field}>
                      <span>Amount</span>
                      <input
                        value={depositAmount}
                        onChange={(event) => setDepositAmount(event.target.value)}
                        inputMode="decimal"
                        placeholder="100"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className={styles.primarySubmit}
                    disabled={depositBusy || !depositAmount.trim() || !walletParty}
                  >
                    {depositBusy ? i18n._(t`Depositing...`) : i18n._(t`Deposit`)}
                  </button>
                  {depositResult?.deposit_ref ? (
                    <DepositReferenceView result={depositResult} copiedKey={copiedKey} onCopy={copyValue} />
                  ) : null}
                </form>
              ) : (
                <form className={styles.operationForm} onSubmit={handleWithdraw}>
                  <div className={styles.operationHeader}>
                    <div>
                      <h3>Withdraw</h3>
                      <p>Move platform available balance back to the connected wallet party.</p>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <span>Asset</span>
                      <div className={styles.fixedAssetValue}>
                        <UsdcxIcon />
                        <strong>{FIXED_FUNDS_ASSET}</strong>
                      </div>
                    </div>
                    <label className={styles.field}>
                      <span>Amount</span>
                      <input
                        value={withdrawAmount}
                        onChange={(event) => setWithdrawAmount(event.target.value)}
                        inputMode="decimal"
                        placeholder="50"
                      />
                    </label>
                  </div>
                  <div className={styles.destinationLine}>
                    <span>Destination</span>
                    <strong title={walletParty || ""}>{abbreviateMiddle(walletParty, 42)}</strong>
                  </div>
                  <div className={styles.destinationLine}>
                    <span>Fee</span>
                    <strong>{FIXED_WITHDRAWAL_FEE_LABEL}</strong>
                  </div>
                  {withdrawAvailableError ? <div className={styles.errorText}>{withdrawAvailableError}</div> : null}
                  <button
                    type="submit"
                    className={styles.primarySubmit}
                    disabled={withdrawBusy || !withdrawAmount.trim() || !walletParty || withdrawExceedsAvailable}
                  >
                    {withdrawBusy ? i18n._(t`Withdrawing...`) : i18n._(t`Withdraw`)}
                  </button>
                </form>
              )}
            </section>
          ) : null}

          {walletProvider === "rocky" || walletProvider === "console" ? (
            <section className={styles.utilityPanel}>
              <div>
                <h3>USDCx Controls</h3>
                <p>
                  {walletProvider === "rocky"
                    ? `Pending USDCx offers are accepted through the backend. Auto-accept is ${autoAcceptStateLabel}.`
                    : "Accept pending Console Wallet USDCx offers from the connected wallet."}
                </p>
              </div>
              <div className={styles.utilityActions}>
                {walletProvider === "rocky" ? (
                  <button type="button" onClick={handleUsdcxAuthorization} disabled={authorizationBusy}>
                    {authorizationBusy ? i18n._(t`Authorizing...`) : i18n._(t`Authorize USDCx`)}
                  </button>
                ) : null}
                {walletProvider === "rocky" ? (
                  <button type="button" onClick={handleToggleAutoAccept} disabled={autoAcceptBusy}>
                    {autoAcceptBusy
                      ? i18n._(t`Updating auto-accept...`)
                      : autoAcceptEnabled
                        ? i18n._(t`Disable auto-accept`)
                        : i18n._(t`Enable auto-accept`)}
                  </button>
                ) : null}
                <button type="button" onClick={handleAcceptUsdcxOffers} disabled={acceptBusy}>
                  {acceptBusy ? i18n._(t`Checking offers...`) : i18n._(t`Accept USDCx offers`)}
                </button>
              </div>
              {walletProvider === "console" ? (
                <PendingOffersList
                  offers={pendingOffers.offers}
                  loading={offersLoading}
                  copiedKey={copiedKey}
                  onCopy={copyValue}
                />
              ) : null}
            </section>
          ) : null}

          {notice || error ? (
            <div className={styles.messageStack}>
              {notice ? <div className={styles.noticeText}>{notice}</div> : null}
              {error ? <div className={styles.errorText}>{error}</div> : null}
            </div>
          ) : null}

          <section className={styles.historyCard}>
            <div className={styles.historyTabs}>
              <button
                type="button"
                className={cx(historyTab === "deposit" && styles.historyTabActive)}
                onClick={() => setHistoryTab("deposit")}
              >
                Deposit History
              </button>
              <button
                type="button"
                className={cx(historyTab === "withdraw" && styles.historyTabActive)}
                onClick={() => setHistoryTab("withdraw")}
              >
                Withdraw History
              </button>
            </div>
            <div className={styles.historyTable}>
              <div className={styles.historyHead}>
                <span>Time</span>
                <span>Asset</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Tx Hash</span>
              </div>
              {visibleHistory.length > 0 ? (
                visibleHistory.map((item) => (
                  <div key={item.id} className={styles.historyRow}>
                    <span>{formatHistoryTime(item.time)}</span>
                    <span className={styles.assetCell}>
                      <TokenIcon symbol={item.asset === "USDCx" ? "USDC" : item.asset} displaySize={24} />
                      {item.asset}
                    </span>
                    <span
                      className={cx(
                        styles.amountCell,
                        item.type === "deposit" ? styles.positiveAmount : styles.negativeAmount
                      )}
                    >
                      {item.amount}
                    </span>
                    <span>
                      <em>{item.status}</em>
                    </span>
                    <span>
                      {item.reference && item.explorerUrl ? (
                        <a className={styles.referenceButton} href={item.explorerUrl} target="_blank" rel="noreferrer">
                          {abbreviateMiddle(item.reference, 14)}
                          <ExternalIcon />
                        </a>
                      ) : item.reference ? (
                        <button
                          type="button"
                          className={styles.referenceButton}
                          onClick={() => copyValue(item.reference, `history-${item.id}`)}
                        >
                          {copiedKey === `history-${item.id}` ? "Copied" : abbreviateMiddle(item.reference, 14)}
                          <CopyIcon />
                        </button>
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                ))
              ) : (
                <div className={styles.historyEmpty}>No {historyTab} history yet</div>
              )}
            </div>
            <button type="button" className={styles.viewAllButton} disabled>
              View All {historyTab === "deposit" ? "Deposits" : "Withdrawals"}
              <ChevronDownIcon />
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}

function DepositReferenceView({
  result,
  copiedKey,
  onCopy,
}: {
  result: CantonDepositResult;
  copiedKey: string;
  onCopy: (value: string | undefined, key: string) => void;
}) {
  return (
    <div className={styles.referenceBox}>
      <ReferenceLine
        label={i18n._(t`Deposit ref`)}
        value={result.deposit_ref}
        copied={copiedKey === "deposit_ref"}
        onCopy={() => onCopy(result.deposit_ref, "deposit_ref")}
      />
      {result.target_party_id ? (
        <ReferenceLine
          label={i18n._(t`Target party`)}
          value={result.target_party_id}
          copied={copiedKey === "target_party"}
          onCopy={() => onCopy(result.target_party_id, "target_party")}
        />
      ) : null}
      {result.expires_at ? (
        <div className={styles.referenceLine}>
          <span>
            <Trans>Expires</Trans>
          </span>
          <strong>{new Date(result.expires_at).toLocaleString()}</strong>
        </div>
      ) : null}
    </div>
  );
}

function ReferenceLine({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value?: string;
  copied: boolean;
  onCopy: () => void;
}) {
  if (!value) return null;
  return (
    <div className={styles.referenceLine}>
      <span>{label}</span>
      <strong title={value}>{abbreviateMiddle(value, 44)}</strong>
      <button type="button" onClick={onCopy}>
        {copied ? i18n._(t`Copied`) : i18n._(t`Copy`)}
      </button>
    </div>
  );
}

function PendingOffersList({
  offers,
  loading,
  copiedKey,
  onCopy,
}: {
  offers: ConsoleWalletPendingOffer[];
  loading: boolean;
  copiedKey: string;
  onCopy: (value: string | undefined, key: string) => void;
}) {
  const { i18n } = useLingui();
  if (loading && offers.length === 0) {
    return (
      <div className={styles.pendingEmpty}>
        <Trans>Loading pending USDCx offers...</Trans>
      </div>
    );
  }
  if (offers.length === 0) {
    return (
      <div className={styles.pendingEmpty}>
        <Trans>No pending Console Wallet USDCx offers.</Trans>
      </div>
    );
  }

  return (
    <div className={styles.pendingList}>
      {offers.slice(0, 5).map((offer) => {
        const key = offer.transferCid || `${offer.sender}-${offer.amount}`;
        return (
          <div key={key} className={styles.pendingOffer}>
            <div>
              <span>
                <Trans>Amount</Trans>
              </span>
              <strong>{formatOfferAmount(offer)}</strong>
            </div>
            <div>
              <span>
                <Trans>Sender</Trans>
              </span>
              <strong title={offer.sender || ""}>{abbreviateMiddle(offer.sender, 32) || "-"}</strong>
              {offer.sender ? (
                <button type="button" onClick={() => onCopy(offer.sender, `sender-${key}`)}>
                  {copiedKey === `sender-${key}` ? i18n._(t`Copied`) : i18n._(t`Copy`)}
                </button>
              ) : null}
            </div>
            <div>
              <span>
                <Trans>Expires</Trans>
              </span>
              <strong>{formatOfferTimestamp(offer.expiredAt)}</strong>
            </div>
          </div>
        );
      })}
      {offers.length > 5 ? (
        <div className={styles.pendingEmpty}>
          <Trans>{offers.length - 5} more pending offer(s)</Trans>
        </div>
      ) : null}
    </div>
  );
}

function depositNotice(result: CantonDepositResult): string {
  if (result.platform_credit_status === "pending") {
    return i18n._(t`Wallet transfer submitted. Waiting for platform credit.`);
  }
  if (result.wallet_transfer === "rocky_wallet_submitted") return i18n._(t`Rocky Wallet transfer submitted`);
  if (result.wallet_transfer === "console_wallet_submitted") return i18n._(t`Console Wallet transfer submitted`);
  if (result.wallet_transfer === "loop_wallet_submitted") return i18n._(t`Loop Wallet transfer submitted`);
  if (result.wallet_transfer === "submitted" || result.wallet_transfer === "submitted_and_accepted") {
    return i18n._(t`Rocky Wallet transfer submitted`);
  }
  if (result.deposit_ref) return i18n._(t`Deposit reference created`);
  return i18n._(t`Deposit submitted`);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return i18n._(t`Request failed`);
}

function getBalanceAmount(rows: WalletBalanceRow[], symbol: CantonFundsAsset): string | null {
  return rows.find((item) => item.symbol === symbol)?.amount ?? null;
}

function formatOfferAmount(offer: ConsoleWalletPendingOffer): string {
  const amount = offer.amount ? trimTrailingZeroes(offer.amount) : "-";
  return `${amount} ${offer.coin || "USDCx"}`;
}

function formatOfferTimestamp(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function trimTrailingZeroes(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
}

function formatEnteredAmount(value: string): string {
  return trimTrailingZeroes(value.trim());
}

function formatDisplayAmount(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
}

function formatFixedAmount(value: number): string {
  const factor = 100;
  const truncated = Math.trunc(value * factor) / factor;

  return truncated.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFixedBalance(value: string | null | undefined): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.00";
  return formatFixedAmount(numeric);
}

function requiredWithdrawalAmount(amount: number): number {
  return Number.isFinite(amount) && amount > 0 ? amount + FIXED_WITHDRAWAL_FEE_AMOUNT : 0;
}

function abbreviateMiddle(value: string | undefined, max = 28): string {
  if (!value) return "-";
  if (value.length <= max) return value;
  const edge = Math.max(4, Math.floor((max - 3) / 2));
  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
}

function getCantonScanPartyUrl(party: string | undefined): string {
  return party ? `https://www.cantonscan.com/party/${encodeURIComponent(party)}` : "";
}

function getCantonScanUpdateUrl(updateId: string | undefined): string {
  return updateId ? `https://www.cantonscan.com/update/${encodeURIComponent(updateId)}` : "";
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

async function writeClipboardText(value: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } catch (_error) {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function ExternalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4 10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12 5H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M10 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m17 9 3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m6 6 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DepositIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 7v18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="m13.5 18.5 6.5 6.5 6.5-6.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 31h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function WithdrawIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M13 27 27 13" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
      <path d="M17 13h10v10" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19 11a7 7 0 1 0-2.1 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsdcxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="url(#usdcx-icon-bg)" />
      <path
        d="M13.25 11.9a11 11 0 0 0 0 16.2M26.75 11.9a11 11 0 0 1 0 16.2"
        stroke="#ffffff"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M23.9 15.5c-.9-.9-2.25-1.35-3.75-1.35-2.3 0-4.05 1.08-4.05 2.85 0 1.9 1.82 2.45 4.05 2.92 2.45.52 4.15 1.12 4.15 3.03 0 1.8-1.76 2.9-4.16 2.9-1.78 0-3.38-.58-4.34-1.66"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 10.9v18.2" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
      <defs>
        <linearGradient id="usdcx-icon-bg" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3aa3ff" />
          <stop offset="1" stopColor="#1f6fd8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function RockyGlyph() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M26.1453 16.3457C26.5547 16.0129 27.11 15.9136 27.6112 16.0781L42.6854 21.0401C43.2555 21.2275 43.6694 21.7253 43.7459 22.3184L45.6776 37.1397C45.7503 37.683 45.5319 38.2191 45.1073 38.5596L34.3944 47.1494C34.1382 47.3519 33.8247 47.4739 33.4998 47.4893L23.7127 47.9981C23.2614 48.021 22.8175 47.8454 22.5037 47.5166L14.4305 39.0264C14.09 38.6706 13.941 38.1764 14.0213 37.6944L16.1483 24.9278C16.2133 24.5528 16.4084 24.2118 16.7069 23.9707L26.1414 16.3496L26.1453 16.3457ZM31.9364 24.5996C31.455 24.5996 31.0464 25.1647 31.2616 25.5293L34.6922 31.3448C34.9584 31.713 34.8418 32.2385 34.3787 32.6104L30.4627 35.7715C29.832 36.282 29.6939 37.0548 30.0184 37.5215L30.8602 38.7285C31.1592 39.1551 31.5968 39.4148 32.2166 39.4112L38.8641 39.4033C39.1374 39.4033 39.5382 39.2431 39.6951 38.999C39.8483 38.7584 39.7898 38.4264 39.6512 38.2295L39.6483 38.2364L35.6551 32.6543C35.378 32.2642 35.5239 31.7425 35.9979 31.3633L39.9032 28.2383C40.512 27.7497 40.7304 27.0497 40.4168 26.5684L39.7313 25.5254C39.3048 24.8767 38.7363 24.5997 37.8543 24.5996H31.9364ZM23.9432 24.6065C23.3818 24.6066 22.911 25.0037 22.7616 25.5615L19.3231 38.3858C19.1591 38.9946 19.4476 39.4033 20.0418 39.4033H25.4129C25.9926 39.4033 26.5102 38.9766 26.6707 38.3897L28.1727 32.8106L30.1317 25.5948C30.2812 25.0478 29.956 24.6065 29.409 24.6065H23.9432Z"
        fill="currentColor"
      />
    </svg>
  );
}

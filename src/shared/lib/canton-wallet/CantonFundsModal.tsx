import { i18n } from "@lingui/core";
import { Trans, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import cx from "classnames";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { spotMarketAssetIconSymbol } from "@/modules/spot/markets";
import TokenIcon from "@/shared/components/TokenIcon/TokenIcon";

import { CANTON_FUNDING_ASSETS, walletFacingAssetSymbol } from "./assets";
import { fileToAvatarDataUrl } from "./avatarImage";
import {
  emptyWalletBalanceRows,
  fetchWalletBalanceSnapshot,
  getWalletProviderLabel,
  type WalletBalanceRow,
  type WalletBalanceSnapshot,
} from "./balances";
import styles from "./CantonFundsModal.module.scss";
import {
  fetchCantonFundsHistory,
  fetchPlatformAccountBalance,
  submitCantonWalletDeposit,
  submitPlatformWithdrawal,
  waitForPlatformDepositCredit,
  type CantonDepositResult,
  type CantonFundsHistory,
  type CantonFundsAsset,
} from "./funds";
import { hydrateOwnProfile, setAvatar, SetAvatarError, setDisplayName, SetDisplayNameError } from "./profile";
import { useCantonSession } from "./useCantonSession";
import { useCantonWallet } from "./useCantonWallet";
import { getWalletProviderLogo } from "./walletLogos";

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
  networkFee?: string;
  status: string;
  reference?: string;
  dedupeKeys?: string[];
  explorerUrl?: string;
};

const FIXED_WITHDRAWAL_FEE_AMOUNT = 1;
const PENDING_DEPOSIT_CONFIRM_ATTEMPTS = 36;
const PENDING_DEPOSIT_CONFIRM_DELAY_MS = 10000;

export function CantonFundsModal({ open, onClose }: Props) {
  const { i18n } = useLingui();
  const { connected, locked, party, provider, username, avatar } = useCantonSession();
  const { disconnect } = useCantonWallet();
  const [snapshot, setSnapshot] = useState<WalletBalanceSnapshot | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<CantonFundsAsset>("USDA");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [activeAction, setActiveAction] = useState<FundsAction | "">("");
  const [historyTab, setHistoryTab] = useState<HistoryTab>("deposit");
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [localHistory, setLocalHistory] = useState<LocalHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositConfirming, setDepositConfirming] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawAvailable, setWithdrawAvailable] = useState<number | null>(null);
  const [withdrawAvailableLoading, setWithdrawAvailableLoading] = useState(false);
  const [depositResult, setDepositResult] = useState<CantonDepositResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const didRefreshOnOpenRef = useRef(false);
  const depositConfirmationIdRef = useRef(0);

  const walletParty = snapshot?.party || party;
  const walletProvider = snapshot?.provider || provider;
  const walletLabel = snapshot?.label || getWalletProviderLabel(provider);
  const walletLogo = getWalletProviderLogo(walletProvider);
  const walletRows = snapshot?.balances ?? emptyWalletBalanceRows();
  const selectedWalletBalance = getBalanceAmount(walletRows, selectedAsset);
  const withdrawAmountNumber = Number(withdrawAmount.trim());
  const withdrawAmountIsPositive = Number.isFinite(withdrawAmountNumber) && withdrawAmountNumber > 0;
  const withdrawRequiredAmount = requiredWithdrawalAmount(withdrawAmountNumber, selectedAsset);
  const withdrawExceedsAvailable =
    withdrawAvailable !== null && withdrawAmountIsPositive && withdrawRequiredAmount > withdrawAvailable;
  const withdrawAvailableError =
    withdrawExceedsAvailable && withdrawAvailable !== null
      ? i18n._(
          t`Insufficient platform balance for this withdrawal. Available: ${formatDisplayAmount(withdrawAvailable)} ${selectedAsset}. Required: ${formatDisplayAmount(withdrawRequiredAmount)} ${selectedAsset} including fee.`
        )
      : "";
  const dashboardRefreshing = balanceLoading || withdrawAvailableLoading || depositConfirming || historyLoading;
  const historyItems = useMemo(
    () => localHistory.filter((item) => item.type === historyTab),
    [historyTab, localHistory]
  );
  const visibleHistory = useMemo(
    () => (showAllHistory ? historyItems : historyItems.slice(0, 3)),
    [historyItems, showAllHistory]
  );
  const canToggleHistory = historyItems.length > 3;
  const walletExplorerUrl = getCantonScanPartyUrl(walletParty);

  useEffect(() => {
    if (open && (!connected || locked)) onClose();
  }, [connected, locked, onClose, open]);

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
      const available = await fetchPlatformAccountBalance(selectedAsset);
      setWithdrawAvailable(available);
      return available;
    } finally {
      setWithdrawAvailableLoading(false);
    }
  }, [connected, selectedAsset]);

  const refreshFundsHistory = useCallback(async () => {
    if (!connected) return;
    setHistoryLoading(true);
    try {
      const history = await fetchCantonFundsHistory();
      const serverRows = mapFundsHistoryToLocalRows(history);
      setLocalHistory((currentRows) => mergeHistoryRows(serverRows, currentRows));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }, [connected]);

  const refreshWalletDashboard = useCallback(async () => {
    await Promise.all([refreshBalances(), refreshWithdrawAvailable(), refreshFundsHistory()]);
  }, [refreshBalances, refreshFundsHistory, refreshWithdrawAvailable]);

  useEffect(() => {
    if (!open || !connected) {
      didRefreshOnOpenRef.current = false;
      return;
    }
    if (didRefreshOnOpenRef.current) return;
    didRefreshOnOpenRef.current = true;
    void refreshWalletDashboard();
    void hydrateOwnProfile();
  }, [connected, open, refreshWalletDashboard]);

  useEffect(() => {
    if (open && connected) void refreshWithdrawAvailable();
  }, [connected, open, refreshWithdrawAvailable, selectedAsset]);

  useEffect(() => {
    if (!copiedKey) return;
    const id = window.setTimeout(() => setCopiedKey(""), 1500);
    return () => window.clearTimeout(id);
  }, [copiedKey]);

  useEffect(() => {
    if (open) return;
    depositConfirmationIdRef.current += 1;
    setDepositConfirming(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  async function handleDeposit(event: FormEvent) {
    event.preventDefault();
    const amount = depositAmount.trim();
    const asset = selectedAsset;
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
      setShowAllHistory(false);
      const depositUpdateId = result.canton_update_id || result.accept_update_id;
      prependHistory({
        type: "deposit",
        asset,
        amount: `+${formatEnteredAmount(amount)} ${asset}`,
        status: result.platform_credit_status === "confirmed" ? "Completed" : "Submitted",
        reference: depositUpdateId || result.deposit_ref,
        dedupeKeys: [result.deposit_ref, depositUpdateId].filter((value): value is string => Boolean(value)),
        explorerUrl: getCantonScanUpdateUrl(depositUpdateId),
      });
      await refreshWalletDashboard();
      if (result.platform_credit_status === "pending") {
        void confirmPendingDepositCredit(result, asset, amount, depositUpdateId || result.deposit_ref);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDepositBusy(false);
    }
  }

  async function confirmPendingDepositCredit(
    result: CantonDepositResult,
    asset: CantonFundsAsset,
    amount: string,
    historyReference: string | undefined
  ) {
    const confirmationId = ++depositConfirmationIdRef.current;
    setDepositConfirming(true);
    setNotice(i18n._(t`Chain transfer submitted. Exchange balance is confirming.`));
    try {
      const creditedBalance = await waitForPlatformDepositCredit({
        asset,
        amount,
        previousBalance: result.platform_previous_balance,
        attempts: PENDING_DEPOSIT_CONFIRM_ATTEMPTS,
        delayMs: PENDING_DEPOSIT_CONFIRM_DELAY_MS,
      });
      if (confirmationId !== depositConfirmationIdRef.current) return;
      if (creditedBalance !== null) {
        setNotice(i18n._(t`Deposit credited to exchange balance.`));
        if (historyReference) {
          setLocalHistory((items) =>
            items.map((item) => (item.reference === historyReference ? { ...item, status: "Completed" } : item))
          );
        }
      } else {
        setNotice(i18n._(t`Chain transfer submitted. Exchange balance is still confirming.`));
      }
      await refreshWalletDashboard();
    } catch (err) {
      if (confirmationId === depositConfirmationIdRef.current) {
        setError(errorMessage(err));
      }
    } finally {
      if (confirmationId === depositConfirmationIdRef.current) {
        setDepositConfirming(false);
      }
    }
  }

  async function handleWithdraw(event: FormEvent) {
    event.preventDefault();
    const amount = withdrawAmount.trim();
    const asset = selectedAsset;
    setWithdrawBusy(true);
    setError("");
    setNotice("");
    try {
      const latestAvailable = await refreshWithdrawAvailable();
      const requiredAmount = requiredWithdrawalAmount(Number(amount), asset);
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
      setShowAllHistory(false);
      prependHistory({
        type: "withdraw",
        asset,
        amount: `-${formatEnteredAmount(amount)} ${asset}`,
        networkFee: formatNetworkFee(result.fee_amount, result.fee_wallet_symbol || result.fee_asset),
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

  async function handleDisconnect() {
    await disconnect();
    onClose();
  }

  async function copyValue(value: string | undefined, key: string) {
    if (!value) return;
    if (await writeClipboardText(value)) {
      setCopiedKey(key);
    }
  }

  function startEditName() {
    setNameDraft(username || "");
    setNameError("");
    setEditingName(true);
  }

  async function handleSaveName() {
    const draft = nameDraft.trim();
    if (draft.length < 3 || draft.length > 20 || !/^[a-zA-Z0-9_]+$/.test(draft)) {
      setNameError(i18n._(t`3-20 letters, digits or underscore.`));
      return;
    }
    setNameSaving(true);
    setNameError("");
    try {
      await setDisplayName(draft);
      setEditingName(false);
    } catch (e) {
      if (e instanceof SetDisplayNameError && e.code === "name_taken") {
        setNameError(i18n._(t`That name is already taken.`));
      } else if (e instanceof SetDisplayNameError && e.code === "invalid_name") {
        setNameError(i18n._(t`3-20 letters, digits or underscore.`));
      } else if (e instanceof SetDisplayNameError && e.code === "unauthorized") {
        setNameError(i18n._(t`Please reconnect your wallet.`));
      } else {
        setNameError(i18n._(t`Could not save name. Try again.`));
      }
    } finally {
      setNameSaving(false);
    }
  }

  function openAvatarPicker() {
    if (!connected || avatarBusy) return;
    setAvatarError("");
    avatarInputRef.current?.click();
  }

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError("");
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await setAvatar(dataUrl);
    } catch (e) {
      if (e instanceof SetAvatarError && e.code === "unauthorized") {
        setAvatarError(i18n._(t`Please reconnect your wallet.`));
      } else {
        setAvatarError(i18n._(t`Could not save avatar. Try again.`));
      }
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError("");
    try {
      await setAvatar(null);
    } catch (_error) {
      setAvatarError(i18n._(t`Could not remove avatar. Try again.`));
    } finally {
      setAvatarBusy(false);
    }
  }

  function selectHistoryTab(nextTab: HistoryTab) {
    setHistoryTab(nextTab);
    setShowAllHistory(false);
  }

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
            <button
              className={styles.avatarButton}
              type="button"
              onClick={openAvatarPicker}
              disabled={!connected || avatarBusy}
              aria-label={i18n._(t`Change avatar`)}
              title={connected ? i18n._(t`Change avatar`) : undefined}
            >
              <span className={cx(styles.brandMark, logoFitClass(styles, walletLogo.fit))}>
                {avatar ? (
                  <img src={avatar} alt="" className={styles.avatarImage} />
                ) : (
                  <img src={walletLogo.src} alt="" className={styles.providerLogo} />
                )}
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className={styles.hiddenFileInput}
              onChange={(event) => void handleAvatarFileChange(event)}
            />
            <div className={styles.brandText}>
              {editingName ? (
                <div id="rocky-wallet-dashboard-title" className={styles.nameEditor}>
                  <div className={styles.nameEditorRow}>
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={20}
                      placeholder={i18n._(t`Display name`)}
                      autoFocus
                      disabled={nameSaving}
                      className={styles.nameInput}
                    />
                    <button
                      className={styles.saveNameButton}
                      type="button"
                      onClick={() => void handleSaveName()}
                      disabled={nameSaving}
                    >
                      {nameSaving ? i18n._(t`Saving`) : i18n._(t`Save`)}
                    </button>
                    <button
                      className={styles.cancelNameButton}
                      type="button"
                      onClick={() => setEditingName(false)}
                      disabled={nameSaving}
                    >
                      {i18n._(t`Cancel`)}
                    </button>
                  </div>
                  {nameError ? <span className={styles.inlineError}>{nameError}</span> : null}
                </div>
              ) : (
                <div className={styles.nameRow}>
                  <span id="rocky-wallet-dashboard-title" className={styles.brandTitle}>
                    {username || walletLabel}
                  </span>
                  {connected ? (
                    <button
                      className={styles.editNameButton}
                      type="button"
                      onClick={startEditName}
                      aria-label={i18n._(t`Edit display name`)}
                    >
                      {i18n._(t`Edit`)}
                    </button>
                  ) : null}
                </div>
              )}
              {avatarError ? <span className={styles.inlineError}>{avatarError}</span> : null}
              {walletParty ? (
                <div className={styles.brandParty}>
                  <span title={walletParty}>{abbreviateMiddle(walletParty, 30)}</span>
                  <button
                    type="button"
                    onClick={() => copyValue(walletParty, "header-party")}
                    aria-label={i18n._(t`Copy wallet party id`)}
                  >
                    {copiedKey === "header-party" ? i18n._(t`Copied`) : <CopyIcon />}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className={styles.headerActions}>
            <a
              className={cx(styles.headerIconButton, !walletExplorerUrl && styles.headerIconButtonDisabled)}
              href={walletExplorerUrl || "https://www.cantonscan.com/"}
              target="_blank"
              rel="noreferrer"
              aria-label={i18n._(t`Explorer`)}
              title={i18n._(t`Explorer`)}
              aria-disabled={!walletExplorerUrl}
              onClick={(event) => {
                if (!walletExplorerUrl) event.preventDefault();
              }}
            >
              <ExternalIcon />
            </a>
            <details className={styles.moreMenu}>
              <summary
                className={styles.headerIconButton}
                aria-label={i18n._(t`More profile actions`)}
                title={i18n._(t`More profile actions`)}
              >
                <MoreIcon />
              </summary>
              <div className={styles.moreMenuPanel}>
                {connected && avatar ? (
                  <button
                    type="button"
                    className={styles.menuAction}
                    onClick={() => void handleRemoveAvatar()}
                    disabled={avatarBusy}
                  >
                    <RemoveAvatarIcon />
                    <span>{i18n._(t`Remove avatar`)}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cx(styles.menuAction, styles.disconnectMenuAction)}
                  onClick={handleDisconnect}
                >
                  <LogoutIcon />
                  <span>{i18n._(t`Disconnect`)}</span>
                </button>
              </div>
            </details>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label={i18n._(t`Close wallet dashboard`)}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.balanceCard}>
            <div className={styles.sectionHeader}>
              <h3>
                <select
                  className={styles.headingAssetSelect}
                  aria-label={i18n._(t`Asset`)}
                  value={selectedAsset}
                  onChange={(event) => {
                    setSelectedAsset(event.target.value as CantonFundsAsset);
                    setDepositAmount("");
                    setWithdrawAmount("");
                    setError("");
                  }}
                >
                  {CANTON_FUNDING_ASSETS.map((asset) => (
                    <option key={asset.symbol} value={asset.symbol}>
                      {asset.symbol}
                    </option>
                  ))}
                </select>
                {i18n._(t`Balances`)}
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
                <TokenIcon
                  symbol={spotMarketAssetIconSymbol(selectedAsset)}
                  displaySize={40}
                  className={styles.tokenIcon}
                />
                <div>
                  <div className={styles.balanceLabel}>{i18n._(t`Wallet Balance`)}</div>
                  <div className={styles.balanceValue}>
                    <CompactAssetAmount value={selectedWalletBalance} asset={selectedAsset} />{" "}
                    <span>{selectedAsset}</span>
                  </div>
                  <div className={styles.balanceCaption}>{i18n._(t`On-chain balance`)}</div>
                </div>
              </div>
              <div className={styles.balanceItem}>
                <div className={cx(styles.exchangeIcon, logoFitClass(styles, walletLogo.fit))}>
                  <img src="/favicon.svg" alt="" className={styles.providerLogo} />
                </div>
                <div>
                  <div className={styles.balanceLabel}>{i18n._(t`Exchange Balance`)}</div>
                  <div className={styles.balanceValue}>
                    {withdrawAvailable === null ? (
                      "-"
                    ) : (
                      <CompactAssetAmount value={withdrawAvailable} asset={selectedAsset} />
                    )}{" "}
                    <span>{selectedAsset}</span>
                  </div>
                  <div className={styles.balanceCaption}>{i18n._(t`On connected exchange`)}</div>
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
                <strong>{i18n._(t`Deposit`)}</strong>
                <small>{i18n._(t`Deposit ${selectedAsset} to Rocky Exchange`)}</small>
              </span>
              <span className={styles.actionChevron}>
                {activeAction === "deposit" ? <ChevronDownIcon /> : <ChevronIcon />}
              </span>
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
                <strong>{i18n._(t`Withdraw`)}</strong>
                <small>{i18n._(t`Withdraw ${selectedAsset} to your Wallet`)}</small>
              </span>
              <span className={styles.actionChevron}>
                {activeAction === "withdraw" ? <ChevronDownIcon /> : <ChevronIcon />}
              </span>
            </button>
          </section>

          {activeAction ? (
            <section className={styles.operationPanel}>
              {activeAction === "deposit" ? (
                <form className={styles.operationForm} onSubmit={handleDeposit}>
                  <div className={styles.operationHeader}>
                    <div>
                      <h3>{i18n._(t`Deposit`)}</h3>
                      <p>{i18n._(t`Transfer funds from the connected wallet to the exchange account.`)}</p>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>{i18n._(t`Amount`)}</span>
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
                      <h3>{i18n._(t`Withdraw`)}</h3>
                      <p>{i18n._(t`Move platform available balance back to the connected wallet party.`)}</p>
                    </div>
                  </div>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>{i18n._(t`Amount`)}</span>
                      <input
                        value={withdrawAmount}
                        onChange={(event) => setWithdrawAmount(event.target.value)}
                        inputMode="decimal"
                        placeholder="50"
                      />
                    </label>
                  </div>
                  <div className={styles.destinationLine}>
                    <span>{i18n._(t`Destination`)}</span>
                    <strong title={walletParty || ""}>{abbreviateMiddle(walletParty, 42)}</strong>
                  </div>
                  <div className={styles.destinationLine}>
                    <span>{i18n._(t`Fee`)}</span>
                    <strong>{withdrawalFeeLabel(selectedAsset)}</strong>
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
                onClick={() => selectHistoryTab("deposit")}
              >
                {i18n._(t`Deposit History`)}
              </button>
              <button
                type="button"
                className={cx(historyTab === "withdraw" && styles.historyTabActive)}
                onClick={() => selectHistoryTab("withdraw")}
              >
                {i18n._(t`Withdraw History`)}
              </button>
            </div>
            <div className={styles.historyTable}>
              <div className={cx(styles.historyHead, historyTab === "withdraw" && styles.historyRowWithFee)}>
                <span>{i18n._(t`Time`)}</span>
                <span>{i18n._(t`Asset`)}</span>
                <span>{i18n._(t`Amount`)}</span>
                {historyTab === "withdraw" ? <span>{i18n._(t`Network Fee`)}</span> : null}
                <span>{i18n._(t`Status`)}</span>
                <span>{i18n._(t`Tx Hash`)}</span>
              </div>
              {visibleHistory.length > 0 ? (
                visibleHistory.map((item) => (
                  <div
                    key={item.id}
                    className={cx(styles.historyRow, historyTab === "withdraw" && styles.historyRowWithFee)}
                  >
                    <span>{formatHistoryTime(item.time)}</span>
                    <span className={styles.assetCell}>
                      <TokenIcon symbol={spotMarketAssetIconSymbol(item.asset)} displaySize={24} />
                      {item.asset}
                    </span>
                    <span
                      className={cx(
                        styles.amountCell,
                        item.type === "deposit" ? styles.positiveAmount : styles.negativeAmount
                      )}
                    >
                      <HistoryAssetAmount value={item.amount} asset={item.asset} />
                    </span>
                    {historyTab === "withdraw" ? (
                      <span className={styles.feeCell}>{item.networkFee || "-"}</span>
                    ) : null}
                    <span>
                      <em>{localizedHistoryStatus(item.status, (message) => i18n._(message))}</em>
                    </span>
                    <span>
                      {item.reference && item.explorerUrl ? (
                        <a className={styles.referenceButton} href={item.explorerUrl} target="_blank" rel="noreferrer">
                          <span className={styles.referenceText}>{abbreviateMiddle(item.reference, 22)}</span>
                          <ExternalIcon />
                        </a>
                      ) : item.reference ? (
                        <button
                          type="button"
                          className={styles.referenceButton}
                          onClick={() => copyValue(item.reference, `history-${item.id}`)}
                        >
                          <span className={styles.referenceText}>
                            {copiedKey === `history-${item.id}`
                              ? i18n._(t`Copied`)
                              : abbreviateMiddle(item.reference, 22)}
                          </span>
                          <CopyIcon />
                        </button>
                      ) : (
                        "-"
                      )}
                    </span>
                  </div>
                ))
              ) : (
                <div className={styles.historyEmpty}>
                  {historyTab === "deposit" ? i18n._(t`No deposit history yet`) : i18n._(t`No withdrawal history yet`)}
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.viewAllButton}
              disabled={!canToggleHistory}
              onClick={() => setShowAllHistory((value) => !value)}
            >
              {historyTab === "deposit"
                ? showAllHistory
                  ? i18n._(t`Show Fewer Deposits`)
                  : i18n._(t`View All Deposits`)
                : showAllHistory
                  ? i18n._(t`Show Fewer Withdrawals`)
                  : i18n._(t`View All Withdrawals`)}
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

function depositNotice(result: CantonDepositResult): string {
  if (result.platform_credit_status === "pending") {
    return i18n._(t`Chain transfer submitted. Exchange balance is confirming.`);
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

function formatAssetAmount(value: number, asset: CantonFundsAsset): string {
  const isWrappedMarketAsset = asset === "CBTC" || asset === "cETH";
  const leadingDecimalZeroes = isWrappedMarketAsset
    ? value.toFixed(20).match(/^0\.(0+)/)?.[1].length || 0
    : 0;
  const maximumFractionDigits = isWrappedMarketAsset
    ? leadingDecimalZeroes >= 4
      ? Math.min(leadingDecimalZeroes + 4, 20)
      : 6
    : 2;

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

function CompactAssetAmount({
  value,
  asset,
}: {
  value: string | number | null | undefined;
  asset: CantonFundsAsset;
}) {
  const numeric = value === null || value === undefined ? Number.NaN : Number(value);
  const formatted = Number.isFinite(numeric) ? formatAssetAmount(numeric, asset) : "0.00";
  const compactMatch = formatted.match(/^([+-]?[\d,]+)\.(0{3,})(\d+)$/);

  if (!compactMatch) return <>{formatted}</>;
  return (
    <>
      {compactMatch[1]}.0
      <sub className={styles.tokenZeroCount}>{compactMatch[2].length}</sub>
      {compactMatch[3]}
    </>
  );
}

function HistoryAssetAmount({ value, asset }: { value: string; asset: CantonFundsAsset }) {
  const match = value.match(/^([+-])([\d,.]+)\s+\S+$/);
  if (!match) return <>{value}</>;
  const amount = match[2].replaceAll(",", "");
  const compactMatch = amount.match(/^(\d+)\.(0{3,})(\d+)$/);
  return (
    <>
      {match[1]}
      {compactMatch ? (
        <>
          {compactMatch[1]}.0
          <sub className={styles.tokenZeroCount}>{compactMatch[2].length}</sub>
          {compactMatch[3]}
        </>
      ) : (
        amount
      )}{" "}
      {asset}
    </>
  );
}

function requiredWithdrawalAmount(amount: number, asset: CantonFundsAsset): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return asset === "USDA" ? amount + FIXED_WITHDRAWAL_FEE_AMOUNT : amount;
}

function withdrawalFeeLabel(asset: CantonFundsAsset): string {
  return asset === "USDA" ? "1 USDA" : `1 USDA equivalent in ${asset}`;
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
  return updateId && isCantonScanUpdateId(updateId)
    ? `https://www.cantonscan.com/update/${encodeURIComponent(updateId)}`
    : "";
}

function isCantonScanUpdateId(value: string | undefined): boolean {
  return typeof value === "string" && /^1220[0-9a-fA-F]{64}$/.test(value.trim());
}

function cantonUpdateIdFromChainId(chainId: string | undefined): string | undefined {
  if (!chainId) return undefined;
  const [prefix, updateId, nodeId, extra] = chainId.trim().split(":");
  if (extra !== undefined || !nodeId) return undefined;
  if (prefix !== "token-standard" && prefix !== "transfer-preapproval") return undefined;
  return isCantonScanUpdateId(updateId) ? updateId : undefined;
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function mapFundsHistoryToLocalRows(history: CantonFundsHistory): LocalHistoryRow[] {
  const depositRows: LocalHistoryRow[] = history.deposits.map((item, index) => {
    const asset = walletFacingHistoryAsset(item.asset);
    const updateId = isCantonScanUpdateId(item.canton_update_id)
      ? item.canton_update_id
      : cantonUpdateIdFromChainId(item.chain_tx_id);
    const reference = updateId || item.deposit_ref || item.deposit_id;
    return {
      id: `deposit-${reference || index}`,
      type: "deposit",
      time: item.credited_at || item.created_at || new Date(0).toISOString(),
      asset,
      amount: formatHistoryAmount("+", item.amount_expected, asset),
      status: formatFundsHistoryStatus(item.status, "Submitted"),
      reference,
      dedupeKeys: [updateId, item.canton_update_id, item.chain_tx_id, item.deposit_ref, item.deposit_id].filter(
        (value): value is string => Boolean(value)
      ),
      explorerUrl: getCantonScanUpdateUrl(updateId),
    };
  });

  const withdrawalRows: LocalHistoryRow[] = history.withdrawals.map((item, index) => {
    const asset = walletFacingHistoryAsset(item.asset);
    const updateId = isCantonScanUpdateId(item.canton_update_id) ? item.canton_update_id : undefined;
    const reference = updateId || item.withdrawal_id || item.withdrawal_request_id;
    return {
      id: `withdraw-${reference || index}`,
      type: "withdraw",
      time: item.settled_at || item.submitted_at || item.requested_at || new Date(0).toISOString(),
      asset,
      amount: formatHistoryAmount("-", item.amount, asset),
      networkFee: formatNetworkFee(item.fee_amount, item.fee_wallet_symbol || item.fee_asset),
      status: formatFundsHistoryStatus(item.status, "Submitted"),
      reference,
      dedupeKeys: [updateId, item.withdrawal_id, item.withdrawal_request_id].filter(
        (value): value is string => Boolean(value)
      ),
      explorerUrl: getCantonScanUpdateUrl(updateId),
    };
  });

  return [...depositRows, ...withdrawalRows].sort(compareHistoryRowsDesc);
}

function mergeHistoryRows(serverRows: LocalHistoryRow[], currentRows: LocalHistoryRow[]): LocalHistoryRow[] {
  const merged = [...serverRows];
  const seen = new Set(serverRows.flatMap(historyRowKeys));
  for (const row of currentRows) {
    const keys = historyRowKeys(row);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    merged.push(row);
  }
  return merged.sort(compareHistoryRowsDesc).slice(0, 200);
}

function historyRowKeys(row: LocalHistoryRow): string[] {
  const values = [...(row.dedupeKeys || []), row.reference].filter(
    (value): value is string => Boolean(value)
  );
  if (values.length === 0) return [`${row.type}:${row.id}`];
  return [...new Set(values.map((value) => `${row.type}:${value}`))];
}

function compareHistoryRowsDesc(a: LocalHistoryRow, b: LocalHistoryRow): number {
  return historyTimeValue(b.time) - historyTimeValue(a.time);
}

function historyTimeValue(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function walletFacingHistoryAsset(asset: string | undefined): CantonFundsAsset {
  return walletFacingAssetSymbol(asset) || "CC";
}

function formatHistoryAmount(
  sign: "+" | "-",
  amount: string | number | null | undefined,
  asset: CantonFundsAsset
): string {
  const formattedAmount = formatOptionalAmount(amount);
  return formattedAmount ? `${sign}${formattedAmount} ${asset}` : "-";
}

function formatNetworkFee(amount: string | number | null | undefined, asset: string | undefined): string | undefined {
  const formattedAmount = formatOptionalAmount(amount);
  if (!formattedAmount) return undefined;
  return `${formattedAmount} ${walletFacingHistoryAsset(asset)}`;
}

function formatOptionalAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return trimTrailingZeroes(String(value));
}

function formatFundsHistoryStatus(status: string | undefined, fallback: string): string {
  const value = status?.trim();
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (["credited", "settled", "completed", "complete"].includes(normalized)) return "Completed";
  if (["created", "requested", "submitted", "pending"].includes(normalized)) return "Submitted";
  if (normalized === "expired") return "Expired";
  if (normalized === "failed") return "Failed";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  return value;
}

function localizedHistoryStatus(status: string, translate: (message: string) => string): string {
  switch (status) {
    case "Completed":
      return translate(t`Completed`);
    case "Submitted":
      return translate(t`Submitted`);
    case "Expired":
      return translate(t`Expired`);
    case "Failed":
      return translate(t`Failed`);
    case "Cancelled":
      return translate(t`Cancelled`);
    default:
      return status;
  }
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
      <path d="M14 4h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4 10 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12 5H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-5"
        stroke="currentColor"
        strokeWidth="1.5"
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
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M10 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m17 9 3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m6 6 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function RemoveAvatarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 20c1.2-4 4-6 7.5-6 1.7 0 3.2.5 4.4 1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="m17 18 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DepositIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 7v18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="m13.5 18.5 6.5 6.5 6.5-6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 31h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WithdrawIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M13 27 27 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 13h10v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6v5h-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19 11a7 7 0 1 0-2.1 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function logoFitClass(styles: Record<string, string>, fit: "cover" | "contain"): string | undefined {
  if (fit === "contain") return styles.logoContain;
  return undefined;
}

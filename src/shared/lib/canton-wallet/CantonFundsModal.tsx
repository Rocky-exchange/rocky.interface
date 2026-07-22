import { i18n } from "@lingui/core";
import { Trans, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import cx from "classnames";
import {
  type ChangeEvent,
  type FormEvent,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

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
  fetchFundingAccountBalance,
  fetchPlatformAccountBalance,
  fetchPlatformAccountBalances,
  fetchSpotTransferHistory,
  submitCantonWalletDeposit,
  submitPlatformWithdrawal,
  transferSpotBalance,
  waitForPlatformDepositCredit,
  type CantonDepositResult,
  type CantonFundsHistory,
  type CantonFundsAsset,
  type CantonSpotTransferHistory,
  type PlatformAccountBalances,
} from "./funds";
import { hydrateOwnProfile, setAvatar, SetAvatarError, setDisplayName, SetDisplayNameError } from "./profile";
import { useCantonSession } from "./useCantonSession";
import { useCantonWallet } from "./useCantonWallet";
import { getWalletProviderLogo } from "./walletLogos";

type Props = {
  open: boolean;
  onClose: () => void;
};

type WalletView = "assets" | "deposit" | "withdraw" | "history" | "transfer";
type OperationView = Exclude<WalletView, "assets">;
type HistoryType = "deposit" | "withdraw" | "transfer";
type HistoryFilter = "all" | HistoryType;
type LocalHistoryRow = {
  id: string;
  type: HistoryType;
  time: string;
  asset: CantonFundsAsset;
  amount: string;
  direction?: "toSpot" | "toFunding";
  networkFee?: string;
  status: string;
  reference?: string;
  dedupeKeys?: string[];
  explorerUrl?: string;
};

const FIXED_WITHDRAWAL_FEE_AMOUNT = 1;
const PENDING_DEPOSIT_CONFIRM_ATTEMPTS = 36;
const PENDING_DEPOSIT_CONFIRM_DELAY_MS = 10000;
const EMPTY_PLATFORM_BALANCES: PlatformAccountBalances = {
  USDA: null,
  CBTC: null,
  cETH: null,
  CC: null,
};

export function CantonFundsModal({ open, onClose }: Props) {
  const { i18n } = useLingui();
  const titleId = useId();
  const { connected, locked, party, provider, username, avatar } = useCantonSession();
  const { disconnect } = useCantonWallet();
  const [snapshot, setSnapshot] = useState<WalletBalanceSnapshot | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<CantonFundsAsset>("USDA");
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);
  const [platformBalanceLoading, setPlatformBalanceLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [activeView, setActiveView] = useState<WalletView>("assets");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [activeAction, setActiveAction] = useState<"deposit" | "withdraw" | "">("");
  const historyTab: "deposit" | "withdraw" = "deposit";
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [localHistory, setLocalHistory] = useState<LocalHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositConfirming, setDepositConfirming] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawAvailable, setWithdrawAvailable] = useState<number | null>(null);
  const [withdrawAvailableLoading, setWithdrawAvailableLoading] = useState(false);
  const [platformBalances, setPlatformBalances] = useState<PlatformAccountBalances>(EMPTY_PLATFORM_BALANCES);
  const [fundingAvailable, setFundingAvailable] = useState<number | null>(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState<"all" | CantonFundsAsset>("all");
  const [assetFilterOpen, setAssetFilterOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDirection, setTransferDirection] = useState<"toSpot" | "toFunding">("toFunding");
  const [transferBusy, setTransferBusy] = useState(false);
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
  const assetFilterRef = useRef<HTMLDivElement>(null);
  const assetFilterButtonRef = useRef<HTMLButtonElement>(null);
  const operationBackButtonRef = useRef<HTMLButtonElement>(null);
  const operationActionRefs = useRef<Partial<Record<OperationView, HTMLButtonElement | null>>>({});
  const assetRowRefs = useRef<Partial<Record<CantonFundsAsset, HTMLButtonElement | null>>>({});
  const originatingActionRef = useRef<OperationView | null>(null);
  const originatingAssetRowRef = useRef<CantonFundsAsset | null>(null);
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
  const dashboardRefreshing =
    walletBalanceLoading || platformBalanceLoading || withdrawAvailableLoading || depositConfirming || historyLoading;
  const historyItems = useMemo(
    () => localHistory.filter((item) => historyFilter === "all" || item.type === historyFilter),
    [historyFilter, localHistory]
  );
  const visibleHistory = useMemo(
    () => (showAllHistory ? historyItems : historyItems.slice(0, 8)),
    [historyItems, showAllHistory]
  );
  const canToggleHistory = historyItems.length > 8;
  const walletExplorerUrl = getCantonScanPartyUrl(walletParty);
  const filteredAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    return CANTON_FUNDING_ASSETS.filter(
      (asset) =>
        (assetFilter === "all" || asset.symbol === assetFilter) &&
        (!query || asset.symbol.toLowerCase().includes(query))
    );
  }, [assetFilter, assetSearch]);
  const transferSourceAvailable = transferDirection === "toFunding" ? platformBalances.USDA : fundingAvailable;
  const isAssetsDashboard = activeView === "assets";
  const operationTitle =
    activeView === "deposit"
      ? i18n._(t`Deposit`)
      : activeView === "withdraw"
        ? i18n._(t`Withdraw`)
        : activeView === "transfer"
          ? i18n._(t`Transfer`)
          : activeView === "history"
            ? i18n._(t`History`)
            : "";

  useEffect(() => {
    if (open && (!connected || locked)) onClose();
  }, [connected, locked, onClose, open]);

  const refreshBalances = useCallback(async () => {
    if (!connected) return;
    setWalletBalanceLoading(true);
    setPlatformBalanceLoading(true);

    const walletRequest = fetchWalletBalanceSnapshot()
      .then(setSnapshot)
      .finally(() => setWalletBalanceLoading(false));
    const platformRequest = fetchPlatformAccountBalances()
      .then((balances) => {
        setPlatformBalances(balances);
        setWithdrawAvailable(balances[selectedAsset]);
      })
      .finally(() => setPlatformBalanceLoading(false));
    const fundingRequest = fetchFundingAccountBalance().then(setFundingAvailable);

    await Promise.allSettled([walletRequest, platformRequest, fundingRequest]);
  }, [connected, selectedAsset]);

  const refreshWithdrawAvailable = useCallback(async () => {
    if (!connected) {
      setWithdrawAvailable(null);
      return null;
    }
    setWithdrawAvailableLoading(true);
    try {
      const available = await fetchPlatformAccountBalance(selectedAsset);
      setWithdrawAvailable(available);
      setPlatformBalances((current) => ({ ...current, [selectedAsset]: available }));
      return available;
    } finally {
      setWithdrawAvailableLoading(false);
    }
  }, [connected, selectedAsset]);

  const refreshFundsHistory = useCallback(async () => {
    if (!connected) return;
    setHistoryLoading(true);
    try {
      const [fundsResult, transfersResult] = await Promise.allSettled([
        fetchCantonFundsHistory(),
        fetchSpotTransferHistory(),
      ]);
      if (fundsResult.status === "rejected" && transfersResult.status === "rejected") throw fundsResult.reason;
      const serverRows = [
        ...(fundsResult.status === "fulfilled" ? mapFundsHistoryToLocalRows(fundsResult.value) : []),
        ...(transfersResult.status === "fulfilled" ? mapSpotTransferHistoryToLocalRows(transfersResult.value) : []),
      ].sort((left, right) => Date.parse(right.time) - Date.parse(left.time));
      setLocalHistory((currentRows) => mergeHistoryRows(serverRows, currentRows));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }, [connected]);

  const refreshWalletDashboard = useCallback(async () => {
    await Promise.all([refreshBalances(), refreshFundsHistory()]);
  }, [refreshBalances, refreshFundsHistory]);

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
    if (!open || !connected) return;
    setWithdrawAvailable(platformBalances[selectedAsset]);
  }, [connected, open, platformBalances, selectedAsset]);

  useEffect(() => {
    if (!copiedKey) return;
    const id = window.setTimeout(() => setCopiedKey(""), 1500);
    return () => window.clearTimeout(id);
  }, [copiedKey]);

  useEffect(() => {
    if (open) return;
    depositConfirmationIdRef.current += 1;
    setDepositConfirming(false);
    setAssetFilterOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (assetFilterOpen) {
        setAssetFilterOpen(false);
        assetFilterButtonRef.current?.focus();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [assetFilterOpen, onClose, open]);

  useEffect(() => {
    if (!assetFilterOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!assetFilterRef.current?.contains(event.target as Node)) setAssetFilterOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [assetFilterOpen]);

  useEffect(() => {
    if (!open) return;
    if (activeView === "assets") {
      const originatingAction = originatingActionRef.current;
      const originatingAssetRow = originatingAssetRowRef.current;
      originatingActionRef.current = null;
      originatingAssetRowRef.current = null;
      if (originatingAction) operationActionRefs.current[originatingAction]?.focus();
      else if (originatingAssetRow) assetRowRefs.current[originatingAssetRow]?.focus();
      return;
    }
    operationBackButtonRef.current?.focus();
  }, [activeView, open]);

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
      setHistoryFilter("deposit");
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
      setHistoryFilter("withdraw");
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

  async function handleTransfer(event: FormEvent) {
    event.preventDefault();
    const amount = transferAmount.trim();
    const amountNumber = Number(amount);
    const sourceAvailable = transferDirection === "toFunding" ? platformBalances.USDA : fundingAvailable;
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return;
    if (sourceAvailable !== null && amountNumber > sourceAvailable) {
      setError(i18n._(t`Insufficient balance for this transfer.`));
      return;
    }
    setTransferBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await transferSpotBalance({ asset: "USDA", amount, direction: transferDirection });
      setPlatformBalances((current) => ({ ...current, USDA: Number(result.spotFree) }));
      setFundingAvailable(Number(result.fundingAvailable));
      setTransferAmount("");
      setNotice(i18n._(t`Transfer completed.`));
      setHistoryFilter("transfer");
      await refreshWalletDashboard();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTransferBusy(false);
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

  function selectHistoryTab(nextTab: HistoryFilter) {
    setHistoryFilter(nextTab);
    setShowAllHistory(false);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <section
        className={cx(styles.modal, !isAssetsDashboard && styles.operationModal)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        {isAssetsDashboard ? (
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
                  <div id={titleId} className={styles.nameEditor}>
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
                    <span id={titleId} className={styles.brandTitle}>
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
              <button
                type="button"
                className={cx(styles.headerIconButton, styles.disconnectButton)}
                onClick={() => void handleDisconnect()}
                aria-label={i18n._(t`Disconnect`)}
                title={i18n._(t`Disconnect`)}
              >
                <LogoutIcon />
              </button>
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
        ) : (
          <OperationPageHeader
            titleId={titleId}
            title={operationTitle}
            backLabel={i18n._(t`Back to assets`)}
            closeLabel={i18n._(t`Close wallet dashboard`)}
            backButtonRef={operationBackButtonRef}
            onBack={() => setActiveView("assets")}
            onClose={onClose}
          />
        )}

        <main className={styles.walletWorkspace}>
          {isAssetsDashboard ? (
            <nav className={styles.primaryTabs} role="tablist" aria-label={i18n._(t`Wallet funds`)}>
              {(["deposit", "withdraw", "transfer", "history"] as WalletView[]).map((view) => (
                <button
                  key={view}
                  ref={(element) => {
                    operationActionRefs.current[view as OperationView] = element;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={activeView === view}
                  className={cx(styles.primaryTab, activeView === view && styles.primaryTabActive)}
                  onClick={() => {
                    originatingActionRef.current = view as OperationView;
                    originatingAssetRowRef.current = null;
                    setActiveView(view);
                    setError("");
                    setNotice("");
                  }}
                >
                  <span className={styles.primaryTabIcon} aria-hidden="true">
                    {view === "deposit" ? <DepositIcon /> : null}
                    {view === "withdraw" ? <WithdrawIcon /> : null}
                    {view === "history" ? <HistoryIcon /> : null}
                    {view === "transfer" ? <TransferIcon /> : null}
                  </span>
                  {view === "deposit" ? i18n._(t`Deposit`) : null}
                  {view === "withdraw" ? i18n._(t`Withdraw`) : null}
                  {view === "history" ? i18n._(t`History`) : null}
                  {view === "transfer" ? i18n._(t`Transfer`) : null}
                </button>
              ))}
            </nav>
          ) : null}

          {activeView === "assets" ? (
            <section className={styles.assetsView}>
              <div className={styles.assetsToolbar}>
                <div className={styles.assetFilter} ref={assetFilterRef}>
                  <button
                    ref={assetFilterButtonRef}
                    type="button"
                    className={styles.assetFilterButton}
                    aria-label={i18n._(t`Asset filter`)}
                    aria-haspopup="listbox"
                    aria-expanded={assetFilterOpen}
                    onClick={() => setAssetFilterOpen((current) => !current)}
                  >
                    <span>{assetFilter === "all" ? i18n._(t`All Assets`) : assetFilter}</span>
                    <ChevronDownIcon />
                  </button>
                  {assetFilterOpen ? (
                    <div className={styles.assetFilterMenu} role="listbox" aria-label={i18n._(t`Asset filter`)}>
                      {(["all", ...CANTON_FUNDING_ASSETS.map((asset) => asset.symbol)] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          role="option"
                          aria-selected={assetFilter === value}
                          className={cx(
                            styles.assetFilterOption,
                            assetFilter === value && styles.assetFilterOptionActive
                          )}
                          onClick={() => {
                            setAssetFilter(value);
                            setAssetFilterOpen(false);
                            assetFilterButtonRef.current?.focus();
                          }}
                        >
                          <span>{value === "all" ? i18n._(t`All Assets`) : value}</span>
                          {assetFilter === value ? <CheckIcon /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className={styles.assetSearch}>
                  <SearchIcon />
                  <input
                    value={assetSearch}
                    onChange={(event) => setAssetSearch(event.target.value)}
                    placeholder={i18n._(t`Search asset`)}
                    aria-label={i18n._(t`Search asset`)}
                  />
                </div>
                <button
                  type="button"
                  className={styles.refreshButton}
                  onClick={() => {
                    if (!dashboardRefreshing) void refreshWalletDashboard();
                  }}
                  aria-busy={dashboardRefreshing}
                  aria-label={i18n._(t`Refresh balances`)}
                >
                  <RefreshIcon />
                </button>
              </div>
              <div className={styles.assetTable}>
                <div className={styles.assetTableHead}>
                  <span>{i18n._(t`Asset`)}</span>
                  <span>{i18n._(t`Wallet Balance`)}</span>
                  <span>{i18n._(t`Exchange Balance`)}</span>
                  <span aria-hidden="true" />
                </div>
                {filteredAssets.map((asset) => {
                  const walletBalance = getBalanceAmount(walletRows, asset.symbol);
                  const exchangeBalance = platformBalances[asset.symbol];
                  return (
                    <button
                      type="button"
                      className={styles.assetRow}
                      key={asset.symbol}
                      ref={(element) => {
                        assetRowRefs.current[asset.symbol] = element;
                      }}
                      onClick={() => {
                        originatingActionRef.current = null;
                        originatingAssetRowRef.current = asset.symbol;
                        setSelectedAsset(asset.symbol);
                        setActiveView("deposit");
                      }}
                      aria-label={i18n._(t`Deposit ${asset.symbol}`)}
                    >
                      <span className={styles.assetIdentity}>
                        <TokenIcon symbol={spotMarketAssetIconSymbol(asset.symbol)} displaySize={36} />
                        <strong>{asset.symbol}</strong>
                      </span>
                      <span className={styles.assetBalanceValue}>
                        {walletBalanceLoading ? (
                          <span className={styles.assetBalanceLoading} aria-label={i18n._(t`Refreshing...`)}>
                            <RefreshIcon />
                          </span>
                        ) : walletBalance === null ? (
                          "-"
                        ) : (
                          <CompactAssetAmount value={walletBalance} asset={asset.symbol} />
                        )}{" "}
                        {walletBalance === null ? null : <small>{asset.symbol}</small>}
                      </span>
                      <span className={styles.assetBalanceValue}>
                        {exchangeBalance === null ? (
                          "-"
                        ) : (
                          <CompactAssetAmount value={exchangeBalance} asset={asset.symbol} />
                        )}{" "}
                        {exchangeBalance === null ? null : <small>{asset.symbol}</small>}
                      </span>
                      <ChevronIcon />
                    </button>
                  );
                })}
                {filteredAssets.length === 0 ? (
                  <div className={styles.historyEmpty}>{i18n._(t`No assets found`)}</div>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeView === "deposit" || activeView === "withdraw" ? (
            <section className={styles.taskView}>
              <form className={styles.compactForm} onSubmit={activeView === "deposit" ? handleDeposit : handleWithdraw}>
                <label className={styles.field}>
                  <span>{i18n._(t`Asset`)}</span>
                  <select
                    value={selectedAsset}
                    onChange={(event) => {
                      setSelectedAsset(event.target.value as CantonFundsAsset);
                      setDepositAmount("");
                      setWithdrawAmount("");
                    }}
                    aria-label={i18n._(t`Asset`)}
                  >
                    {CANTON_FUNDING_ASSETS.map((asset) => (
                      <option key={asset.symbol} value={asset.symbol}>
                        {asset.symbol}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldHeading}>
                    <span>{i18n._(t`Amount`)}</span>
                    <small>
                      {i18n._(t`Available`)}:{" "}
                      {activeView === "deposit" ? (
                        <CompactAssetAmount value={selectedWalletBalance} asset={selectedAsset} />
                      ) : withdrawAvailable === null ? (
                        "-"
                      ) : (
                        <CompactAssetAmount value={withdrawAvailable} asset={selectedAsset} />
                      )}{" "}
                      {selectedAsset}
                    </small>
                  </span>
                  <span className={styles.amountInput}>
                    <input
                      value={activeView === "deposit" ? depositAmount : withdrawAmount}
                      onChange={(event) =>
                        activeView === "deposit"
                          ? setDepositAmount(event.target.value)
                          : setWithdrawAmount(event.target.value)
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={activeView === "deposit" ? i18n._(t`Deposit amount`) : i18n._(t`Withdraw amount`)}
                    />
                    <strong>{selectedAsset}</strong>
                    <button
                      type="button"
                      onClick={() => {
                        const available = activeView === "deposit" ? selectedWalletBalance : withdrawAvailable;
                        if (available !== null && available !== undefined) {
                          const numeric = Number(available);
                          const next =
                            activeView === "withdraw" && selectedAsset === "USDA"
                              ? Math.max(0, numeric - FIXED_WITHDRAWAL_FEE_AMOUNT)
                              : numeric;
                          if (activeView === "deposit") setDepositAmount(String(next));
                          else setWithdrawAmount(String(next));
                        }
                      }}
                    >
                      {i18n._(t`Max`)}
                    </button>
                  </span>
                </label>
                {activeView === "withdraw" ? (
                  <>
                    <div className={styles.detailLine}>
                      <span>{i18n._(t`Destination`)}</span>
                      <strong title={walletParty || ""}>{abbreviateMiddle(walletParty, 34)}</strong>
                    </div>
                    <div className={styles.detailLine}>
                      <span>{i18n._(t`Network Fee`)}</span>
                      <strong>{withdrawalFeeLabel(selectedAsset)}</strong>
                    </div>
                    {withdrawAvailableError ? <div className={styles.errorText}>{withdrawAvailableError}</div> : null}
                  </>
                ) : null}
                <button
                  type="submit"
                  className={styles.primarySubmit}
                  disabled={
                    activeView === "deposit"
                      ? depositBusy || !depositAmount.trim() || !walletParty
                      : withdrawBusy || !withdrawAmount.trim() || !walletParty || withdrawExceedsAvailable
                  }
                >
                  {activeView === "deposit"
                    ? depositBusy
                      ? i18n._(t`Depositing...`)
                      : i18n._(t`Deposit`)
                    : withdrawBusy
                      ? i18n._(t`Withdrawing...`)
                      : i18n._(t`Withdraw`)}
                </button>
                {activeView === "deposit" && depositResult?.deposit_ref ? (
                  <DepositReferenceView result={depositResult} copiedKey={copiedKey} onCopy={copyValue} />
                ) : null}
              </form>
            </section>
          ) : null}

          {activeView === "transfer" ? (
            <section className={styles.taskView}>
              <form className={styles.compactForm} onSubmit={handleTransfer}>
                <div className={styles.accountRoute}>
                  <div className={styles.accountBox}>
                    <small>{i18n._(t`From`)}</small>
                    <strong>
                      {transferDirection === "toFunding" ? i18n._(t`Spot Account`) : i18n._(t`Futures Account`)}
                    </strong>
                    <span>
                      {transferSourceAvailable === null ? "-" : formatDisplayAmount(transferSourceAvailable)} USDA
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.swapButton}
                    onClick={() => setTransferDirection((value) => (value === "toFunding" ? "toSpot" : "toFunding"))}
                    aria-label={i18n._(t`Swap accounts`)}
                  >
                    <TransferIcon />
                  </button>
                  <div className={styles.accountBox}>
                    <small>{i18n._(t`To`)}</small>
                    <strong>
                      {transferDirection === "toFunding" ? i18n._(t`Futures Account`) : i18n._(t`Spot Account`)}
                    </strong>
                    <span>
                      {transferDirection === "toFunding"
                        ? fundingAvailable === null
                          ? "-"
                          : formatDisplayAmount(fundingAvailable)
                        : platformBalances.USDA === null
                          ? "-"
                          : formatDisplayAmount(platformBalances.USDA)}{" "}
                      USDA
                    </span>
                  </div>
                </div>
                <label className={styles.field}>
                  <span className={styles.fieldHeading}>
                    <span>{i18n._(t`Amount`)}</span>
                    <small>
                      {i18n._(t`Available`)}:{" "}
                      {transferSourceAvailable === null ? "-" : formatDisplayAmount(transferSourceAvailable)} USDA
                    </small>
                  </span>
                  <span className={styles.amountInput}>
                    <input
                      value={transferAmount}
                      onChange={(event) => setTransferAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={i18n._(t`Transfer amount`)}
                    />
                    <strong>USDA</strong>
                    <button
                      type="button"
                      onClick={() =>
                        transferSourceAvailable !== null && setTransferAmount(String(transferSourceAvailable))
                      }
                    >
                      {i18n._(t`Max`)}
                    </button>
                  </span>
                </label>
                <button
                  type="submit"
                  className={styles.primarySubmit}
                  disabled={transferBusy || !transferAmount.trim()}
                  aria-label={i18n._(t`Transfer USDA`)}
                >
                  {transferBusy ? i18n._(t`Transferring...`) : i18n._(t`Transfer`)}
                </button>
              </form>
            </section>
          ) : null}

          {activeView === "history" ? (
            <section className={styles.historyView}>
              <div className={styles.historyFilters} role="tablist" aria-label={i18n._(t`History type`)}>
                {(["all", "deposit", "withdraw", "transfer"] as HistoryFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    role="tab"
                    aria-selected={historyFilter === filter}
                    className={cx(historyFilter === filter && styles.historyFilterActive)}
                    onClick={() => selectHistoryTab(filter)}
                  >
                    {filter === "all"
                      ? i18n._(t`All`)
                      : filter === "deposit"
                        ? i18n._(t`Deposit`)
                        : filter === "withdraw"
                          ? i18n._(t`Withdraw`)
                          : i18n._(t`Transfer`)}
                  </button>
                ))}
              </div>
              <div className={styles.unifiedHistory}>
                {visibleHistory.length ? (
                  visibleHistory.map((item) => (
                    <div className={styles.unifiedHistoryRow} key={item.id}>
                      <span
                        className={cx(
                          styles.historyTypeIcon,
                          item.type === "deposit" && styles.historyTypeDeposit,
                          item.type === "withdraw" && styles.historyTypeWithdraw
                        )}
                      >
                        {item.type === "deposit" ? (
                          <DepositIcon />
                        ) : item.type === "withdraw" ? (
                          <WithdrawIcon />
                        ) : (
                          <TransferIcon />
                        )}
                      </span>
                      <span className={styles.historySummary}>
                        <strong>
                          {item.type === "deposit"
                            ? i18n._(t`Deposit`)
                            : item.type === "withdraw"
                              ? i18n._(t`Withdraw`)
                              : item.direction === "toSpot"
                                ? i18n._(t`Transfer In`)
                                : i18n._(t`Transfer Out`)}
                        </strong>
                        <small>{formatHistoryTime(item.time)}</small>
                      </span>
                      <span className={cx(styles.historyAmount, item.amount.startsWith("+") && styles.positiveAmount)}>
                        <HistoryAssetAmount value={item.amount} asset={item.asset} />
                        <small>{localizedHistoryStatus(item.status, (message) => i18n._(message))}</small>
                      </span>
                      <span className={styles.historyReference}>
                        {item.reference ? (
                          item.explorerUrl ? (
                            <a href={item.explorerUrl} target="_blank" rel="noreferrer">
                              <ExternalIcon />
                            </a>
                          ) : (
                            <button type="button" onClick={() => copyValue(item.reference, `history-${item.id}`)}>
                              <CopyIcon />
                            </button>
                          )
                        ) : null}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className={styles.historyEmpty}>{i18n._(t`No history yet`)}</div>
                )}
              </div>
              {canToggleHistory ? (
                <button
                  type="button"
                  className={styles.viewAllButton}
                  onClick={() => setShowAllHistory((value) => !value)}
                >
                  {showAllHistory ? i18n._(t`Show Less`) : i18n._(t`View All History`)}
                  <ChevronDownIcon />
                </button>
              ) : null}
            </section>
          ) : null}

          {notice || error ? (
            <div className={styles.messageStack}>
              {notice ? <div className={styles.noticeText}>{notice}</div> : null}
              {error ? <div className={styles.errorText}>{error}</div> : null}
            </div>
          ) : null}
        </main>

        {false && (
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

              {snapshot?.message ? <div className={styles.snapshotMessage}>{snapshot?.message}</div> : null}
            </section>

            <section className={styles.actionGrid}>
              <button
                type="button"
                className={cx(
                  styles.actionCard,
                  styles.depositAction,
                  activeAction === "deposit" && styles.actionActive
                )}
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
                      <DepositReferenceView result={depositResult!} copiedKey={copiedKey} onCopy={copyValue} />
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
                          <a
                            className={styles.referenceButton}
                            href={item.explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
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
                    {historyTab === "deposit"
                      ? i18n._(t`No deposit history yet`)
                      : i18n._(t`No withdrawal history yet`)}
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
        )}
      </section>
    </div>
  );
}

function OperationPageHeader({
  titleId,
  title,
  backLabel,
  closeLabel,
  backButtonRef,
  onBack,
  onClose,
}: {
  titleId: string;
  title: string;
  backLabel: string;
  closeLabel: string;
  backButtonRef: Ref<HTMLButtonElement>;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <header className={styles.operationPageHeader}>
      <button
        ref={backButtonRef}
        type="button"
        className={styles.operationHeaderButton}
        onClick={onBack}
        aria-label={backLabel}
        title={backLabel}
      >
        <BackIcon />
      </button>
      <h2 id={titleId}>{title}</h2>
      <button
        type="button"
        className={styles.operationHeaderButton}
        onClick={onClose}
        aria-label={closeLabel}
        title={closeLabel}
      >
        <CloseIcon />
      </button>
    </header>
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
  const leadingDecimalZeroes = isWrappedMarketAsset ? value.toFixed(20).match(/^0\.(0+)/)?.[1].length || 0 : 0;
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

function CompactAssetAmount({ value, asset }: { value: string | number | null | undefined; asset: CantonFundsAsset }) {
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
  const amount = match[2].replace(/,/g, "");
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
      dedupeKeys: [updateId, item.withdrawal_id, item.withdrawal_request_id].filter((value): value is string =>
        Boolean(value)
      ),
      explorerUrl: getCantonScanUpdateUrl(updateId),
    };
  });

  return [...depositRows, ...withdrawalRows].sort(compareHistoryRowsDesc);
}

function mapSpotTransferHistoryToLocalRows(history: CantonSpotTransferHistory): LocalHistoryRow[] {
  return history.transfers.map((item, index) => {
    const asset = walletFacingHistoryAsset(item.asset);
    return {
      id: `transfer-${item.eventId || index}`,
      type: "transfer",
      time: item.createdAt || new Date(0).toISOString(),
      asset,
      amount: formatHistoryAmount(item.direction === "toSpot" ? "+" : "-", item.amount, asset),
      direction: item.direction,
      status: "Completed",
      reference: item.eventId,
      dedupeKeys: item.eventId ? [item.eventId] : undefined,
    };
  });
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
  const values = [...(row.dedupeKeys || []), row.reference].filter((value): value is string => Boolean(value));
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

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 5v5h5M6 9a7 7 0 1 1-1 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 8v4l3 2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 8h13m0 0-3-3m3 3-3 3M19 16H6m0 0 3 3m-3-3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m14 6-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m15 15 4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
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

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

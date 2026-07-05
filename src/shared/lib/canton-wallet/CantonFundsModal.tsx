import { i18n } from "@lingui/core";
import { Trans, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import React, { type FormEvent, useCallback, useEffect, useState } from "react";

import {
  emptyWalletBalanceRows,
  fetchWalletBalanceSnapshot,
  getWalletProviderLabel,
  type WalletBalanceSnapshot,
} from "./balances";
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

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.64)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};
const modal: React.CSSProperties = {
  background: "#16161a",
  border: "1px solid #2a2a31",
  borderRadius: 12,
  padding: 24,
  width: "min(560px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  color: "#fff",
};
const section: React.CSSProperties = {
  borderTop: "1px solid #2a2a31",
  paddingTop: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  fontSize: 13,
};
const label: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "#cfd3dc",
  fontSize: 13,
};
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #33333d",
  background: "#101014",
  color: "#fff",
  fontSize: 14,
};
const button: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "#2f6fed",
  color: "#fff",
  border: "1px solid #407cff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
const secondaryButton: React.CSSProperties = {
  ...button,
  background: "#23232b",
  border: "1px solid #33333d",
  color: "#d7dae2",
};
const ghostButton: React.CSSProperties = {
  background: "transparent",
  color: "#9aa1ad",
  border: 0,
  padding: 0,
  cursor: "pointer",
  fontSize: 13,
};
const muted: React.CSSProperties = { color: "#9aa1ad", fontSize: 12, lineHeight: 1.45 };
const errorStyle: React.CSSProperties = { color: "#ff7b7b", fontSize: 13, lineHeight: 1.45 };
const noticeStyle: React.CSSProperties = { color: "#8be6b0", fontSize: 13, lineHeight: 1.45 };
const inlineButton: React.CSSProperties = {
  ...ghostButton,
  color: "#d7dae2",
  border: "1px solid #33333d",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 12,
};

export function CantonFundsModal({ open, onClose }: Props) {
  const { i18n } = useLingui();
  const { connected, party, username, provider } = useCantonSession();
  const { disconnect } = useCantonWallet();
  const [snapshot, setSnapshot] = useState<WalletBalanceSnapshot | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [depositAsset, setDepositAsset] = useState<CantonFundsAsset>("CC");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAsset, setWithdrawAsset] = useState<CantonFundsAsset>("CC");
  const [withdrawAmount, setWithdrawAmount] = useState("");
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

  const walletParty = snapshot?.party || party;
  const walletProvider = snapshot?.provider || provider;
  const walletLabel = snapshot?.label || getWalletProviderLabel(provider);
  const walletRows = snapshot?.balances ?? emptyWalletBalanceRows();
  const withdrawAmountNumber = Number(withdrawAmount.trim());
  const withdrawAmountIsPositive = Number.isFinite(withdrawAmountNumber) && withdrawAmountNumber > 0;
  const withdrawExceedsAvailable =
    withdrawAvailable !== null && withdrawAmountIsPositive && withdrawAmountNumber > withdrawAvailable;
  const withdrawAvailableText =
    withdrawAvailable === null
      ? i18n._(t`Unavailable`)
      : `${formatDisplayAmount(withdrawAvailable)} ${withdrawAsset}`;
  const withdrawAvailableError =
    withdrawExceedsAvailable && withdrawAvailable !== null
      ? i18n._(
          t`Insufficient platform balance for this withdrawal. Available: ${formatDisplayAmount(withdrawAvailable)} ${withdrawAsset}`,
        )
      : "";

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
      const available = await fetchPlatformAccountBalance(withdrawAsset);
      setWithdrawAvailable(available);
      return available;
    } finally {
      setWithdrawAvailableLoading(false);
    }
  }, [connected, withdrawAsset]);

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

  useEffect(() => {
    if (!open || !connected) return;
    void refreshBalances();
    void refreshWithdrawAvailable();
    void refreshPendingOffers();
    void refreshAutoAccept();
    const id = window.setInterval(() => {
      void refreshBalances();
      void refreshWithdrawAvailable();
      void refreshPendingOffers();
    }, 15000);
    return () => window.clearInterval(id);
  }, [connected, open, refreshAutoAccept, refreshBalances, refreshPendingOffers, refreshWithdrawAvailable]);

  useEffect(() => {
    if (!copiedKey) return;
    const id = window.setTimeout(() => setCopiedKey(""), 1500);
    return () => window.clearTimeout(id);
  }, [copiedKey]);

  if (!open) return null;

  async function handleDeposit(event: FormEvent) {
    event.preventDefault();
    setDepositBusy(true);
    setError("");
    setNotice("");
    setDepositResult(null);
    try {
      const result = await submitCantonWalletDeposit({
        provider: walletProvider,
        walletParty,
        asset: depositAsset,
        amount: depositAmount,
      });
      setDepositResult(result);
      setDepositAmount("");
      setNotice(depositNotice(result));
      await Promise.all([refreshBalances(), refreshWithdrawAvailable(), refreshPendingOffers()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDepositBusy(false);
    }
  }

  async function handleWithdraw(event: FormEvent) {
    event.preventDefault();
    setWithdrawBusy(true);
    setError("");
    setNotice("");
    try {
      const latestAvailable = await refreshWithdrawAvailable();
      const latestAvailableError =
        latestAvailable !== null && withdrawAmountIsPositive && withdrawAmountNumber > latestAvailable
          ? i18n._(
              t`Insufficient platform balance for this withdrawal. Available: ${formatDisplayAmount(latestAvailable)} ${withdrawAsset}`,
            )
          : "";
      if (latestAvailableError) {
        setError(latestAvailableError);
        return;
      }
      const result = await submitPlatformWithdrawal({
        asset: withdrawAsset,
        amount: withdrawAmount,
        destinationParty: walletParty,
      });
      setWithdrawAmount("");
      const withdrawalRef = result.withdrawal_id || result.withdrawal_request_id;
      setNotice(
        withdrawalRef ? i18n._(t`Withdrawal submitted: ${withdrawalRef}`) : i18n._(t`Withdrawal submitted`),
      );
      await Promise.all([refreshBalances(), refreshWithdrawAvailable(), refreshPendingOffers()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWithdrawBusy(false);
    }
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
          : i18n._(t`USDCx authorization submitted`),
      );
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
          : i18n._(t`No pending USDCx offers`),
      );
      await Promise.all([refreshBalances(), refreshPendingOffers()]);
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
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              <Trans>Wallet Funds</Trans>
            </div>
            <div style={muted}>{username || walletLabel}</div>
          </div>
          <button type="button" style={ghostButton} onClick={onClose}>
            <Trans>Close</Trans>
          </button>
        </div>

        <div style={section}>
          <div style={row}>
            <span style={{ color: "#9aa1ad" }}>
              <Trans>Provider</Trans>
            </span>
            <span>{walletLabel}</span>
          </div>
          <div style={row}>
            <span style={{ color: "#9aa1ad" }}>
              <Trans>Party</Trans>
            </span>
            <span style={{ textAlign: "right", wordBreak: "break-all" }}>{walletParty || "-"}</span>
            {walletParty ? (
              <button type="button" style={inlineButton} onClick={() => copyValue(walletParty, "party")}>
                {copiedKey === "party" ? i18n._(t`Copied`) : i18n._(t`Copy`)}
              </button>
            ) : null}
          </div>
          {walletRows.map((item) => (
            <div key={item.symbol} style={row}>
              <span style={{ color: "#9aa1ad" }}>{item.symbol}</span>
              <span>{item.amount ?? "-"}</span>
            </div>
          ))}
          <button
            type="button"
            style={secondaryButton}
            onClick={() => {
              void refreshBalances();
              void refreshPendingOffers();
              void refreshAutoAccept();
            }}
            disabled={balanceLoading || offersLoading}
          >
            {balanceLoading ? i18n._(t`Refreshing...`) : i18n._(t`Refresh balances`)}
          </button>
          <div style={muted}>
            <Trans>Wallet balances above are on-chain balances. Withdrawals use your platform available balance.</Trans>
          </div>
          {snapshot?.message ? <div style={muted}>{snapshot.message}</div> : null}
        </div>

        <form style={section} onSubmit={handleDeposit}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            <Trans>Deposit</Trans>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <label style={label}>
              <Trans>Asset</Trans>
              <select
                style={input}
                value={depositAsset}
                onChange={(event) => setDepositAsset(event.target.value as CantonFundsAsset)}
              >
                <option value="CC">CC</option>
                <option value="USDCx">USDCx</option>
              </select>
            </label>
            <label style={label}>
              <Trans>Amount</Trans>
              <input
                style={input}
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                inputMode="decimal"
                placeholder={depositAsset === "CC" ? "1000" : "100"}
              />
            </label>
          </div>
          <button type="submit" style={button} disabled={depositBusy || !depositAmount.trim()}>
            {depositBusy ? i18n._(t`Depositing...`) : i18n._(t`Deposit`)}
          </button>
          {depositResult?.deposit_ref ? (
            <DepositReferenceView result={depositResult} copiedKey={copiedKey} onCopy={copyValue} />
          ) : null}
        </form>

        <form style={section} onSubmit={handleWithdraw}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            <Trans>Withdraw</Trans>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <label style={label}>
              <Trans>Asset</Trans>
              <select
                style={input}
                value={withdrawAsset}
                onChange={(event) => setWithdrawAsset(event.target.value as CantonFundsAsset)}
              >
                <option value="CC">CC</option>
                <option value="USDCx">USDCx</option>
              </select>
            </label>
            <label style={label}>
              <Trans>Amount</Trans>
              <input
                style={input}
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                inputMode="decimal"
                placeholder={withdrawAsset === "CC" ? "100" : "50"}
              />
            </label>
          </div>
          <div style={muted}>
            <Trans>Destination: connected wallet party</Trans>
          </div>
          <div style={withdrawExceedsAvailable ? errorStyle : muted}>
            <Trans>Available to withdraw</Trans>:{" "}
            {withdrawAvailableLoading ? i18n._(t`Loading...`) : withdrawAvailableText}
          </div>
          {withdrawAvailableError ? <div style={errorStyle}>{withdrawAvailableError}</div> : null}
          <button
            type="submit"
            style={button}
            disabled={withdrawBusy || !withdrawAmount.trim() || !walletParty || withdrawExceedsAvailable}
          >
            {withdrawBusy ? i18n._(t`Withdrawing...`) : i18n._(t`Withdraw`)}
          </button>
        </form>

        <div style={section}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>USDCx</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {walletProvider === "rocky" ? (
              <button type="button" style={secondaryButton} onClick={handleUsdcxAuthorization} disabled={authorizationBusy}>
                {authorizationBusy ? i18n._(t`Authorizing...`) : i18n._(t`Authorize USDCx`)}
              </button>
            ) : null}
            {walletProvider === "rocky" ? (
              <button type="button" style={secondaryButton} onClick={handleToggleAutoAccept} disabled={autoAcceptBusy}>
                {autoAcceptBusy
                  ? i18n._(t`Updating auto-accept...`)
                  : autoAcceptEnabled
                    ? i18n._(t`Disable auto-accept`)
                    : i18n._(t`Enable auto-accept`)}
              </button>
            ) : null}
            {(walletProvider === "rocky" || walletProvider === "console") ? (
              <button type="button" style={secondaryButton} onClick={handleAcceptUsdcxOffers} disabled={acceptBusy}>
                {acceptBusy ? i18n._(t`Checking offers...`) : i18n._(t`Accept USDCx offers`)}
              </button>
            ) : null}
          </div>
          {walletProvider === "console" ? (
            <PendingOffersList
              offers={pendingOffers.offers}
              loading={offersLoading}
              copiedKey={copiedKey}
              onCopy={copyValue}
            />
          ) : null}
          {walletProvider === "rocky" ? (
            <div style={muted}>
              <Trans>
                Pending USDCx offers are accepted through the backend. Auto-accept is {autoAcceptStateLabel}.
              </Trans>
            </div>
          ) : null}
        </div>

        {notice ? <div style={noticeStyle}>{notice}</div> : null}
        {error ? <div style={errorStyle}>{error}</div> : null}

        <button type="button" style={ghostButton} onClick={handleDisconnect}>
          <Trans>Disconnect wallet</Trans>
        </button>
      </div>
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
  const { i18n } = useLingui();
  return (
    <div style={{ ...section, paddingTop: 10 }}>
      <div style={row}>
        <span style={{ color: "#9aa1ad" }}>
          <Trans>Deposit ref</Trans>
        </span>
        <span style={{ textAlign: "right", wordBreak: "break-all" }}>{result.deposit_ref}</span>
        <button type="button" style={inlineButton} onClick={() => onCopy(result.deposit_ref, "deposit_ref")}>
          {copiedKey === "deposit_ref" ? i18n._(t`Copied`) : i18n._(t`Copy`)}
        </button>
      </div>
      {result.target_party_id ? (
        <div style={row}>
          <span style={{ color: "#9aa1ad" }}>
            <Trans>Target party</Trans>
          </span>
          <span style={{ textAlign: "right", wordBreak: "break-all" }}>{result.target_party_id}</span>
          <button type="button" style={inlineButton} onClick={() => onCopy(result.target_party_id, "target_party")}>
            {copiedKey === "target_party" ? i18n._(t`Copied`) : i18n._(t`Copy`)}
          </button>
        </div>
      ) : null}
      {result.expires_at ? (
        <div style={row}>
          <span style={{ color: "#9aa1ad" }}>
            <Trans>Expires</Trans>
          </span>
          <span>{new Date(result.expires_at).toLocaleString()}</span>
        </div>
      ) : null}
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
      <div style={muted}>
        <Trans>Loading pending USDCx offers...</Trans>
      </div>
    );
  }
  if (offers.length === 0) {
    return (
      <div style={muted}>
        <Trans>No pending Console Wallet USDCx offers.</Trans>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {offers.slice(0, 5).map((offer) => {
        const key = offer.transferCid || `${offer.sender}-${offer.amount}`;
        return (
          <div
            key={key}
            style={{
              border: "1px solid #2a2a31",
              borderRadius: 8,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={row}>
              <span style={{ color: "#9aa1ad" }}>
                <Trans>Amount</Trans>
              </span>
              <span>{formatOfferAmount(offer)}</span>
            </div>
            <div style={row}>
              <span style={{ color: "#9aa1ad" }}>
                <Trans>Sender</Trans>
              </span>
              <span style={{ textAlign: "right", wordBreak: "break-all" }}>{offer.sender || "-"}</span>
              {offer.sender ? (
                <button type="button" style={inlineButton} onClick={() => onCopy(offer.sender, `sender-${key}`)}>
                  {copiedKey === `sender-${key}` ? i18n._(t`Copied`) : i18n._(t`Copy`)}
                </button>
              ) : null}
            </div>
            <div style={row}>
              <span style={{ color: "#9aa1ad" }}>
                <Trans>Expires</Trans>
              </span>
              <span>{formatOfferTimestamp(offer.expiredAt)}</span>
            </div>
          </div>
        );
      })}
      {offers.length > 5 ? (
        <div style={muted}>
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

function trimTrailingZeroes(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
}

function formatDisplayAmount(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
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

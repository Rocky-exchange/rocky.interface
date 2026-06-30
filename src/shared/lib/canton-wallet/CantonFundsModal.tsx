import React, { type FormEvent, useCallback, useEffect, useState } from "react";

import {
  acceptUsdcxWalletTransfers,
  authorizeUsdcxWallet,
  CantonFundsError,
  fetchPendingUsdcxOffers,
  fetchUsdcxAutoAccept,
  getCurrentReturnToPath,
  requestRockyWalletPreapproval,
  setUsdcxAutoAccept,
  submitCantonWalletDeposit,
  submitPlatformWithdrawal,
  type CantonDepositResult,
  type CantonFundsAsset,
  type UsdcxPendingOffersResult,
} from "./funds";
import {
  emptyWalletBalanceRows,
  fetchWalletBalanceSnapshot,
  getWalletProviderLabel,
  type WalletBalanceSnapshot,
} from "./balances";
import { useCantonSession } from "./useCantonSession";
import { useCantonWallet } from "./useCantonWallet";
import type { ConsoleWalletPendingOffer } from "./console";

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
  const [needsRockyAuthorization, setNeedsRockyAuthorization] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");

  const walletParty = snapshot?.party || party;
  const walletProvider = snapshot?.provider || provider;
  const walletLabel = snapshot?.label || getWalletProviderLabel(provider);
  const walletRows = snapshot?.balances ?? emptyWalletBalanceRows();

  const refreshBalances = useCallback(async () => {
    if (!connected) return;
    setBalanceLoading(true);
    try {
      setSnapshot(await fetchWalletBalanceSnapshot());
    } finally {
      setBalanceLoading(false);
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

  useEffect(() => {
    if (!open || !connected) return;
    void refreshBalances();
    void refreshPendingOffers();
    void refreshAutoAccept();
    const id = window.setInterval(() => {
      void refreshBalances();
      void refreshPendingOffers();
    }, 15000);
    return () => window.clearInterval(id);
  }, [connected, open, refreshAutoAccept, refreshBalances, refreshPendingOffers]);

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
    setNeedsRockyAuthorization(false);
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
      await Promise.all([refreshBalances(), refreshPendingOffers()]);
    } catch (err) {
      if (err instanceof CantonFundsError && err.code === "rocky_wallet_authorization_required") {
        setNeedsRockyAuthorization(true);
      }
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
      const result = await submitPlatformWithdrawal({
        asset: withdrawAsset,
        amount: withdrawAmount,
        destinationParty: walletParty,
      });
      setWithdrawAmount("");
      setNotice(`Withdrawal submitted${result.withdrawal_id || result.withdrawal_request_id ? `: ${result.withdrawal_id || result.withdrawal_request_id}` : ""}`);
      await Promise.all([refreshBalances(), refreshPendingOffers()]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWithdrawBusy(false);
    }
  }

  async function handleRockyAuthorization() {
    setAuthorizationBusy(true);
    setError("");
    setNotice("");
    try {
      const authorizeUrl = await requestRockyWalletPreapproval({ returnTo: getCurrentReturnToPath() });
      window.location.assign(authorizeUrl);
    } catch (err) {
      setError(errorMessage(err));
      setAuthorizationBusy(false);
    }
  }

  async function handleUsdcxAuthorization() {
    setAuthorizationBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authorizeUsdcxWallet();
      setNotice(result.status === "confirmed" ? "USDCx authorization confirmed" : "USDCx authorization submitted");
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
      setNotice(result.acceptedCount > 0 ? `Accepted ${result.acceptedCount} USDCx offer(s)` : "No pending USDCx offers");
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
      setNotice(result.enabled ? "USDCx auto-accept enabled" : "USDCx auto-accept disabled");
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

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Wallet Funds</div>
            <div style={muted}>{username || walletLabel}</div>
          </div>
          <button type="button" style={ghostButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={section}>
          <div style={row}>
            <span style={{ color: "#9aa1ad" }}>Provider</span>
            <span>{walletLabel}</span>
          </div>
          <div style={row}>
            <span style={{ color: "#9aa1ad" }}>Party</span>
            <span style={{ textAlign: "right", wordBreak: "break-all" }}>{walletParty || "-"}</span>
            {walletParty ? (
              <button type="button" style={inlineButton} onClick={() => copyValue(walletParty, "party")}>
                {copiedKey === "party" ? "Copied" : "Copy"}
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
            {balanceLoading ? "Refreshing..." : "Refresh balances"}
          </button>
          {snapshot?.message ? <div style={muted}>{snapshot.message}</div> : null}
        </div>

        <form style={section} onSubmit={handleDeposit}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Deposit</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <label style={label}>
              Asset
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
              Amount
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
            {depositBusy ? "Depositing..." : "Deposit"}
          </button>
          {needsRockyAuthorization ? (
            <button type="button" style={secondaryButton} onClick={handleRockyAuthorization} disabled={authorizationBusy}>
              {authorizationBusy ? "Opening authorization..." : "Authorize Rocky Wallet"}
            </button>
          ) : null}
          {depositResult?.deposit_ref ? (
            <DepositReferenceView result={depositResult} copiedKey={copiedKey} onCopy={copyValue} />
          ) : null}
        </form>

        <form style={section} onSubmit={handleWithdraw}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Withdraw</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <label style={label}>
              Asset
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
              Amount
              <input
                style={input}
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                inputMode="decimal"
                placeholder={withdrawAsset === "CC" ? "100" : "50"}
              />
            </label>
          </div>
          <div style={muted}>Destination: connected wallet party</div>
          <button type="submit" style={button} disabled={withdrawBusy || !withdrawAmount.trim() || !walletParty}>
            {withdrawBusy ? "Withdrawing..." : "Withdraw"}
          </button>
        </form>

        <div style={section}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>USDCx</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {walletProvider === "rocky" ? (
              <button type="button" style={secondaryButton} onClick={handleUsdcxAuthorization} disabled={authorizationBusy}>
                {authorizationBusy ? "Authorizing..." : "Authorize USDCx"}
              </button>
            ) : null}
            {walletProvider === "rocky" ? (
              <button type="button" style={secondaryButton} onClick={handleToggleAutoAccept} disabled={autoAcceptBusy}>
                {autoAcceptBusy
                  ? "Updating auto-accept..."
                  : autoAcceptEnabled
                    ? "Disable auto-accept"
                    : "Enable auto-accept"}
              </button>
            ) : null}
            {(walletProvider === "rocky" || walletProvider === "console") ? (
              <button type="button" style={secondaryButton} onClick={handleAcceptUsdcxOffers} disabled={acceptBusy}>
                {acceptBusy ? "Checking offers..." : "Accept USDCx offers"}
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
              Pending USDCx offers are accepted through the backend. Auto-accept is{" "}
              {autoAcceptEnabled ? "enabled" : "disabled"}.
            </div>
          ) : null}
        </div>

        {notice ? <div style={noticeStyle}>{notice}</div> : null}
        {error ? <div style={errorStyle}>{error}</div> : null}

        <button type="button" style={ghostButton} onClick={handleDisconnect}>
          Disconnect wallet
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
  return (
    <div style={{ ...section, paddingTop: 10 }}>
      <div style={row}>
        <span style={{ color: "#9aa1ad" }}>Deposit ref</span>
        <span style={{ textAlign: "right", wordBreak: "break-all" }}>{result.deposit_ref}</span>
        <button type="button" style={inlineButton} onClick={() => onCopy(result.deposit_ref, "deposit_ref")}>
          {copiedKey === "deposit_ref" ? "Copied" : "Copy"}
        </button>
      </div>
      {result.target_party_id ? (
        <div style={row}>
          <span style={{ color: "#9aa1ad" }}>Target party</span>
          <span style={{ textAlign: "right", wordBreak: "break-all" }}>{result.target_party_id}</span>
          <button type="button" style={inlineButton} onClick={() => onCopy(result.target_party_id, "target_party")}>
            {copiedKey === "target_party" ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
      {result.expires_at ? (
        <div style={row}>
          <span style={{ color: "#9aa1ad" }}>Expires</span>
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
  if (loading && offers.length === 0) {
    return <div style={muted}>Loading pending USDCx offers...</div>;
  }
  if (offers.length === 0) {
    return <div style={muted}>No pending Console Wallet USDCx offers.</div>;
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
              <span style={{ color: "#9aa1ad" }}>Amount</span>
              <span>{formatOfferAmount(offer)}</span>
            </div>
            <div style={row}>
              <span style={{ color: "#9aa1ad" }}>Sender</span>
              <span style={{ textAlign: "right", wordBreak: "break-all" }}>{offer.sender || "-"}</span>
              {offer.sender ? (
                <button type="button" style={inlineButton} onClick={() => onCopy(offer.sender, `sender-${key}`)}>
                  {copiedKey === `sender-${key}` ? "Copied" : "Copy"}
                </button>
              ) : null}
            </div>
            <div style={row}>
              <span style={{ color: "#9aa1ad" }}>Expires</span>
              <span>{formatOfferTimestamp(offer.expiredAt)}</span>
            </div>
          </div>
        );
      })}
      {offers.length > 5 ? <div style={muted}>{offers.length - 5} more pending offer(s)</div> : null}
    </div>
  );
}

function depositNotice(result: CantonDepositResult): string {
  if (result.wallet_transfer === "console_wallet_submitted") return "Console Wallet transfer submitted";
  if (result.wallet_transfer === "loop_wallet_submitted") return "Loop Wallet transfer submitted";
  if (result.wallet_transfer === "submitted" || result.wallet_transfer === "submitted_and_accepted") {
    return "Rocky Wallet transfer submitted";
  }
  if (result.deposit_ref) return "Deposit reference created";
  return "Deposit submitted";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Request failed";
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

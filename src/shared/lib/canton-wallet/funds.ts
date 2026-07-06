import {
  acceptConsoleWalletUsdcxOffers,
  getPendingConsoleWalletUsdcxOffers,
  submitConsoleWalletTransfer,
  type ConsoleWalletPendingOffer,
} from "./console";
import { submitLoopWalletTransfer } from "./loop";
import { connectRockyWallet, submitRockyWalletTransfer } from "./rocky";
import { createExchangeSession, exchangeSessionHeaders, getExchangeSessionToken } from "./session";
import type { WalletProviderId } from "./types";
import { notifyCantonSessionChange } from "./useCantonSession";

export type CantonFundsAsset = "CC" | "USDCx";
export type CantonFundsApiAsset = "CC" | "USDC";
export type CantonWalletTransferStatus =
  | "submitted"
  | "submitted_and_accepted"
  | "rocky_wallet_submitted"
  | "console_wallet_submitted"
  | "loop_wallet_submitted";

export type CantonDepositReference = {
  asset: CantonFundsApiAsset | string;
  target_party_id: string;
  deposit_ref: string;
  reason_metadata_key: string;
  expires_at: string;
  wallet_transfer?: CantonWalletTransferStatus | string;
  chain_action_policy?: {
    customer_chain_tx_window_hours: number;
    deposit_ref_required: boolean;
  };
};

export type CantonDepositResult = Partial<CantonDepositReference> & {
  asset?: CantonFundsApiAsset | string;
  amount?: string;
  available?: string;
  platform_credit_status?: "confirmed" | "pending";
  platform_available?: string;
  platform_previous_balance?: string;
  wallet_symbol?: string;
  wallet_transfer?: CantonWalletTransferStatus | string;
  transfer_kind?: string;
  canton_update_id?: string;
  accept_update_id?: string;
};

export type CantonWithdrawalResult = {
  withdrawal_id?: string;
  withdrawal_request_id?: string;
  status?: string;
  fee_amount?: string;
  fee_asset?: string;
  fee_wallet_symbol?: string;
  total_debit_amount?: string;
  [key: string]: unknown;
};

export type CantonDepositHistoryItem = {
  deposit_id?: string;
  asset?: string;
  amount_expected?: string | number | null;
  status?: string;
  deposit_ref?: string;
  chain_tx_id?: string;
  created_at?: string;
  expires_at?: string;
  credited_at?: string;
};

export type CantonWithdrawalHistoryItem = {
  withdrawal_request_id?: string;
  withdrawal_id?: string;
  status?: string;
  asset?: string;
  amount?: string | number | null;
  fee_asset?: string;
  fee_wallet_symbol?: string;
  fee_amount?: string | number | null;
  destination_party?: string;
  requested_at?: string;
  submitted_at?: string;
  settled_at?: string;
  canton_update_id?: string;
};

export type CantonFundsHistory = {
  deposits: CantonDepositHistoryItem[];
  withdrawals: CantonWithdrawalHistoryItem[];
};

export type UsdcxAuthorizationResult = {
  status?: string;
  [key: string]: unknown;
};

export type UsdcxAcceptResult = {
  acceptedCount: number;
  raw?: unknown;
};

export type UsdcxPendingOffersResult = {
  offers: ConsoleWalletPendingOffer[];
  listingAvailable: boolean;
};

export type UsdcxAutoAcceptResult = {
  enabled: boolean;
  raw?: unknown;
};

export type PlatformDepositCreditWaitInput = {
  asset: CantonFundsAsset;
  amount: string;
  previousBalance?: number | string | null;
  attempts?: number;
  delayMs?: number;
};

export class CantonFundsError extends Error {
  status?: number;
  code?: string;
  data?: unknown;

  constructor(message: string, options: { status?: number; code?: string; data?: unknown } = {}) {
    super(message);
    this.name = "CantonFundsError";
    this.status = options.status;
    this.code = options.code;
    this.data = options.data;
  }
}

const PLATFORM_DEPOSIT_SETTLEMENT_POLL_ATTEMPTS = 12;
const PLATFORM_DEPOSIT_SETTLEMENT_POLL_DELAY_MS = 2500;

export function platformDepositApiAsset(asset: CantonFundsAsset): CantonFundsApiAsset {
  return asset === "USDCx" ? "USDC" : "CC";
}

export function walletFacingDepositAsset(asset: string): CantonFundsAsset {
  return asset.trim().toUpperCase() === "USDC" ? "USDCx" : "CC";
}

export function makeWalletWithdrawalIdempotencyKey(asset: CantonFundsAsset): string {
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `wallet-withdraw-${asset.toLowerCase()}-${nonce}`;
}

export async function requestDepositReference(input: {
  asset: CantonFundsAsset;
  amount: string;
}): Promise<CantonDepositReference> {
  return requestJson<CantonDepositReference>("/v1/deposits/reference", {
    method: "POST",
    headers: sessionJsonHeaders(),
    body: JSON.stringify({
      asset: platformDepositApiAsset(input.asset),
      amount_expected: positiveAmount(input.amount),
    }),
  });
}

export async function submitCantonWalletDeposit(input: {
  provider: WalletProviderId | "";
  walletParty: string;
  asset: CantonFundsAsset;
  amount: string;
}): Promise<CantonDepositResult> {
  const amount = positiveAmount(input.amount);

  if (input.provider === "rocky" || input.provider === "console" || input.provider === "loop") {
    let previousPlatformBalance = await fetchPlatformAccountBalance(input.asset);
    const { reference, refreshedSession } = await requestWalletDepositReference({
      provider: input.provider,
      walletParty: input.walletParty,
      asset: input.asset,
      amount,
    });
    if (refreshedSession) {
      previousPlatformBalance = await fetchPlatformAccountBalance(input.asset);
    }
    await submitWalletTransfer({
      provider: input.provider,
      from: input.walletParty,
      to: reference.target_party_id,
      token: input.asset,
      amount,
      memo: reference.deposit_ref,
    });
    const creditedBalance = await waitForPlatformDepositCredit({
      asset: input.asset,
      amount,
      previousBalance: previousPlatformBalance,
    });
    return {
      ...reference,
      wallet_transfer: `${input.provider}_wallet_submitted`,
      platform_credit_status: creditedBalance === null ? "pending" : "confirmed",
      platform_available: creditedBalance === null ? undefined : String(creditedBalance),
      platform_previous_balance: previousPlatformBalance === null ? undefined : String(previousPlatformBalance),
    };
  }

  return requestDepositReference({ asset: input.asset, amount });
}

export async function submitPlatformWithdrawal(input: {
  asset: CantonFundsAsset;
  amount: string;
  destinationParty: string;
  idempotencyKey?: string;
}): Promise<CantonWithdrawalResult> {
  const destinationParty = input.destinationParty.trim();
  if (!destinationParty) {
    throw new CantonFundsError("Destination party is required", { code: "destination_party_required" });
  }

  return requestJson<CantonWithdrawalResult>("/v1/withdrawals", {
    method: "POST",
    headers: sessionJsonHeaders(),
    body: JSON.stringify({
      asset: input.asset,
      amount: positiveAmount(input.amount),
      dest_user_handle_party: destinationParty,
      idempotency_key: input.idempotencyKey || makeWalletWithdrawalIdempotencyKey(input.asset),
    }),
  });
}

export async function fetchCantonFundsHistory(): Promise<CantonFundsHistory> {
  ensureExchangeSession();
  const [depositData, withdrawalData] = await Promise.all([
    requestJson<{ deposits?: CantonDepositHistoryItem[] }>("/v1/deposits", {
      method: "GET",
      headers: exchangeSessionHeaders(),
    }),
    requestJson<{ withdrawals?: CantonWithdrawalHistoryItem[] }>("/v1/withdrawals", {
      method: "GET",
      headers: exchangeSessionHeaders(),
    }),
  ]);

  return {
    deposits: Array.isArray(depositData.deposits) ? depositData.deposits : [],
    withdrawals: Array.isArray(withdrawalData.withdrawals) ? withdrawalData.withdrawals : [],
  };
}

export async function fetchPlatformAccountBalance(asset: CantonFundsAsset): Promise<number | null> {
  const response = await fetch(`/v1/account/me/${platformDepositApiAsset(asset)}`, {
    headers: exchangeSessionHeaders(),
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { available?: unknown };
  const available =
    typeof data.available === "string" || typeof data.available === "number" ? Number(data.available) : NaN;
  return Number.isFinite(available) ? available : null;
}

export async function waitForPlatformDepositCredit(input: PlatformDepositCreditWaitInput): Promise<number | null> {
  const {
    asset,
    amount,
    attempts = PLATFORM_DEPOSIT_SETTLEMENT_POLL_ATTEMPTS,
    delayMs = PLATFORM_DEPOSIT_SETTLEMENT_POLL_DELAY_MS,
  } = input;
  const previousBalance = parseOptionalBalance(input.previousBalance);
  const expectedDelta = Number(amount);
  if (!Number.isFinite(expectedDelta) || expectedDelta <= 0) return null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const currentBalance = await fetchPlatformAccountBalance(asset);
    if (currentBalance !== null && hasExpectedDepositCredit(currentBalance, previousBalance, expectedDelta)) {
      return currentBalance;
    }
    if (attempt < attempts - 1) {
      await delay(delayMs);
    }
  }
  return null;
}

function parseOptionalBalance(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasExpectedDepositCredit(
  currentBalance: number,
  previousBalance: number | null,
  expectedDelta: number
): boolean {
  const epsilon = 0.000000001;
  if (previousBalance !== null) {
    return currentBalance + epsilon >= previousBalance + expectedDelta;
  }
  return currentBalance + epsilon >= expectedDelta;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function authorizeUsdcxWallet(): Promise<UsdcxAuthorizationResult> {
  return requestJson<UsdcxAuthorizationResult>("/v1/wallet/usdcx/authorize", {
    method: "POST",
    headers: sessionJsonHeaders(),
    body: JSON.stringify({}),
  });
}

export async function acceptUsdcxWalletTransfers(input: {
  provider: WalletProviderId | "";
  party: string;
}): Promise<UsdcxAcceptResult> {
  if (input.provider === "console") {
    const result = await acceptConsoleWalletUsdcxOffers({ party: input.party });
    return { acceptedCount: result.acceptedCount, raw: result };
  }

  const data = await requestJson<{ accepted_count?: number }>("/v1/wallet/usdcx/accept", {
    method: "POST",
    headers: sessionJsonHeaders(),
    body: JSON.stringify({}),
  });
  return {
    acceptedCount: typeof data.accepted_count === "number" ? data.accepted_count : 0,
    raw: data,
  };
}

export async function fetchPendingUsdcxOffers(input: {
  provider: WalletProviderId | "";
  party: string;
}): Promise<UsdcxPendingOffersResult> {
  if (input.provider !== "console" || !input.party) {
    return { offers: [], listingAvailable: false };
  }

  const result = await getPendingConsoleWalletUsdcxOffers({ party: input.party });
  return { offers: result.offers, listingAvailable: true };
}

export async function fetchUsdcxAutoAccept(): Promise<UsdcxAutoAcceptResult> {
  const data = await requestJson<{ enabled?: boolean }>("/v1/wallet/usdcx/auto-accept", {
    method: "GET",
    headers: exchangeSessionHeaders(),
  });
  return { enabled: data.enabled === true, raw: data };
}

export async function setUsdcxAutoAccept(enabled: boolean): Promise<UsdcxAutoAcceptResult> {
  const data = await requestJson<{ enabled?: boolean }>("/v1/wallet/usdcx/auto-accept", {
    method: "PUT",
    headers: sessionJsonHeaders(),
    body: JSON.stringify({ enabled }),
  });
  return { enabled: data.enabled === true, raw: data };
}

function sessionJsonHeaders(): HeadersInit {
  ensureExchangeSession();
  return {
    "content-type": "application/json",
    ...exchangeSessionHeaders(),
  };
}

function ensureExchangeSession() {
  if (!getExchangeSessionToken()) {
    throw new CantonFundsError("Not logged in", { code: "not_logged_in" });
  }
}

function positiveAmount(value: string): string {
  const amount = value.trim();
  const numeric = Number(amount);
  if (!amount || !Number.isFinite(numeric) || numeric <= 0) {
    throw new CantonFundsError("Amount must be positive", { code: "amount_must_be_positive" });
  }
  return amount;
}

async function requestWalletDepositReference(input: {
  provider: "rocky" | "console" | "loop";
  walletParty: string;
  asset: CantonFundsAsset;
  amount: string;
}): Promise<{ reference: CantonDepositReference; refreshedSession: boolean }> {
  try {
    return {
      reference: await requestDepositReference({ asset: input.asset, amount: input.amount }),
      refreshedSession: false,
    };
  } catch (err) {
    if (input.provider !== "rocky" || !isInvalidExchangeSessionError(err)) {
      throw err;
    }
    await refreshRockyExchangeSession(input.walletParty);
    return {
      reference: await requestDepositReference({ asset: input.asset, amount: input.amount }),
      refreshedSession: true,
    };
  }
}

async function refreshRockyExchangeSession(expectedParty: string) {
  const wallet = await connectRockyWallet();
  const connectedParty = wallet.connection.partyId || "";
  if (expectedParty && connectedParty && connectedParty !== expectedParty) {
    throw new CantonFundsError("Rocky Wallet active account does not match the logged-in party", {
      code: "wallet_party_mismatch",
    });
  }
  await createExchangeSession(wallet.connection, wallet.signMessage);
  notifyCantonSessionChange();
}

function isInvalidExchangeSessionError(err: unknown): boolean {
  if (!(err instanceof CantonFundsError)) return false;
  if (err.code === "not_logged_in") return true;

  const code = (err.code || "").toLowerCase();
  const message = err.message.toLowerCase();
  if (err.status !== 401) return false;
  return (
    code.includes("invalid session") ||
    code.includes("missing bearer") ||
    message.includes("invalid session") ||
    message.includes("missing bearer")
  );
}

async function submitWalletTransfer(input: {
  provider: "rocky" | "console" | "loop";
  from: string;
  to: string;
  token: CantonFundsAsset;
  amount: string;
  memo: string;
}) {
  if (input.provider === "rocky") {
    return submitRockyWalletTransfer({
      from: input.from,
      to: input.to,
      token: input.token,
      amount: input.amount,
      memo: input.memo,
      waitForFinalization: 5000,
    });
  }

  if (input.provider === "console") {
    return submitConsoleWalletTransfer({
      from: input.from,
      to: input.to,
      token: input.token,
      amount: input.amount,
      memo: input.memo,
      waitForFinalization: 5000,
    });
  }

  return submitLoopWalletTransfer({
    from: input.from,
    to: input.to,
    token: input.token,
    amount: input.amount,
    memo: input.memo,
  });
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await readResponseBody(response);
  if (!response.ok) {
    const { code, message } = parseFundsError(data, response.status, url);
    throw new CantonFundsError(message, {
      status: response.status,
      code,
      data,
    });
  }
  return data as T;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

function parseFundsError(data: unknown, status: number, url: string): { code?: string; message: string } {
  if (typeof data === "string") {
    const message = data.trim();
    return { message: message || fallbackErrorMessage(status, url) };
  }

  const record = isRecord(data) ? data : {};
  const nestedError = isRecord(record.error) ? record.error : {};
  const errorText = typeof record.error === "string" ? record.error : undefined;
  const code =
    stringField(record.code) ||
    stringField(record.error_code) ||
    stringField(nestedError.code) ||
    stringField(errorText);
  const message =
    stringField(record.message) ||
    stringField(record.detail) ||
    stringField(record.reason) ||
    stringField(record.error_description) ||
    stringField(nestedError.message) ||
    stringField(nestedError.detail) ||
    stringField(errorText) ||
    fallbackErrorMessage(status, url);

  return { code, message };
}

function fallbackErrorMessage(status: number, url: string): string {
  if (status === 409 && url === "/v1/withdrawals") {
    return "Withdrawal could not be submitted. Check available platform balance and retry.";
  }
  return `Request failed: ${status}`;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

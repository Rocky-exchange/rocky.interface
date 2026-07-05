import {
  acceptConsoleWalletUsdcxOffers,
  getPendingConsoleWalletUsdcxOffers,
  submitConsoleWalletTransfer,
  type ConsoleWalletPendingOffer,
} from "./console";
import { submitLoopWalletTransfer } from "./loop";
import { submitRockyWalletTransfer } from "./rocky";
import { exchangeSessionHeaders, getExchangeSessionToken } from "./session";
import type { WalletProviderId } from "./types";

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
  [key: string]: unknown;
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
    const previousPlatformBalance = await fetchPlatformAccountBalance(input.asset);
    const reference = await requestDepositReference({ asset: input.asset, amount });
    await submitWalletTransfer({
      provider: input.provider,
      from: input.walletParty,
      to: reference.target_party_id,
      token: input.asset,
      amount,
      memo: reference.deposit_ref,
    });
    const creditedBalance = await waitForPlatformDepositCredit(input.asset, amount, previousPlatformBalance);
    return {
      ...reference,
      wallet_transfer: `${input.provider}_wallet_submitted`,
      platform_credit_status: creditedBalance === null ? "pending" : "confirmed",
      platform_available: creditedBalance === null ? undefined : String(creditedBalance),
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

export async function fetchPlatformAccountBalance(asset: CantonFundsAsset): Promise<number | null> {
  const response = await fetch(`/v1/account/me/${platformDepositApiAsset(asset)}`, {
    headers: exchangeSessionHeaders(),
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { available?: unknown };
  const available = typeof data.available === "string" || typeof data.available === "number"
    ? Number(data.available)
    : NaN;
  return Number.isFinite(available) ? available : null;
}

async function waitForPlatformDepositCredit(
  asset: CantonFundsAsset,
  amount: string,
  previousBalance: number | null,
): Promise<number | null> {
  const expectedDelta = Number(amount);
  if (!Number.isFinite(expectedDelta) || expectedDelta <= 0) return null;

  for (let attempt = 0; attempt < PLATFORM_DEPOSIT_SETTLEMENT_POLL_ATTEMPTS; attempt += 1) {
    const currentBalance = await fetchPlatformAccountBalance(asset);
    if (currentBalance !== null && hasExpectedDepositCredit(currentBalance, previousBalance, expectedDelta)) {
      return currentBalance;
    }
    if (attempt < PLATFORM_DEPOSIT_SETTLEMENT_POLL_ATTEMPTS - 1) {
      await delay(PLATFORM_DEPOSIT_SETTLEMENT_POLL_DELAY_MS);
    }
  }
  return null;
}

function hasExpectedDepositCredit(
  currentBalance: number,
  previousBalance: number | null,
  expectedDelta: number,
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

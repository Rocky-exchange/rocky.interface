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
  return requestJson<CantonDepositReference>("/api/deposits/reference", {
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
    const reference = await requestDepositReference({ asset: input.asset, amount });
    await submitWalletTransfer({
      provider: input.provider,
      from: input.walletParty,
      to: reference.target_party_id,
      token: input.asset,
      amount,
      memo: reference.deposit_ref,
    });
    return {
      ...reference,
      wallet_transfer: `${input.provider}_wallet_submitted`,
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

  return requestJson<CantonWithdrawalResult>("/api/withdrawals", {
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
  const response = await fetch(`/api/perp/account/${platformDepositApiAsset(asset)}`, {
    headers: exchangeSessionHeaders(),
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { available?: unknown };
  const available = typeof data.available === "string" || typeof data.available === "number"
    ? Number(data.available)
    : NaN;
  return Number.isFinite(available) ? available : null;
}

export async function authorizeUsdcxWallet(): Promise<UsdcxAuthorizationResult> {
  return requestJson<UsdcxAuthorizationResult>("/api/wallet/usdcx/authorize", {
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

  const data = await requestJson<{ accepted_count?: number }>("/api/wallet/usdcx/accept", {
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
  const data = await requestJson<{ enabled?: boolean }>("/api/wallet/usdcx/auto-accept", {
    method: "GET",
    headers: exchangeSessionHeaders(),
  });
  return { enabled: data.enabled === true, raw: data };
}

export async function setUsdcxAutoAccept(enabled: boolean): Promise<UsdcxAutoAcceptResult> {
  const data = await requestJson<{ enabled?: boolean }>("/api/wallet/usdcx/auto-accept", {
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = isRecord(data) ? data : {};
    const code = typeof record.error === "string" ? record.error : undefined;
    throw new CantonFundsError(code || `Request failed: ${response.status}`, {
      status: response.status,
      code,
      data,
    });
  }
  return data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

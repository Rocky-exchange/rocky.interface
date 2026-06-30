import { t } from "@lingui/macro";

/**
 * Standardised error codes used across deposit/withdraw/WS paths, per
 * DESIGN-2026-0512-002 §9. Frontend logs the `code` (for Sentry/console),
 * surfaces `userMessage` (i18n-ready) to the user via toast.
 *
 * Adding a new code: extend the union, the message in `messageFor`, and any
 * inference rule below. Keep `code` strings stable — they ship to telemetry.
 */
export type AvaxErrorCode =
  | "chain_mismatch"
  | "user_rejected_approve"
  | "user_rejected_deposit"
  | "user_rejected_withdraw"
  | "user_rejected_signature"
  | "insufficient_native"
  | "below_min_deposit"
  | "below_min_withdraw"
  | "insufficient_balance"
  | "vault_paused"
  | "backend_5xx"
  | "backend_chain_mismatch"
  | "signature_expired"
  | "signature_already_used"
  | "referral_storage_not_set"
  | "unknown";

export interface MappedAvaxError {
  /** Telemetry-stable code. */
  code: AvaxErrorCode;
  /** i18n-localized user-facing toast text. */
  userMessage: string;
  /** Raw underlying error, kept for logging/Sentry. */
  cause: unknown;
}

/**
 * Inference context: callers tell the mapper which flow raised the error so
 * `UserRejectedRequestError` resolves to the right `code` (approve vs deposit
 * vs withdraw, etc.) instead of a generic "user_rejected".
 */
export type AvaxErrorScope = "approve" | "deposit" | "withdraw" | "signature" | "generic";

interface MapOptions {
  scope?: AvaxErrorScope;
  /** Minimum deposit (USDT.e) for `below_min_deposit` message. */
  minDeposit?: string;
}

/** Decode a `code: AvaxErrorCode` to its localized message. */
function messageFor(code: AvaxErrorCode, options?: MapOptions): string {
  switch (code) {
    case "chain_mismatch":
    case "backend_chain_mismatch":
      return t`Please switch your wallet to Avalanche C-Chain.`;
    case "user_rejected_approve":
      return t`USDT.e approval was cancelled.`;
    case "user_rejected_deposit":
      return t`Deposit transaction was cancelled.`;
    case "user_rejected_withdraw":
      return t`Withdraw transaction was cancelled.`;
    case "user_rejected_signature":
      return t`Signature request was cancelled.`;
    case "insufficient_native":
      return t`Not enough AVAX to pay gas (need ≈ 0.001 AVAX).`;
    case "below_min_deposit":
      return options?.minDeposit
        ? t`Minimum deposit is ${options.minDeposit} USDT.e.`
        : t`Amount is below the minimum deposit.`;
    case "below_min_withdraw":
      return t`Amount is below the minimum withdraw.`;
    case "insufficient_balance":
      return t`Insufficient balance for this withdraw.`;
    case "vault_paused":
      return t`Deposits and withdraws are temporarily paused. Please try again later.`;
    case "backend_5xx":
      return t`Service temporarily unavailable. Please try again shortly.`;
    case "signature_expired":
      return t`Withdraw authorization expired. Please request a new one.`;
    case "signature_already_used":
      return t`This withdraw request has already been processed.`;
    case "referral_storage_not_set":
      return t`Referral storage is not configured. Contact support.`;
    case "unknown":
    default:
      return t`Something went wrong. Please try again.`;
  }
}

function findCause<T>(err: unknown, predicate: (e: unknown) => e is T): T | undefined {
  let cur: any = err;
  while (cur) {
    if (predicate(cur)) return cur;
    cur = cur.cause;
  }
  return undefined;
}

const getErrorName = (e: unknown) => {
  if (!e || typeof e !== "object") return undefined;
  const record = e as { name?: string; constructor?: { name?: string } };

  return record.name ?? record.constructor?.name;
};

const getErrorMessage = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (!e || typeof e !== "object") return "";

  const record = e as { message?: unknown; shortMessage?: unknown };

  return typeof record.shortMessage === "string"
    ? record.shortMessage
    : typeof record.message === "string"
      ? record.message
      : "";
};

const isUserRejected = (e: unknown): e is Error => {
  const name = getErrorName(e);
  const message = getErrorMessage(e).toLowerCase();

  return (
    name === "UserRejectedRequestError" ||
    name === "TransactionRejectedRpcError" ||
    /user rejected|user denied|request rejected/.test(message)
  );
};

const isHttp = (e: unknown): e is { status?: number; details?: unknown; response?: { status?: number } } =>
  Boolean(e && typeof e === "object" && ("status" in e || "details" in e || "response" in e));

const isReverted = (e: unknown): e is { data?: { errorName?: string } } =>
  Boolean(e && typeof e === "object" && "data" in e && typeof (e as any).data?.errorName === "string");

function codeFromContractRevert(revertName: string | undefined): AvaxErrorCode | undefined {
  switch (revertName) {
    case "SignatureExpired":
      return "signature_expired";
    case "InvalidSignature":
    case "InvalidSigner":
    case "InvalidSignatureLength":
      return "signature_already_used";
    case "InsufficientBalance":
      return "insufficient_balance";
    case "AmountBelowMinimum":
      return "below_min_withdraw";
    case "ReferralStorageNotSet":
      return "referral_storage_not_set";
    default:
      return undefined;
  }
}

function codeFromHttpStatus(status: number | undefined, body: string | undefined): AvaxErrorCode | undefined {
  if (status && status >= 500) return "backend_5xx";
  if (status === 400 && body && /chain_mismatch/i.test(body)) return "backend_chain_mismatch";
  if (status === 422 && body && /insufficient_balance/i.test(body)) return "insufficient_balance";
  if (status === 422 && body && /below_minimum|below_min/i.test(body)) return "below_min_withdraw";
  return undefined;
}

function codeFromMessageHeuristic(message: string, scope: AvaxErrorScope): AvaxErrorCode | undefined {
  const m = message.toLowerCase();
  if (/insufficient funds|out of gas|gas required exceeds/.test(m)) return "insufficient_native";
  if (/paused/.test(m)) return "vault_paused";
  if (/chain.*mismatch|wrong network|unsupported.*chain/.test(m)) return "chain_mismatch";
  if (/already.*used|nonce/i.test(m) && scope === "withdraw") return "signature_already_used";
  return undefined;
}

/**
 * Best-effort mapping of any error thrown along the AVAX deposit/withdraw path
 * to the standardized telemetry code + user-facing message defined in
 * DESIGN-2026-0512-002 §9. Always returns a result — falls back to
 * `unknown` so callers don't have to special-case "no match".
 *
 * Order of detection: user rejection → contract revert (ABI custom errors) →
 * HTTP status → free-text message → unknown. Each path is independent so the
 * mapper stays predictable even when upstream wallet libraries wrap errors deep in `cause`
 * chains.
 */
export function mapAvaxError(err: unknown, options?: MapOptions): MappedAvaxError {
  const scope = options?.scope ?? "generic";

  // 1. User rejected
  if (findCause(err, isUserRejected)) {
    const code: AvaxErrorCode =
      scope === "approve"
        ? "user_rejected_approve"
        : scope === "deposit"
          ? "user_rejected_deposit"
          : scope === "withdraw"
            ? "user_rejected_withdraw"
            : "user_rejected_signature";
    return { code, userMessage: messageFor(code, options), cause: err };
  }

  // 2. Contract revert with known ABI error name
  const reverted = findCause(err, isReverted);
  if (reverted) {
    const revertCode = codeFromContractRevert(reverted.data?.errorName);
    if (revertCode) {
      return { code: revertCode, userMessage: messageFor(revertCode, options), cause: err };
    }
  }

  // 3. HTTP request failure (backend)
  const http = findCause(err, isHttp);
  if (http) {
    const status = http.status ?? http.response?.status;
    const body = typeof http.details === "string" ? http.details : undefined;
    const httpCode = codeFromHttpStatus(status, body);
    if (httpCode) {
      return { code: httpCode, userMessage: messageFor(httpCode, options), cause: err };
    }
  }

  // 4. Free-text fallback heuristics. Prefer curated short messages when
  // legacy EVM libraries provide them, but keep the mapper library-agnostic.
  const messageSource = getErrorMessage(err);
  const heuristic = codeFromMessageHeuristic(messageSource, scope);
  if (heuristic) {
    return { code: heuristic, userMessage: messageFor(heuristic, options), cause: err };
  }

  return { code: "unknown", userMessage: messageFor("unknown", options), cause: err };
}

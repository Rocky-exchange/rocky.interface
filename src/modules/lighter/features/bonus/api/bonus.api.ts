import { exchangeSessionHeaders } from "@/shared/lib/canton-wallet/session";

import {
  BonusApiError,
  type BonusBalanceInfoResponse,
  type BonusBalanceStatus,
  type BonusHistoryResponse,
  type BonusHistoryRow,
  type BonusLifecycleStatus,
  type BonusOrderDecision,
  type BonusRecallResponse,
  type BonusRedeemResponse,
  type BonusStatusResponse,
  type CheckBonusOrderInput,
  type FetchBonusHistoryInput,
  type RecallBonusForWithdrawInput,
  type RedeemBonusCodeInput,
} from "./bonus.types";

export { BonusApiError } from "./bonus.types";

export function fetchBonusStatus(): Promise<BonusStatusResponse> {
  return bonusRequest("/status", { method: "GET" }, isBonusStatusResponse);
}

export function fetchBonusBalanceInfo(): Promise<BonusBalanceInfoResponse> {
  return bonusRequest("/balance-info", { method: "GET" }, isBonusBalanceInfoResponse);
}

export function fetchBonusHistory(input: FetchBonusHistoryInput = {}): Promise<BonusHistoryResponse> {
  const searchParams = new URLSearchParams();
  if (input.limit !== undefined) searchParams.set("limit", String(input.limit));
  if (input.before !== undefined) searchParams.set("before", input.before);
  const query = searchParams.toString();
  return bonusRequest(`/history${query ? `?${query}` : ""}`, { method: "GET" }, isBonusHistoryResponse);
}

export function checkBonusOrder(input: CheckBonusOrderInput): Promise<BonusOrderDecision> {
  return bonusRequest(
    "/check-order",
    {
      method: "POST",
      body: JSON.stringify({ ...input, side: input.side.toLowerCase() }),
    },
    isBonusOrderDecision
  );
}

export function redeemBonusCode(input: RedeemBonusCodeInput): Promise<BonusRedeemResponse> {
  return bonusRequest(
    "/redeem-code",
    {
      method: "POST",
      body: JSON.stringify({ ...input, code: input.code.trim().toUpperCase() }),
    },
    isBonusRedeemResponse
  );
}

export function recallBonusForWithdraw(input: RecallBonusForWithdrawInput): Promise<BonusRecallResponse> {
  return bonusRequest(
    "/recall-for-withdraw",
    {
      method: "POST",
      body: JSON.stringify({ request_id: input.request_id }),
    },
    isBonusRecallResponse
  );
}

async function bonusRequest<T>(
  path: string,
  init: RequestInit,
  isValidResponse: (data: unknown) => data is T
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  new Headers(exchangeSessionHeaders()).forEach((value, key) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`/v1/bonus${path}`, {
      ...init,
      headers: headersToRecord(headers),
    });
  } catch (_error) {
    throw new BonusApiError("Bonus request failed", {
      status: 0,
      code: "bonus_request_failed",
      data: {},
    });
  }
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorData = isRecord(data) ? data : {};
    throw new BonusApiError(stringField(errorData.message) || "Bonus request failed", {
      status: response.status,
      code: stringField(errorData.error) || "bonus_request_failed",
      data: errorData,
    });
  }
  if (!isValidResponse(data)) {
    throw new BonusApiError("Invalid bonus response", {
      status: response.status,
      code: "bonus_invalid_response",
      data: {},
    });
  }
  return data;
}

function isBonusStatusResponse(data: unknown): data is BonusStatusResponse {
  return (
    isRecord(data) &&
    hasBooleanFields(data, ["has_bonus"]) &&
    hasStringFields(data, [
      "bonus_account_id",
      "grant_tier",
      "bonus_initial",
      "bonus_balance",
      "bonus_locked_in_margin",
      "bonus_consumed_total",
      "bonus_recalled_total",
      "granted_at",
      "expires_at",
    ]) &&
    hasNumberFields(data, ["max_leverage"]) &&
    isBonusLifecycleStatus(data.status)
  );
}

function isBonusBalanceInfoResponse(data: unknown): data is BonusBalanceInfoResponse {
  return (
    isRecord(data) &&
    hasStringFields(data, [
      "total_available",
      "available",
      "locked",
      "principal_free",
      "principal_locked",
      "bonus_free",
      "bonus_locked",
      "effective_withdrawable",
    ]) &&
    isBonusBalanceStatus(data.status)
  );
}

function isBonusHistoryResponse(data: unknown): data is BonusHistoryResponse {
  return (
    isRecord(data) &&
    Array.isArray(data.rows) &&
    data.rows.every(isBonusHistoryRow) &&
    typeof data.next_cursor === "string"
  );
}

function isBonusHistoryRow(data: unknown): data is BonusHistoryRow {
  return (
    isRecord(data) &&
    hasStringFields(data, [
      "id",
      "event_type",
      "total_cost",
      "bonus_share",
      "principal_share",
      "attribution_rule",
      "source_trade_id",
      "source_funding_id",
      "occurred_at",
    ])
  );
}

function isBonusOrderDecision(data: unknown): data is BonusOrderDecision {
  return (
    isRecord(data) &&
    (data.decision === "pass" || data.decision === "reject") &&
    hasStringFields(data, [
      "reason_code",
      "message",
      "bonus_balance",
      "total_available",
      "bonus_ratio_pct",
      "net_direction",
    ])
  );
}

function isBonusRedeemResponse(data: unknown): data is BonusRedeemResponse {
  return (
    isRecord(data) &&
    hasStringFields(data, ["bonus_account_id", "amount", "granted_at", "expires_at"]) &&
    hasBooleanFields(data, ["replayed"])
  );
}

function isBonusRecallResponse(data: unknown): data is BonusRecallResponse {
  return (
    isRecord(data) &&
    hasStringFields(data, ["recalled_amount", "bonus_balance_after", "bonus_locked_after", "effective_withdrawable"]) &&
    hasBooleanFields(data, ["replayed"])
  );
}

function isBonusLifecycleStatus(value: unknown): value is BonusLifecycleStatus | "" {
  return (
    value === "" || value === "active" || value === "expired_pending" || value === "recalled" || value === "frozen"
  );
}

function isBonusBalanceStatus(value: unknown): value is BonusBalanceStatus {
  return value === "no_bonus" || (isBonusLifecycleStatus(value) && value !== "");
}

function hasStringFields(data: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => typeof data[field] === "string");
}

function hasNumberFields(data: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => typeof data[field] === "number");
}

function hasBooleanFields(data: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => typeof data[field] === "boolean");
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key === "authorization") record.Authorization = value;
    else if (key === "content-type") record["Content-Type"] = value;
    else if (key === "accept") record.Accept = value;
    else record[key] = value;
  });
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

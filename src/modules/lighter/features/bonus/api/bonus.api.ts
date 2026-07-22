import { exchangeSessionHeaders } from "@/shared/lib/canton-wallet/session";

import {
  BonusApiError,
  type BonusBalanceInfoResponse,
  type BonusHistoryResponse,
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
  return bonusRequest("/status", { method: "GET" });
}

export function fetchBonusBalanceInfo(): Promise<BonusBalanceInfoResponse> {
  return bonusRequest("/balance-info", { method: "GET" });
}

export function fetchBonusHistory(input: FetchBonusHistoryInput = {}): Promise<BonusHistoryResponse> {
  const searchParams = new URLSearchParams();
  if (input.limit !== undefined) searchParams.set("limit", String(input.limit));
  if (input.before !== undefined) searchParams.set("before", input.before);
  const query = searchParams.toString();
  return bonusRequest(`/history${query ? `?${query}` : ""}`, { method: "GET" });
}

export function checkBonusOrder(input: CheckBonusOrderInput): Promise<BonusOrderDecision> {
  return bonusRequest("/check-order", {
    method: "POST",
    body: JSON.stringify({ ...input, side: input.side.toLowerCase() }),
  });
}

export function redeemBonusCode(input: RedeemBonusCodeInput): Promise<BonusRedeemResponse> {
  return bonusRequest("/redeem-code", {
    method: "POST",
    body: JSON.stringify({ ...input, code: input.code.trim().toUpperCase() }),
  });
}

export function recallBonusForWithdraw(input: RecallBonusForWithdrawInput): Promise<BonusRecallResponse> {
  return bonusRequest("/recall-for-withdraw", {
    method: "POST",
    body: JSON.stringify({ request_id: input.request_id }),
  });
}

async function bonusRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  new Headers(exchangeSessionHeaders()).forEach((value, key) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`/v1/bonus${path}`, {
    ...init,
    headers: headersToRecord(headers),
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorData = isRecord(data) ? data : {};
    throw new BonusApiError(stringField(errorData.message) || "Bonus request failed", {
      status: response.status,
      code: stringField(errorData.error) || "bonus_request_failed",
      data: errorData,
    });
  }
  return data as T;
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

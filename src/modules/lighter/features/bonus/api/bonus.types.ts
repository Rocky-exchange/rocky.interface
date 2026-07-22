export type BonusLifecycleStatus = "active" | "expired_pending" | "recalled" | "frozen";
export type BonusBalanceStatus = BonusLifecycleStatus | "no_bonus";

export type BonusStatusResponse = {
  has_bonus: boolean;
  bonus_account_id: string;
  status: BonusLifecycleStatus | "";
  grant_tier: string;
  bonus_initial: string;
  bonus_balance: string;
  bonus_locked_in_margin: string;
  bonus_consumed_total: string;
  bonus_recalled_total: string;
  max_leverage: number;
  granted_at: string;
  expires_at: string;
};

export type BonusBalanceInfoResponse = {
  total_available: string;
  available: string;
  locked: string;
  principal_free: string;
  principal_locked: string;
  bonus_free: string;
  bonus_locked: string;
  effective_withdrawable: string;
  status: BonusBalanceStatus;
};

export type BonusHistoryRow = {
  id: string;
  event_type: string;
  total_cost: string;
  bonus_share: string;
  principal_share: string;
  attribution_rule: string;
  source_trade_id: string;
  source_funding_id: string;
  occurred_at: string;
};

export type BonusHistoryResponse = {
  rows: BonusHistoryRow[];
  next_cursor: string;
};

export type BonusOrderDecision = {
  decision: "pass" | "reject";
  reason_code: string;
  message: string;
  bonus_balance: string;
  total_available: string;
  bonus_ratio_pct: string;
  net_direction: string;
};

export type BonusRedeemResponse = {
  bonus_account_id: string;
  amount: string;
  granted_at: string;
  expires_at: string;
  replayed: boolean;
};

export type BonusRecallResponse = {
  recalled_amount: string;
  bonus_balance_after: string;
  bonus_locked_after: string;
  effective_withdrawable: string;
  replayed: boolean;
};

export type FetchBonusHistoryInput = {
  limit?: number;
  before?: string;
};

export type CheckBonusOrderInput = {
  symbol: string;
  side: string;
  is_opening: boolean;
  leverage: number;
};

export type RedeemBonusCodeInput = {
  code: string;
  request_id: string;
};

export type RecallBonusForWithdrawInput = {
  request_id: string;
};

export class BonusApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data: unknown;

  constructor(message: string, options: { status: number; code: string; data: unknown }) {
    super(message);
    this.name = "BonusApiError";
    this.status = options.status;
    this.code = options.code;
    this.data = options.data;
  }
}

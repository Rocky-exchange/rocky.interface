import { exchangeSessionHeaders } from "@/shared/lib/canton-wallet/session";
import { disconnectCantonWalletSession } from "@/shared/lib/canton-wallet/sessionLogout";

const ACTIVITY_API_BASE = "/external-active";

export type MissionKey =
  | "BIND_X"
  | "FOLLOW_BOTH"
  | "LIKE_LAUNCH"
  | "NICKNAME_ROCKY"
  | "JOIN_DISCORD"
  | "QUOTE_LAUNCH"
  | "FIRST_TRADE"
  | "ORIGINAL_TWEET";

export type MissionState = "not_started" | "verifying" | "pending" | "claimable" | "claiming" | "claimed" | "retry";

export type CampaignMission = {
  key: MissionKey;
  state: MissionState;
  title: string;
  reward: string;
  activityDay?: number;
  lastErrorCode?: string | null;
};

export type MissionList = {
  missions: CampaignMission[];
  progress: {
    completedCount: number;
    claimableCount: number;
    claimedCount?: number;
    oneTimeTaskCount?: number;
    totalCount?: number;
    originalTweet?: {
      activityDay: number;
      approvedToday: number;
      pendingToday: number;
      limit: number;
    };
  };
};

export type LeaderboardEntry = {
  rank: number;
  wallet: string;
  roi: string;
  pnlUsd: string;
  effectiveVolume: string;
  effectiveTradeCount: string;
  volumeReachedAt: string;
  volume: string;
  estimatedReward: string;
};

export type LeaderboardPage = {
  status: "live" | "closing" | "under_review" | "final";
  stale: boolean;
  page: number;
  pageSize: 10;
  snapshotId: string | null;
  snapshotAt: string | null;
  checksum: string | null;
  total: number;
  entries: LeaderboardEntry[];
};

export type CampaignSummary = {
  campaignId: string;
  phase: "upcoming" | "active" | "closing" | "review" | "settled" | "archived";
  serverTime: string;
  startsAt: string;
  endsAt: string;
};

export type RewardSummary = {
  totalRewards: string;
  taskRewards: string;
  campaignRewards: string;
  referralRewards: string;
  claimable: string;
  ledgerBalance: string;
  badge: {
    status: "not_eligible" | "eligible" | "under_review" | "approved" | "rejected";
    approved: number;
    cap: number;
  };
  rPoints: { status: "coming_soon"; total: string };
  ccRewards: { status: "coming_soon" };
};

export type OgBenefits = {
  role: "NORMAL" | "OG" | "L1" | "L2";
  eligible: boolean;
  invitationCodes: Array<{
    slot: number;
    code: string;
    status: "ACTIVE" | "DISABLED";
  }>;
  trialFund: {
    status: "AVAILABLE" | "NOT_ELIGIBLE" | "CLAIMING" | "CLAIMED" | "RETRYABLE";
    amount: string;
    bonusAccountId: string | null;
    claimedAt: string | null;
  };
};

type ActivityEnvelope<T> = {
  data: T;
  meta: {
    requestId: string;
    serverTime: string;
  };
};

type ActivityErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
};

export class CampaignApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    status: number;
    retryAfterSeconds?: number;
  }) {
    super(input.message);
    this.name = "CampaignApiError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.status = input.status;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

async function activityRequest<T>(
  path: string,
  input: {
    authenticated?: boolean;
    body?: Record<string, unknown>;
    idempotencyKey?: string;
    method?: "GET" | "POST";
  } = {}
): Promise<T> {
  const headers = new Headers(input.authenticated === false ? undefined : exchangeSessionHeaders());
  if (input.body) headers.set("content-type", "application/json");
  if (input.idempotencyKey) headers.set("idempotency-key", input.idempotencyKey);
  const response = await fetch(`${ACTIVITY_API_BASE}${path}`, {
    method: input.method ?? "GET",
    headers,
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
  const payload = (await response.json()) as ActivityEnvelope<T> | ActivityErrorEnvelope;
  if (!response.ok || !("data" in payload)) {
    if (response.status === 401 && input.authenticated !== false) {
      await disconnectCantonWalletSession();
    }
    const error = "error" in payload ? payload.error : undefined;
    const retryAfterHeader = Number(response.headers.get("retry-after"));
    const retryAfterSeconds =
      Number.isSafeInteger(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined;
    throw new CampaignApiError({
      code: error?.code ?? "ACTIVITY_REQUEST_FAILED",
      message: error?.message ?? `Activity request failed with status ${response.status}.`,
      retryable: error?.retryable ?? response.status >= 500,
      status: response.status,
      ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    });
  }
  return payload.data;
}

export function getMissions(): Promise<MissionList> {
  return activityRequest<MissionList>("/v1/me/missions");
}

export async function startXOAuth(): Promise<string> {
  const result = await activityRequest<{ authorizationUrl: string }>("/v1/social/x/oauth/start");
  return result.authorizationUrl;
}

export async function startWalletBoundXOAuth(): Promise<string> {
  await activityRequest("/v1/me/campaign");
  return startXOAuth();
}

export async function startDiscordOAuth(): Promise<string> {
  const result = await activityRequest<{ authorizationUrl: string }>(
    "/v1/social/discord/oauth/start"
  );
  return result.authorizationUrl;
}

export async function startWalletBoundDiscordOAuth(): Promise<string> {
  await activityRequest("/v1/me/campaign");
  return startDiscordOAuth();
}

export function startMission(
  key: MissionKey
): Promise<{ state: MissionState; status?: string; actionUrls?: string[] }> {
  return activityRequest(`/v1/me/missions/${key}/start`, { method: "POST" });
}

export function verifyMission(key: MissionKey): Promise<{ state: MissionState; status?: string }> {
  return activityRequest(`/v1/me/missions/${key}/verify`, { method: "POST" });
}

export function submitMission(key: MissionKey, postUrl: string): Promise<{ state: MissionState; status?: string }> {
  return activityRequest(`/v1/me/missions/${key}/submissions`, {
    method: "POST",
    body: { url: postUrl },
  });
}

export function claimMission(key: MissionKey): Promise<unknown> {
  return activityRequest(`/v1/me/missions/${key}/claim`, {
    method: "POST",
    body: {},
    idempotencyKey: crypto.randomUUID(),
  });
}

export function getLeaderboard(page: number): Promise<LeaderboardPage> {
  return activityRequest<LeaderboardPage>(`/v1/campaigns/season-0/leaderboard?page=${page}`, {
    authenticated: false,
  });
}

export function getCampaign(): Promise<CampaignSummary> {
  return activityRequest<CampaignSummary>("/v1/campaigns/season-0", {
    authenticated: false,
  });
}

export function getRewards(): Promise<RewardSummary> {
  return activityRequest<RewardSummary>("/v1/me/rewards");
}

export function getOgBenefits(): Promise<OgBenefits> {
  return activityRequest<OgBenefits>("/v1/me/og-benefits");
}

export function claimOgTrialFund(): Promise<OgBenefits["trialFund"]> {
  return activityRequest<OgBenefits["trialFund"]>("/v1/me/og-benefits/trial-fund/claim", {
    method: "POST",
    body: {},
    idempotencyKey: crypto.randomUUID(),
  });
}

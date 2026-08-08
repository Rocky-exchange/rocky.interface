import { exchangeSessionHeaders } from "@/shared/lib/canton-wallet/session";

/** GET /v1/solvency/latest — field names mirror api-gateway's ReportOut. */
export type SolvencyReport = {
  report_id: string;
  snapshot_at: string;
  event_high_water: string | null;
  root_hash: string;
  liabilities: Record<string, string>;
  assets: Record<string, string> | null;
  mark_prices: Record<string, string>;
  insurance_fund: Record<string, string>;
  bad_debt: Record<string, string>;
  house_excluded: number;
  house_totals: Record<string, string>;
  user_count: number;
  status: string;
};

/** GET /v1/solvency/proof/me — mirrors api-gateway's ProofOut. */
export type SolvencyProof = {
  report_id: string;
  snapshot_at: string;
  root_hash: string;
  leaf: {
    user_id: string;
    leaf_index: number;
    balances: Record<string, string>;
    salt: string;
    leaf_hash: string;
  };
  path: {
    sibling_hash: string;
    sibling_sums: Record<string, string>;
    sibling_on_left: boolean;
  }[];
};

export class SolvencyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, headers: HeadersInit): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json", ...headers } });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the HTTP status message
    }
    throw new SolvencyApiError(message, response.status);
  }
  return (await response.json()) as T;
}

/** `null` when no report has been published yet (404). */
export async function fetchLatestReport(): Promise<SolvencyReport | null> {
  try {
    return await getJson<SolvencyReport>("/v1/solvency/latest", {});
  } catch (e) {
    if (e instanceof SolvencyApiError && e.status === 404) return null;
    throw e;
  }
}

export function fetchMyProof(): Promise<SolvencyProof> {
  return getJson<SolvencyProof>("/v1/solvency/proof/me", exchangeSessionHeaders());
}

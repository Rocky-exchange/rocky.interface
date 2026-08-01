import { exchangeSessionHeaders } from "@/shared/lib/canton-wallet/session";

export type SwapOrder = {
  swapId: string;
  clientSwapId: string;
  symbol: string;
  side: "BUY" | "SELL";
  requestedBase: string;
  acceptedBase: string;
  slippageBps: number;
  referencePrice: string;
  protectionPrice: string;
  status: string;
  filledBase?: string | null;
  fee?: string | null;
  feeAsset?: string | null;
  gasFeeUsd?: string | null;
  gasFeeAsset?: string | null;
  gasFeeAmount?: string | null;
  amountIn?: string | null;
  amountOut?: string | null;
  cantonUpdateId?: string | null;
  lastError?: string | null;
};

export class SwapApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...exchangeSessionHeaders(),
      ...(init.headers || {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!response.ok)
    throw new SwapApiError(
      response.status,
      body.code || "swap_failed",
      body.message || `Swap failed (${response.status})`
    );
  return body as T;
}

export const swapApi = {
  create(input: { clientSwapId: string; symbol: string; side: "BUY" | "SELL"; amount: string; slippageBps: number }) {
    return request<SwapOrder>("/v1/swaps", { method: "POST", body: JSON.stringify(input) });
  },
  get(swapId: string) {
    return request<SwapOrder>(`/v1/swaps/${encodeURIComponent(swapId)}`, { method: "GET" });
  },
};

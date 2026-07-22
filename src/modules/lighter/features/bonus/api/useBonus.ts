import { useCallback, useEffect, useMemo } from "react";
import useSWR, { type SWRResponse } from "swr";
import useSWRInfinite from "swr/infinite";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { fetchBonusBalanceInfo, fetchBonusHistory, fetchBonusStatus } from "./bonus.api";
import type {
  BonusApiError,
  BonusBalanceInfoResponse,
  BonusHistoryResponse,
  BonusHistoryRow,
  BonusStatusResponse,
} from "./bonus.types";

export const BONUS_DATA_CHANGED_EVENT = "rocky:bonus-data-changed";

type BonusHistoryKey = readonly [
  resource: "bonus-history",
  party: string,
  limit: number | undefined,
  before: string | undefined,
];

export type UseBonusHistoryResult = {
  rows: BonusHistoryRow[];
  error?: BonusApiError;
  isLoading: boolean;
  hasMore: boolean;
  loadMore(): void;
  refresh(): Promise<unknown>;
};

export function notifyBonusDataChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BONUS_DATA_CHANGED_EVENT));
  }
}

export function invalidateBonusData(): void {
  notifyBonusDataChanged();
}

export function useBonusStatus(): SWRResponse<BonusStatusResponse, BonusApiError> {
  const { connected, party } = useCantonSession();
  const response = useSWR<BonusStatusResponse, BonusApiError>(
    connected && party ? ["bonus-status", party] : null,
    fetchBonusStatus,
    { refreshInterval: 30_000 }
  );
  useBonusDataChanged(response.mutate);
  return response;
}

export function useBonusBalance(): SWRResponse<BonusBalanceInfoResponse, BonusApiError> {
  const { connected, party } = useCantonSession();
  const response = useSWR<BonusBalanceInfoResponse, BonusApiError>(
    connected && party ? ["bonus-balance", party] : null,
    fetchBonusBalanceInfo,
    { refreshInterval: 10_000 }
  );
  useBonusDataChanged(response.mutate);
  return response;
}

export function useBonusHistory(limit?: number): UseBonusHistoryResult {
  const { connected, party } = useCantonSession();
  const getKey = useCallback(
    (pageIndex: number, previousPageData: BonusHistoryResponse | null): BonusHistoryKey | null => {
      if (!connected || !party) return null;
      if (pageIndex > 0 && !previousPageData?.next_cursor) return null;

      return ["bonus-history", party, limit, pageIndex === 0 ? undefined : previousPageData?.next_cursor];
    },
    [connected, limit, party]
  );
  const response = useSWRInfinite<BonusHistoryResponse, BonusApiError>(
    getKey,
    ([, , pageLimit, before]: BonusHistoryKey) => fetchBonusHistory({ limit: pageLimit, before }),
    { revalidateFirstPage: false }
  );
  useBonusDataChanged(response.mutate);

  const rows = useMemo(() => response.data?.flatMap((page) => page.rows) ?? [], [response.data]);
  const lastPage = response.data?.[response.data.length - 1];
  const hasMore = Boolean(lastPage?.next_cursor);
  const isLoadingMore =
    response.isLoading ||
    (response.size > 0 && response.data !== undefined && response.data[response.size - 1] === undefined);
  const loadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      void response.setSize((currentSize) => currentSize + 1);
    }
  }, [hasMore, isLoadingMore, response]);
  const refresh = useCallback(() => response.mutate(), [response]);

  return {
    rows,
    error: response.error,
    isLoading: isLoadingMore,
    hasMore,
    loadMore,
    refresh,
  };
}

function useBonusDataChanged(mutate: () => Promise<unknown>): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const revalidate = () => {
      void mutate();
    };
    window.addEventListener(BONUS_DATA_CHANGED_EVENT, revalidate);
    return () => window.removeEventListener(BONUS_DATA_CHANGED_EVENT, revalidate);
  }, [mutate]);
}

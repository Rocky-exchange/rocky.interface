import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWR, { type Cache, type SWRResponse, useSWRConfig } from "swr";
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

type BonusDataMutate = () => Promise<unknown>;
type MountedBonusData = { mutate: BonusDataMutate };
type ProviderMutates = Map<string, Set<MountedBonusData>>;

const mountedBonusData = new Map<Cache, ProviderMutates>();
let removeBonusDataChangedListener: (() => void) | undefined;

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
  const { cache } = useSWRConfig();
  const logicalKey = connected && party ? JSON.stringify(["bonus-status", party]) : null;
  const response = useSWR<BonusStatusResponse, BonusApiError>(
    connected && party ? ["bonus-status", party] : null,
    fetchBonusStatus,
    { refreshInterval: 30_000 }
  );
  useBonusDataChanged(cache, logicalKey, response.mutate);
  return response;
}

export function useBonusBalance(): SWRResponse<BonusBalanceInfoResponse, BonusApiError> {
  const { connected, party } = useCantonSession();
  const { cache } = useSWRConfig();
  const logicalKey = connected && party ? JSON.stringify(["bonus-balance", party]) : null;
  const response = useSWR<BonusBalanceInfoResponse, BonusApiError>(
    connected && party ? ["bonus-balance", party] : null,
    fetchBonusBalanceInfo,
    { refreshInterval: 10_000 }
  );
  useBonusDataChanged(cache, logicalKey, response.mutate);
  return response;
}

export function useBonusHistory(limit?: number): UseBonusHistoryResult {
  const { connected, party } = useCantonSession();
  const { cache } = useSWRConfig();
  const logicalKey = connected && party ? JSON.stringify(["bonus-history", party, limit]) : null;
  const loadMoreInFlightRef = useRef(false);
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
    ([, , pageLimit, before]: BonusHistoryKey) => fetchBonusHistory({ limit: pageLimit, before })
  );
  const { data, error, isLoading: isInitialLoading, isValidating, mutate, setSize, size } = response;
  useBonusDataChanged(cache, logicalKey, mutate);

  useEffect(() => {
    loadMoreInFlightRef.current = false;
  }, [limit, party]);

  const rows = useMemo(() => data?.flatMap((page) => page.rows) ?? [], [data]);
  const loadedPageCount = data?.length ?? 0;
  const lastPage = data?.[loadedPageCount - 1];
  const hasMore = Boolean(lastPage?.next_cursor);
  const isLoading = isInitialLoading || isValidating;
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || loadMoreInFlightRef.current) return;

    loadMoreInFlightRef.current = true;
    const nextSize = loadedPageCount < size ? size : size + 1;
    const releaseLock = () => {
      loadMoreInFlightRef.current = false;
    };
    void setSize(nextSize).then(releaseLock, releaseLock);
  }, [hasMore, isLoading, loadedPageCount, setSize, size]);
  const refresh = useCallback(() => mutate(), [mutate]);

  return {
    rows,
    error,
    isLoading,
    hasMore,
    loadMore,
    refresh,
  };
}

function useBonusDataChanged(cache: Cache, logicalKey: string | null, mutate: BonusDataMutate): void {
  useEffect(() => {
    if (typeof window === "undefined" || !logicalKey) return;

    let providerMutates = mountedBonusData.get(cache);
    if (!providerMutates) {
      providerMutates = new Map();
      mountedBonusData.set(cache, providerMutates);
    }
    let keyMutates = providerMutates.get(logicalKey);
    if (!keyMutates) {
      keyMutates = new Set();
      providerMutates.set(logicalKey, keyMutates);
    }
    const registration = { mutate };
    keyMutates.add(registration);
    ensureBonusDataChangedListener();

    return () => {
      keyMutates?.delete(registration);
      if (keyMutates?.size === 0) providerMutates?.delete(logicalKey);
      if (providerMutates?.size === 0) mountedBonusData.delete(cache);
      if (mountedBonusData.size === 0) {
        removeBonusDataChangedListener?.();
        removeBonusDataChangedListener = undefined;
      }
    };
  }, [cache, logicalKey, mutate]);
}

function ensureBonusDataChangedListener(): void {
  if (removeBonusDataChangedListener || typeof window === "undefined") return;

  window.addEventListener(BONUS_DATA_CHANGED_EVENT, revalidateMountedBonusData);
  removeBonusDataChangedListener = () =>
    window.removeEventListener(BONUS_DATA_CHANGED_EVENT, revalidateMountedBonusData);
}

function revalidateMountedBonusData(): void {
  mountedBonusData.forEach((providerMutates) => {
    providerMutates.forEach((keyMutates) => {
      const registration = keyMutates.values().next().value;
      if (registration) void registration.mutate();
    });
  });
}

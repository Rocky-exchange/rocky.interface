import { useCallback } from "react";

import type { AnyChainId, ContractsChainId } from "sdk/configs/chains";

import type { CacheKey, MulticallRequestConfig, MulticallResult, SkipKey } from "./types";

/**
 * Canton runtime compatibility shim.
 *
 * Legacy GMX/Lighter hooks still import `useMulticall` for shared data shapes, but Rocky does not execute EVM
 * multicalls. Returning an inert query result keeps dormant hooks compilable without pulling RPC, ABI, or worker code
 * into the active app.
 */
export function useMulticall<
  TConfig extends MulticallRequestConfig<any>,
  TResult = MulticallResult<TConfig>,
  TChainId extends AnyChainId = ContractsChainId,
>(
  chainId: TChainId | undefined,
  name: string,
  params: {
    key: CacheKey | SkipKey;
    refreshInterval?: number | null;
    disableBatching?: boolean;
    clearUnusedKeys?: boolean;
    keepPreviousData?: boolean;
    request: TConfig | ((chainId: TChainId, key: CacheKey) => TConfig | Promise<TConfig>);
    parseResponse?: (result: MulticallResult<TConfig>, chainId: TChainId, key: CacheKey) => TResult;
  }
) {
  void chainId;
  void name;
  void params;

  const mutate = useCallback(async (..._args: any[]): Promise<TResult | undefined> => undefined, []);

  return {
    data: undefined as TResult | undefined,
    mutate,
    isLoading: false,
    error: undefined as Error | undefined,
  };
}

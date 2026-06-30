import { useMemo } from "react";

import type { AnyChainId } from "config/chains";
import { getFallbackRpcUrl } from "config/chains";
import { getCurrentRpcUrls } from "lib/rpc/bestRpcTracker";

type DisabledProvider = any;

function createDisabledProvider(chainId: number | undefined, url?: string): DisabledProvider {
  const error = () => Promise.reject(new Error("EVM JSON-RPC providers are disabled in the Canton runtime"));

  return {
    chainId,
    url,
    provider: undefined,
    call: error,
    getFeeData: error,
    getNetwork: error,
    getBlockNumber: error,
    destroy: () => undefined,
  };
}

export function getProvider<TSigner>(signer: TSigner | undefined, chainId: number): any {
  if (signer) {
    return signer;
  }

  return createDisabledProvider(chainId, getCurrentRpcUrls(chainId).primary);
}

export function getWsProvider(chainId: AnyChainId) {
  return createDisabledProvider(chainId, getCurrentRpcUrls(chainId).primary);
}

export function getFallbackProvider(chainId: number) {
  return createDisabledProvider(chainId, getFallbackRpcUrl(chainId));
}

export function useJsonRpcProvider(chainId: number | undefined) {
  const provider: any = useMemo(
    () => (chainId ? createDisabledProvider(chainId, getCurrentRpcUrls(chainId).primary) : undefined),
    [chainId]
  );

  return { provider };
}

export function isWebsocketProvider(_provider: any): _provider is { websocket: WebSocket } {
  return false;
}

export enum WSReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export function isProviderInClosedState(_wsProvider: { websocket: WebSocket }) {
  return true;
}

export function closeWsConnection(_wsProvider: { websocket: WebSocket }) {
  return undefined;
}

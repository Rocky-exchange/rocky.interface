import { useEffect, useState } from "react";

import {
  type ContractsChainId,
  type SettlementChainId,
  type SourceChainId,
  DEFAULT_CHAIN_ID,
  isContractsChain,
} from "config/chains";
import { isDevelopment } from "config/env";
import { SELECTED_NETWORK_LOCAL_STORAGE_KEY } from "config/localStorage";
import { isSettlementChain, isSourceChain } from "config/multichain";
import { areChainsRelated } from "./areChainsRelated";

const IS_DEVELOPMENT = isDevelopment();

const INITIAL_CHAIN_ID: ContractsChainId = DEFAULT_CHAIN_ID;

function getStoredChainId() {
  const rawChainId = localStorage.getItem(SELECTED_NETWORK_LOCAL_STORAGE_KEY);
  return rawChainId ? parseInt(rawChainId) : undefined;
}

function resolveDisplayedChainId(
  settlementChainId: SettlementChainId,
  storedChainId = getStoredChainId()
): ContractsChainId {
  if (storedChainId && isContractsChain(storedChainId, IS_DEVELOPMENT)) {
    return storedChainId;
  }

  if (storedChainId && isSourceChain(storedChainId)) {
    return settlementChainId;
  }

  return INITIAL_CHAIN_ID;
}

function resolveSourceChainId(settlementChainId: SettlementChainId, storedChainId = getStoredChainId()) {
  if (
    storedChainId &&
    isSourceChain(storedChainId) &&
    !isSettlementChain(storedChainId) &&
    areChainsRelated(settlementChainId, storedChainId)
  ) {
    return storedChainId;
  }

  return undefined;
}

/**
 * This returns default chainId if chainId is not supported or not found
 */
export function useChainIdImpl(settlementChainId: SettlementChainId): {
  chainId: ContractsChainId;
  isConnectedToChainId?: boolean;
  /**
   * Guaranteed to be related to the settlement chain in `chainId`
   */
  srcChainId?: SourceChainId;
} {
  const [displayedChainId, setDisplayedChainId] = useState(() => resolveDisplayedChainId(settlementChainId));
  const [srcChainId, setSrcChainId] = useState<SourceChainId | undefined>(() => resolveSourceChainId(settlementChainId));

  useEffect(() => {
    const storedChainId = getStoredChainId();
    setDisplayedChainId(resolveDisplayedChainId(settlementChainId, storedChainId));
    setSrcChainId(resolveSourceChainId(settlementChainId, storedChainId));
  }, [settlementChainId]);

  useEffect(() => {
    const switchNetworkHandler = (switchNetworkInfo: CustomEvent<{ chainId: number }>) => {
      const newChainId = switchNetworkInfo.detail.chainId;
      if (isContractsChain(newChainId, IS_DEVELOPMENT) || isSourceChain(newChainId)) {
        localStorage.setItem(SELECTED_NETWORK_LOCAL_STORAGE_KEY, newChainId.toString());
        setDisplayedChainId(resolveDisplayedChainId(settlementChainId, newChainId));
        setSrcChainId(resolveSourceChainId(settlementChainId, newChainId));
      }
    };
    document.addEventListener("networkChange", switchNetworkHandler);
    return () => {
      document.removeEventListener("networkChange", switchNetworkHandler);
    };
  }, [settlementChainId]);

  return { chainId: displayedChainId, isConnectedToChainId: true, srcChainId };
}

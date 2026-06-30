import { type ContractsChainId, type SourceChainId } from "config/chains";

import type { MultichainAction } from "./codecs/CodecUiHelper";

export function useMultichainDepositNetworkComposeGas(opts?: {
  enabled?: boolean;
  action?: MultichainAction;
  tokenAddress?: string;
}): {
  composeGas: bigint | undefined;
} {
  void opts;
  return { composeGas: undefined };
}

export async function estimateMultichainDepositNetworkComposeGas(_params: {
  action?: MultichainAction;
  chainId: ContractsChainId;
  account: string;
  srcChainId: SourceChainId;
  tokenAddress: string;
  settlementChainPublicClient: unknown;
}): Promise<bigint> {
  throw new Error("Multichain compose gas estimation is not available in Canton mode");
}

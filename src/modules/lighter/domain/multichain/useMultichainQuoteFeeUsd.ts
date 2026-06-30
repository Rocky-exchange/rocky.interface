import type { AnyChainId } from "config/chains";

import type { BridgeSendQuote, BridgeTokenQuote } from "./types";

export function useMultichainQuoteFeeUsd(_params: {
  quoteSend: BridgeSendQuote | undefined;
  quoteOft: BridgeTokenQuote | undefined;
  unwrappedTokenAddress: string | undefined;
  sourceChainId: AnyChainId | undefined;
  targetChainId: AnyChainId | undefined;
}): {
  networkFee: bigint | undefined;
  networkFeeUsd: bigint | undefined;
  protocolFeeAmount: bigint | undefined;
  protocolFeeUsd: bigint | undefined;
  amountReceivedLD: bigint | undefined;
} {
  return {
    networkFee: undefined,
    networkFeeUsd: undefined,
    protocolFeeAmount: undefined,
    protocolFeeUsd: undefined,
    amountReceivedLD: undefined,
  };
}

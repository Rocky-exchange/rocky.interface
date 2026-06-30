import type { SourceChainId } from "config/chains";
import type { Token, TokenPrices } from "domain/tokens";

export type TokenChainData = Token & {
  sourceChainId: SourceChainId;
  sourceChainDecimals: number;
  sourceChainPrices: TokenPrices | undefined;
  sourceChainBalance: bigint | undefined;
};

export type MultichainFundingHistoryItem = {
  id: string;
  operation: "deposit" | "withdrawal";
  step: "executed" | "received" | "sent" | "submitted";
  settlementChainId: number;
  sourceChainId: number;
  account: string;
  token: string;
  sentAmount: bigint;
  receivedAmount: bigint | undefined;
  sentTxn: string | undefined;
  sentTimestamp: number;
  receivedTxn: string | undefined;
  receivedTimestamp: number | undefined;
  isExecutionError: boolean | null | undefined;
  executedTxn: string | undefined;
  executedTimestamp: number | undefined;
  source?: "optimistic" | "ws";
};

export type StrippedGeneratedType<T> = Omit<T, keyof [] | `${number}`>;

export type BridgeOutParams = {
  bridgeOutTokens: string[];
  bridgeOutAmounts: bigint[];
  minBridgeOutAmounts: bigint[];
  bridgeOutProvider: string;
  data: string;
};

export type BridgeEndpointId = 40161 | 40231 | 40232 | 30184 | 30110 | 30106 | 30102;

export type BridgeTokenQuote = {
  limit: {
    minAmountLD?: bigint;
    maxAmountLD?: bigint;
  };
  feeDetails: {
    feeAmountLD?: bigint;
  }[];
  receipt: {
    amountReceivedLD?: bigint;
  };
};

export type BridgeSendQuote = {
  nativeFee: bigint;
  bridgeTokenFee: bigint;
};

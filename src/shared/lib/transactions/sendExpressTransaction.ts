import type { ContractsChainId } from "config/chains";

import type { TransactionWaiterResult } from "./types";

export type ExpressTxnData = {
  callData: string;
  to: string;
  feeToken: string;
  feeAmount: bigint;
};

export type ExpressTxnResult = {
  taskId: string;
  wait: () => Promise<TransactionWaiterResult>;
};

const DISABLED_MESSAGE = "Express transactions are disabled in the Canton runtime";

export const GELATO_API_KEYS: Partial<Record<ContractsChainId, string>> = {};

export async function sendExpressTransaction(_p: {
  chainId: ContractsChainId;
  txnData: ExpressTxnData;
  isSponsoredCall: boolean;
}): Promise<ExpressTxnResult> {
  throw new Error(DISABLED_MESSAGE);
}

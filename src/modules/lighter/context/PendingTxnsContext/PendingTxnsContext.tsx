import { createContext, Dispatch, ReactNode, SetStateAction, useContext, useMemo, useState } from "react";

import type { OrderMetricId } from "lib/metrics";

export type PendingTransactionData = {
  estimatedExecutionFee: bigint;
  estimatedExecutionGasLimit: bigint;
};

export type PendingTransaction = {
  hash: string;
  message: ReactNode | undefined;
  messageDetails?: ReactNode;
  metricId?: OrderMetricId;
  data?: PendingTransactionData;
};

export type SetPendingTransactions = Dispatch<SetStateAction<PendingTransaction[]>>;

export type PendingTxnsContextType = {
  pendingTxns: PendingTransaction[];
  setPendingTxns: SetPendingTransactions;
};

export const PendingTxnsContext = createContext<PendingTxnsContextType>({
  pendingTxns: [],
  setPendingTxns: () => null,
});

export function usePendingTxns() {
  return useContext(PendingTxnsContext);
}

export function PendingTxnsContextProvider({ children }: { children: ReactNode }) {
  const [pendingTxns, setPendingTxns] = useState<PendingTransaction[]>([]);
  const state = useMemo(() => ({ pendingTxns, setPendingTxns }), [pendingTxns]);

  return <PendingTxnsContext.Provider value={state}>{children}</PendingTxnsContext.Provider>;
}

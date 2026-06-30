import type { ReactNode } from "react";

import type { PendingTransactionData, SetPendingTransactions } from "@/modules/lighter/context/PendingTxnsContext";
import type { OrderMetricId } from "lib/metrics/types";

export type ContractGasPriceData =
  | {
      gasPrice: bigint;
    }
  | {
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    };

/**
 * @deprecated EVM contract calls are disabled in the Canton runtime.
 */
export async function callContract(
  _chainId: number,
  _contract: unknown,
  _method: string,
  _params: unknown,
  _opts: {
    value?: bigint | number;
    gasLimit?: bigint | number;
    gasPriceData?: ContractGasPriceData;
    detailsMsg?: ReactNode;
    sentMsg?: string;
    successMsg?: string;
    successDetailsMsg?: ReactNode;
    hideSentMsg?: boolean;
    hideErrorMsg?: boolean;
    hideSuccessMsg?: boolean;
    showPreliminaryMsg?: boolean;
    failMsg?: string;
    customSigners?: unknown[];
    customSignersGasLimits?: (bigint | number)[];
    customSignersGasPrices?: ContractGasPriceData[];
    bestNonce?: number;
    setPendingTxns?: SetPendingTransactions;
    pendingTransactionData?: PendingTransactionData;
    metricId?: OrderMetricId;
  } = {}
) {
  throw new Error("EVM contract calls are disabled in the Canton runtime");
}

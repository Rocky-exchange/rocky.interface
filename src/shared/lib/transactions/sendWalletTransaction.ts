import type { WalletSigner } from "lib/wallets";

import type { TransactionWaiterResult, TxnCallback } from "./types";
import { TxnEventBuilder } from "./types";

export type WalletTxnCtx = {};

export type WalletTxnResult = {
  transactionHash: string | undefined;
  wait: () => Promise<TransactionWaiterResult>;
};

export type WalletGasPriceData =
  | {
      gasPrice: bigint;
    }
  | {
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    };

export async function sendWalletTransaction({
  callback,
}: {
  chainId: number;
  signer: WalletSigner;
  to: string;
  callData: string;
  value?: bigint | number;
  gasLimit?: bigint | number;
  gasPriceData?: WalletGasPriceData;
  nonce?: number | bigint;
  msg?: string;
  runSimulation?: () => Promise<void>;
  callback?: TxnCallback<WalletTxnCtx>;
}): Promise<WalletTxnResult> {
  const eventBuilder = new TxnEventBuilder<WalletTxnCtx>({});
  const error = new Error("EVM wallet transactions are disabled in the Canton runtime");

  callback?.(eventBuilder.Error(error));

  throw error;
}

import type { SourceChainId } from "config/chains";
import type { BridgeSendQuote } from "@/modules/lighter/domain/multichain/types";
import type { TxnCallback, WalletTxnCtx } from "lib/transactions";
import type { WalletSigner } from "lib/wallets";

export async function sendCrossChainDepositTxn(_params: {
  chainId: SourceChainId;
  signer: WalletSigner;
  tokenAddress: string;
  bridgeAddress: string;
  amount: bigint;
  sendParams: unknown;
  account: string;
  quoteSend: BridgeSendQuote;
  callback?: TxnCallback<WalletTxnCtx>;
}) {
  throw new Error("Multichain deposits are disabled in the Canton runtime");
}

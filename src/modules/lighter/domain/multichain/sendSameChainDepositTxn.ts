import type { SettlementChainId } from "config/chains";
import type { TxnCallback, WalletTxnCtx } from "lib/transactions";
import type { WalletSigner } from "lib/wallets";

export async function sendSameChainDepositTxn(_params: {
  chainId: SettlementChainId;
  signer: WalletSigner;
  amount: bigint;
  account: string;
  callback?: TxnCallback<WalletTxnCtx>;
}) {
  throw new Error("EVM same-chain deposits are disabled in the Canton runtime");
}

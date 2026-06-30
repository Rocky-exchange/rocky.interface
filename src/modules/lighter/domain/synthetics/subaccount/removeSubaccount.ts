import type { ContractsChainId } from "config/static/chains";
import type { ExpressTxnData } from "lib/transactions";

export async function removeSubaccountWalletTxn(
  _chainId: ContractsChainId,
  _signer: unknown,
  _subaccountAddress: string
): Promise<void> {
  throw new Error("EVM subaccounts are disabled in the Canton runtime");
}

export async function buildAndSignRemoveSubaccountTxn(_params: unknown): Promise<ExpressTxnData> {
  throw new Error("EVM subaccounts are disabled in the Canton runtime");
}

export async function removeSubaccountExpressTxn(_params: unknown) {
  throw new Error("EVM subaccounts are disabled in the Canton runtime");
}

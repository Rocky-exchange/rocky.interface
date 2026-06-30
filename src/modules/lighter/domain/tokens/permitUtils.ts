import { parseError } from "lib/errors";
import type { WalletSigner } from "lib/wallets";
import type { ContractsChainId } from "sdk/configs/chains";
import type { SignedTokenPermit } from "sdk/types/tokens";
import { nowInSeconds } from "sdk/utils/time";

export async function createAndSignTokenPermit(
  _chainId: ContractsChainId,
  _signer: WalletSigner,
  _tokenAddress: string,
  _spender: string,
  _value: bigint
) {
  throw new Error("EVM token permits are disabled in the Canton runtime");
}

export function getIsPermitExpired(permit: SignedTokenPermit) {
  return Number(permit.deadline) < nowInSeconds();
}

export async function getTokenPermitParams(
  _chainId: ContractsChainId,
  _owner: string,
  _tokenAddress: string,
  _provider: unknown
): Promise<{
  name: string;
  version: string;
  nonce: bigint;
}> {
  throw new Error("EVM token permits are disabled in the Canton runtime");
}

export async function validateTokenPermitSignature(_chainId: number, _permit: SignedTokenPermit) {
  return {
    isValid: false,
    recoveredAddress: undefined,
    error: parseError("EVM token permits are disabled in the Canton runtime"),
  };
}

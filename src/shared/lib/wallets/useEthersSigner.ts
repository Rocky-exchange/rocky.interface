import type { WalletSigner } from ".";

export function clientToSigner(..._args: unknown[]): WalletSigner {
  throw new Error("EVM signer conversion is disabled in the Canton Rocky interface");
}

export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  void chainId;
  return undefined;
}

import type { WalletSigner } from ".";

export type SignatureDomain = {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
};

export type SignatureTypes = Record<string, { name: string; type: string }[]>;

export type SignTypedDataParams = {
  signer: WalletSigner | unknown;
  types: SignatureTypes;
  typedData: Record<string, unknown>;
  domain: SignatureDomain;
  shouldUseSignerMethod?: boolean;
  minified?: boolean;
};

export async function signTypedData(_params: SignTypedDataParams): Promise<string> {
  throw new Error("EVM typed-data signing is disabled in the Canton Rocky interface");
}

export function splitSignature(signature: string): { r: string; s: string; v: number } {
  const sig = signature.startsWith("0x") ? signature.slice(2) : signature;
  const r = "0x" + sig.substring(0, 64);
  const s = "0x" + sig.substring(64, 128);
  const v = parseInt(sig.substring(128, 130), 16);

  return { r, s, v };
}

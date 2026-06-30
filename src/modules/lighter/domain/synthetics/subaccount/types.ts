import type { AnyChainId, ContractsChainId } from "config/chains";

export type SubaccountOnchainData = {
  active: boolean;
  maxAllowedCount: bigint;
  currentActionsCount: bigint;
  expiresAt: bigint;
  approvalNonce: bigint;
  multichainApprovalNonce: bigint;
  integrationId: string | undefined;
};

export type SubaccountSigner = {
  address: string;
  provider?: unknown;
  signTypedData?: (...args: any[]) => Promise<string>;
  [key: string]: unknown;
};

export type SubaccountSerializedConfig = {
  privateKey: string;
  address: string;
  isNew?: boolean;
};

export type Subaccount = {
  address: string;
  chainId: ContractsChainId;
  signerChainId: AnyChainId;
  signer: SubaccountSigner;
  signedApproval: SignedSubacсountApproval;
  onchainData: SubaccountOnchainData;
};

export type SubaccountApproval = {
  subaccount: string;
  nonce: bigint;
  shouldAdd: boolean;
  expiresAt: bigint;
  maxAllowedCount: bigint;
  actionType: string;
  desChainId: bigint;
  deadline: bigint;
  integrationId: string;
};

export type SignedSubacсountApproval = SubaccountApproval & {
  signature: string;
  signedAt: number;
  signatureChainId: AnyChainId;
  subaccountRouterAddress: string;
};

export type SubaccountValidations = {
  isExpired: boolean;
  isActionsExceeded: boolean;
  isNonceExpired: boolean;
  isApprovalInvalid: boolean;
  isValid: boolean;
};

import type { AnyChainId, ContractsChainId } from "config/static/chains";
import type {
  SignedSubacсountApproval,
  Subaccount,
  SubaccountApproval,
  SubaccountOnchainData,
  SubaccountSerializedConfig,
  SubaccountValidations,
} from "domain/synthetics/subaccount/types";
import type { WalletSigner } from "lib/wallets";

const ZERO_DATA = "0x";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT_256 = 2n ** 256n - 1n;
const SUBACCOUNT_ORDER_ACTION = ZERO_HASH;

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function getSubaccountValidations({
  requiredActions,
  subaccount,
  subaccountRouterAddress,
}: {
  requiredActions: number;
  subaccount: Subaccount;
  subaccountRouterAddress: string;
}): SubaccountValidations {
  return {
    isExpired: getIsSubaccountExpired(subaccount),
    isActionsExceeded: getIsSubaccountActionsExceeded(subaccount, requiredActions),
    isNonceExpired: getIsSubaccountNonceExpired(subaccount),
    isApprovalInvalid: getIsSubaccountApprovalInvalid({
      chainId: subaccount.chainId,
      signerChainId: subaccount.signerChainId,
      onchainData: subaccount.onchainData,
      signedApproval: subaccount.signedApproval,
      subaccountRouterAddress,
    }),
    isValid: !getIsInvalidSubaccount({ subaccount, requiredActions, subaccountRouterAddress }),
  };
}

export function getIsSubaccountActive(subaccount: {
  onchainData: SubaccountOnchainData;
  signedApproval: SignedSubacсountApproval | undefined;
}): boolean {
  return Boolean(
    subaccount.onchainData.active ||
      (subaccount.signedApproval?.shouldAdd && !getIsEmptySubaccountApproval(subaccount.signedApproval))
  );
}

export function getOrCreateSubaccountKek(_account: string): string {
  throw new Error("EVM subaccounts are disabled in the Canton runtime");
}

export function getSubaccountSigner(
  _config: SubaccountSerializedConfig,
  _account: string,
  _provider?: unknown
): never {
  throw new Error("EVM subaccounts are disabled in the Canton runtime");
}

export function getMaxSubaccountActions(subaccount: {
  onchainData: SubaccountOnchainData;
  signedApproval: SignedSubacсountApproval | undefined;
}): bigint {
  if (subaccount.signedApproval && !getIsEmptySubaccountApproval(subaccount.signedApproval)) {
    return BigInt(subaccount.signedApproval.maxAllowedCount);
  }

  return subaccount.onchainData.maxAllowedCount;
}

export function getSubaccountExpiresAt(subaccount: {
  onchainData: SubaccountOnchainData;
  signedApproval: SignedSubacсountApproval | undefined;
}): bigint {
  if (subaccount.signedApproval && !getIsEmptySubaccountApproval(subaccount.signedApproval)) {
    return BigInt(subaccount.signedApproval.expiresAt);
  }

  return subaccount.onchainData.expiresAt;
}

export function getRemainingSubaccountActions(subaccount: {
  onchainData: SubaccountOnchainData;
  signedApproval: SignedSubacсountApproval | undefined;
}): bigint {
  return getMaxSubaccountActions(subaccount) - subaccount.onchainData.currentActionsCount;
}

export function getIsApprovalDeadlineExpired(approval: SubaccountApproval): boolean {
  return BigInt(nowInSeconds()) >= approval.deadline;
}

export function getIsSubaccountActionsExceeded(subaccount: Subaccount, requiredActions: number) {
  return getRemainingSubaccountActions(subaccount) < maxBigInt(1n, BigInt(requiredActions));
}

export function getRemainingSubaccountSeconds(subaccount: Subaccount): bigint {
  return maxBigInt(0n, getSubaccountExpiresAt(subaccount) - BigInt(nowInSeconds()));
}

export function getRemainingSubaccountDays(subaccount: Subaccount): bigint {
  return getRemainingSubaccountSeconds(subaccount) / 86_400n;
}

export function getIsApprovalExpired(subaccount: Subaccount): boolean {
  const { signedApproval } = subaccount;

  if (getIsEmptySubaccountApproval(signedApproval)) {
    return false;
  }

  const now = BigInt(nowInSeconds());

  return now >= signedApproval.expiresAt || now >= signedApproval.deadline;
}

export function getIsSubaccountNonceExpired({
  onchainData,
  signedApproval,
}: {
  chainId: ContractsChainId;
  onchainData: SubaccountOnchainData;
  signedApproval: SignedSubacсountApproval;
}): boolean {
  if (getIsEmptySubaccountApproval(signedApproval)) {
    return false;
  }

  return signedApproval.nonce !== onchainData.approvalNonce;
}

export function getIsSubaccountApprovalInvalid({
  signerChainId,
  signedApproval,
}: {
  chainId: ContractsChainId;
  signerChainId: AnyChainId;
  signedApproval: SignedSubacсountApproval;
  onchainData: SubaccountOnchainData;
  subaccountRouterAddress: string;
}): boolean {
  if (getIsEmptySubaccountApproval(signedApproval)) {
    return false;
  }

  return signedApproval.signatureChainId !== signerChainId;
}

export function getIsSubaccountExpired(subaccount: Subaccount): boolean {
  return getIsApprovalExpired(subaccount) || BigInt(nowInSeconds()) >= getSubaccountExpiresAt(subaccount);
}

export function getIsInvalidSubaccount({
  subaccount,
  requiredActions,
  subaccountRouterAddress,
}: {
  subaccount: Subaccount;
  requiredActions: number;
  subaccountRouterAddress: string;
}): boolean {
  return (
    getIsSubaccountExpired(subaccount) ||
    getIsSubaccountNonceExpired(subaccount) ||
    getIsSubaccountActionsExceeded(subaccount, requiredActions) ||
    getIsSubaccountApprovalInvalid({
      chainId: subaccount.chainId,
      signedApproval: subaccount.signedApproval,
      subaccountRouterAddress,
      signerChainId: subaccount.signerChainId,
      onchainData: subaccount.onchainData,
    })
  );
}

export function getEmptySubaccountApproval(
  chainId: ContractsChainId,
  subaccountAddress: string
): SignedSubacсountApproval {
  return {
    subaccount: subaccountAddress,
    shouldAdd: false,
    expiresAt: 0n,
    maxAllowedCount: 0n,
    actionType: SUBACCOUNT_ORDER_ACTION,
    nonce: 0n,
    deadline: MAX_UINT_256,
    desChainId: BigInt(chainId),
    signature: ZERO_DATA,
    signedAt: 0,
    integrationId: ZERO_HASH,
    subaccountRouterAddress: ZERO_ADDRESS,
    signatureChainId: chainId,
  };
}

export function getIsEmptySubaccountApproval(subaccountApproval: SignedSubacсountApproval): boolean {
  return (
    subaccountApproval.signature === ZERO_DATA &&
    subaccountApproval.nonce === 0n &&
    subaccountApproval.expiresAt === 0n &&
    subaccountApproval.maxAllowedCount === 0n &&
    subaccountApproval.shouldAdd === false &&
    subaccountApproval.integrationId === ZERO_HASH
  );
}

export async function getInitialSubaccountApproval({
  chainId,
  subaccountAddress,
}: {
  chainId: ContractsChainId;
  signer: WalletSigner;
  provider: unknown;
  subaccountAddress: string;
  isTradingAccount: boolean;
}) {
  return getEmptySubaccountApproval(chainId, subaccountAddress);
}

export function getActualApproval(params: {
  chainId: ContractsChainId;
  address: string;
  signedApproval: SignedSubacсountApproval | undefined;
  onchainData: SubaccountOnchainData;
}): SignedSubacсountApproval {
  const { chainId, signedApproval, address, onchainData } = params;

  if (!signedApproval || getIsSubaccountApprovalSynced({ chainId, signedApproval, onchainData })) {
    return getEmptySubaccountApproval(chainId, address);
  }

  return signedApproval;
}

export function getIsSubaccountApprovalSynced(params: {
  chainId: ContractsChainId;
  signedApproval: SignedSubacсountApproval;
  onchainData: SubaccountOnchainData;
}): boolean {
  const { signedApproval, onchainData } = params;

  if (getIsSubaccountNonceExpired(params)) {
    return true;
  }

  return (
    onchainData.maxAllowedCount === signedApproval.maxAllowedCount &&
    onchainData.expiresAt === signedApproval.expiresAt &&
    onchainData.active === true
  );
}

export async function signUpdatedSubaccountSettings(_params: {
  chainId: ContractsChainId;
  signer: WalletSigner;
  provider: unknown;
  subaccount: Subaccount;
  nextRemainigActions: bigint | undefined;
  nextRemainingSeconds: bigint | undefined;
  isTradingAccount: boolean;
}) {
  throw new Error("EVM subaccounts are disabled in the Canton runtime");
}

export async function createAndSignSubaccountApproval(
  _chainId: ContractsChainId,
  _mainAccountSigner: WalletSigner,
  _provider: unknown,
  _subaccountAddress: string,
  _params: {
    shouldAdd: boolean;
    expiresAt: bigint;
    maxAllowedCount: bigint;
  },
  _isTradingAccount: boolean
): Promise<SignedSubacсountApproval> {
  throw new Error("EVM subaccounts are disabled in the Canton runtime");
}

export function hashSubaccountApproval(_subaccountApproval: SignedSubacсountApproval) {
  return ZERO_HASH;
}

export async function getSubaccountOnchainData(_params: {
  chainId: ContractsChainId;
  signer: WalletSigner;
  provider: unknown;
  subaccountAddress: string;
}): Promise<SubaccountOnchainData> {
  return {
    active: false,
    maxAllowedCount: 0n,
    currentActionsCount: 0n,
    expiresAt: 0n,
    approvalNonce: 0n,
    multichainApprovalNonce: 0n,
    integrationId: undefined,
  };
}

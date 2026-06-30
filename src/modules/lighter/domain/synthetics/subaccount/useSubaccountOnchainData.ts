import type { ContractsChainId } from "sdk/configs/chains";

export type SubaccountOnchainData = {
  active: boolean;
  maxAllowedCount: bigint;
  currentActionsCount: bigint;
  expiresAt: bigint;
  approvalNonce: bigint;
  multichainApprovalNonce: bigint;
  integrationId: string | undefined;
};

export type SubaccountOnchainDataResult = {
  subaccountData: SubaccountOnchainData | undefined;
  refreshSubaccountData: () => void;
};

export function useSubaccountOnchainData(
  _chainId: ContractsChainId,
  _params: {
    account: string | undefined;
    subaccountAddress: string | undefined;
    srcChainId: number | undefined;
  }
): SubaccountOnchainDataResult {
  return {
    subaccountData: {
      active: false,
      maxAllowedCount: 0n,
      currentActionsCount: 0n,
      expiresAt: 0n,
      approvalNonce: 0n,
      multichainApprovalNonce: 0n,
      integrationId: undefined,
    },
    refreshSubaccountData: () => undefined,
  };
}

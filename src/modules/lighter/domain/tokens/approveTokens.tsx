import type { AddTokenPermitFn } from "@/modules/lighter/context/TokenPermitsContext/TokenPermitsContextProvider";
import type { InfoTokens, TokenInfo } from "sdk/types/tokens";

type Params = {
  setIsApproving: (val: boolean) => void;
  signer: unknown;
  tokenAddress: string;
  spender: string;
  chainId: number;
  permitParams:
    | {
        addTokenPermit: AddTokenPermitFn;
        setIsPermitsDisabled: (disabled: boolean) => void;
        isPermitsDisabled: boolean;
      }
    | undefined;
  onApproveSubmitted?: ({ isPermit }: { isPermit: boolean }) => void;
  onApproveFail?: (error: Error, { isPermit }: { isPermit: boolean }) => void;
  getTokenInfo?: (infoTokens: InfoTokens, tokenAddress: string) => TokenInfo;
  infoTokens?: InfoTokens;
  pendingTxns?: unknown[];
  setPendingTxns?: (txns: unknown[]) => void;
  includeMessage?: boolean;
  approveAmount: bigint | undefined;
};

export async function approveTokens({ setIsApproving, onApproveFail }: Params): Promise<void> {
  setIsApproving(true);

  const error = new Error("EVM token approvals are disabled in the Canton runtime");

  onApproveFail?.(error, { isPermit: false });
  setIsApproving(false);

  throw error;
}

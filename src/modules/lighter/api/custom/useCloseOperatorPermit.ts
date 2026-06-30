import { useCallback } from "react";

export interface EnsureCloseOperatorPermitResult {
  alreadyApproved: boolean;
  operator: string;
  vaultAddress: string;
  txHash?: string;
}

export interface EnsureCloseOperatorPermitOptions {
  operator?: string | null;
}

export function useCloseOperatorPermit() {
  const ensureCloseOperatorPermit = useCallback(
    async (options: EnsureCloseOperatorPermitOptions = {}): Promise<EnsureCloseOperatorPermitResult> => {
      return {
        alreadyApproved: true,
        operator: options.operator || "canton-session",
        vaultAddress: "canton-session",
      };
    },
    []
  );

  return { ensureCloseOperatorPermit };
}

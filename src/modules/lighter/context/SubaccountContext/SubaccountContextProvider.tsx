import React, { createContext, useContext } from "react";

import type { Subaccount, SubaccountSerializedConfig } from "domain/synthetics/subaccount/types";

enum SubaccountActivationState {
  Generating = 0,
  GeneratingError = 1,
  ApprovalSigning = 2,
  ApprovalSigningError = 3,
  Success = 4,
}

enum SubaccountDeactivationState {
  Deactivating = 0,
  Error = 1,
  Success = 2,
}

export type SubaccountState = {
  subaccountConfig: SubaccountSerializedConfig | undefined;
  subaccount: Subaccount | undefined;
  subaccountActivationState: SubaccountActivationState | undefined;
  subaccountDeactivationState: SubaccountDeactivationState | undefined;
  updateSubaccountSettings: (params: {
    nextRemainigActions?: bigint;
    nextRemainingSeconds?: bigint;
    nextIsTradingAccount?: boolean;
  }) => Promise<boolean>;
  resetSubaccountApproval: () => void;
  tryEnableSubaccount: () => Promise<boolean>;
  tryDisableSubaccount: () => Promise<boolean>;
  refreshSubaccountData: () => void;
};

const FALLBACK_SUBACCOUNT_STATE: SubaccountState = {
  subaccountConfig: undefined,
  subaccount: undefined,
  subaccountActivationState: undefined,
  subaccountDeactivationState: undefined,
  updateSubaccountSettings: async () => false,
  resetSubaccountApproval: () => undefined,
  tryEnableSubaccount: async () => false,
  tryDisableSubaccount: async () => false,
  refreshSubaccountData: () => undefined,
};

const SubaccountContext = createContext<SubaccountState>(FALLBACK_SUBACCOUNT_STATE);

export function useSubaccountContext() {
  return useContext(SubaccountContext);
}

export function SubaccountContextProvider({ children }: { children: React.ReactNode }) {
  return <SubaccountContext.Provider value={FALLBACK_SUBACCOUNT_STATE}>{children}</SubaccountContext.Provider>;
}

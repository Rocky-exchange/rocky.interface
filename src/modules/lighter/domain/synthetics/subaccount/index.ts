import type { SignedSubacсountApproval, Subaccount, SubaccountValidations } from "./types";

export * from "./types";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function getSubaccountValidations(_p: {
  subaccount: Subaccount;
  subaccountRouterAddress: string;
  requiredActions: number;
}): SubaccountValidations {
  return {
    isExpired: false,
    isActionsExceeded: false,
    isNonceExpired: false,
    isApprovalInvalid: true,
    isValid: false,
  };
}

export function hashSubaccountApproval(_subaccountApproval: SignedSubacсountApproval | undefined) {
  return ZERO_HASH;
}

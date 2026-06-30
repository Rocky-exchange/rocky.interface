export enum AccountType {
  Safe,
  SmartAccount,
  PostEip7702EOA,
  EOA,
}

export function useAccountType() {
  return {
    accountType: AccountType.EOA,
    isSmartAccount: false,
  };
}

export function useIsNonEoaAccountOnAnyChain(): boolean {
  return false;
}

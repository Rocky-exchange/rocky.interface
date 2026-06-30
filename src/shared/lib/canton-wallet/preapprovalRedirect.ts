export function walletPreapprovalAuthorizePath(returnTo: string): string {
  return `/api/wallet/preapproval/authorize?return_to=${encodeURIComponent(returnTo)}`;
}

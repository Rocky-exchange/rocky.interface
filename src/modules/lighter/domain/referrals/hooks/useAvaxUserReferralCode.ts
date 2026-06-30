const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export interface AvaxUserReferralCodeResult {
  /** bytes32 code as 0x-prefixed hex; `ZERO_HASH` means unbound. */
  code: `0x${string}`;
  /** True iff `code !== ZERO_HASH`. */
  isBound: boolean;
}

export function useAvaxUserReferralCode(
  _chainId: number | undefined,
  _account: string | null | undefined
): {
  data: AvaxUserReferralCodeResult | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
} {
  return {
    data: {
      code: ZERO_HASH,
      isBound: false,
    },
    isLoading: false,
    error: undefined,
    refetch: async () => undefined,
  };
}

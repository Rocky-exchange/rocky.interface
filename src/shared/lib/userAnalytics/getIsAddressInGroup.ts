import { useMemo } from "react";

function stableBucket(input: string) {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % 100;
}

export function getIsAddressInGroup({
  address,
  experimentGroupProbability: probability,
  grouping: salt,
}: {
  address: string;
  /**
   * 0-1 meaning 0% - 100%
   */
  experimentGroupProbability: number;
  grouping: string;
}): boolean {
  const twoDigits = stableBucket(address.toLowerCase() + (salt || ""));
  const isInGroup = twoDigits < Math.trunc(probability * 100);
  return isInGroup;
}

export function useIsAddressInGroup({
  address,
  experimentGroupProbability: probability,
  grouping: salt,
}: {
  address: string | undefined;
  experimentGroupProbability: number;
  grouping: string;
}) {
  const isInGroup = useMemo(
    () =>
      address !== undefined &&
      getIsAddressInGroup({
        address,
        experimentGroupProbability: probability,
        grouping: salt,
      }),
    [address, probability, salt]
  );

  return isInGroup;
}

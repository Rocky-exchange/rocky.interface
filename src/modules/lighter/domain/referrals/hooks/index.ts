import { gql } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";

import { REFERRAL_CODE_KEY } from "config/localStorage";
import { getReferralsGraphClient } from "lib/indexers";
import type { ContractsChainId } from "sdk/configs/chains";
import { decodeReferralCode } from "sdk/utils/referrals";

import type { UserReferralInfo } from "../types";

export * from "./useReferralCodeFromUrl";
export * from "./useReferralsData";
export * from "./useUserCodesOnAllChain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

const noopMutate = async () => undefined;

export function useUserReferralInfoRequest(
  _signer: unknown,
  _chainId: ContractsChainId,
  _account?: string | null,
  _skipLocalReferralCode = false
): UserReferralInfo | undefined {
  return undefined;
}

export function useAffiliateTier(_signer: unknown, _chainId: ContractsChainId, _account?: string | null) {
  return {
    affiliateTier: undefined,
    mutateReferrerTier: noopMutate,
    error: undefined,
  };
}

export function useTiers(_signer: unknown, _chainId: ContractsChainId, _tierLevel?: bigint | number | string) {
  return {
    totalRebate: undefined,
    discountShare: undefined,
    error: undefined,
  };
}

export async function setAffiliateTier(
  _chainId: ContractsChainId,
  _affiliate: string,
  _tierId: number,
  _signer: unknown,
  _opts: unknown
) {
  throw new Error("EVM referral contracts are disabled in the Canton runtime");
}

export async function registerReferralCode(_chainId: ContractsChainId, _referralCode: string, _signer: unknown) {
  throw new Error("EVM referral contracts are disabled in the Canton runtime");
}

export async function setTraderReferralCodeByUser(
  _chainId: ContractsChainId,
  _referralCode: string,
  _signer: unknown
) {
  throw new Error("EVM referral contracts are disabled in the Canton runtime");
}

export async function getReferralCodeOwner(_chainId: ContractsChainId, _referralCode: string): Promise<string> {
  return ZERO_ADDRESS;
}

export function useUserReferralCode(
  _signer: unknown,
  _chainId: ContractsChainId,
  _account?: string | null,
  skipLocalReferralCode = false
) {
  const localStorageCode = window.localStorage.getItem(REFERRAL_CODE_KEY);

  return useMemo(() => {
    if (skipLocalReferralCode || !localStorageCode) {
      return {
        userReferralCode: undefined,
        userReferralCodeString: undefined,
        attachedOnChain: false,
        referralCodeForTxn: ZERO_HASH,
      };
    }

    return {
      userReferralCode: localStorageCode,
      userReferralCodeString: decodeReferralCode(localStorageCode as `0x${string}`),
      attachedOnChain: false,
      referralCodeForTxn: localStorageCode,
    };
  }, [localStorageCode, skipLocalReferralCode]);
}

export function useLocalReferralCode() {
  const userReferralCode = window.localStorage.getItem(REFERRAL_CODE_KEY);

  return useMemo(() => {
    if (!userReferralCode) {
      return undefined;
    }

    const userReferralCodeString = decodeReferralCode(userReferralCode as `0x${string}`);

    return {
      userReferralCode,
      userReferralCodeString,
    };
  }, [userReferralCode]);
}

export function getRefCodeParamString() {
  const userReferralCode = window.localStorage.getItem(REFERRAL_CODE_KEY);

  if (!userReferralCode) {
    return undefined;
  }

  const userReferralCodeString = decodeReferralCode(userReferralCode as `0x${string}`);

  return `ref=${userReferralCodeString}`;
}

export function useReferrerTier(_signer: unknown, _chainId: ContractsChainId, _account?: string | null) {
  return {
    referrerTier: undefined,
    mutateReferrerTier: noopMutate,
  };
}

export function useCodeOwner(_signer: unknown, _chainId: ContractsChainId, _account?: string | null, _code?: string) {
  return {
    codeOwner: undefined,
    mutateCodeOwner: noopMutate,
    error: undefined,
  };
}

export function useReferrerDiscountShare(_library: unknown, _chainId: ContractsChainId, _owner?: string | null) {
  return {
    discountShare: undefined,
    mutateDiscountShare: noopMutate,
    error: undefined,
  };
}

export async function validateReferralCodeExists(_referralCode: string, _chainId: ContractsChainId) {
  return false;
}

export function useAffiliateCodes(chainId: ContractsChainId | undefined, account: string | null | undefined) {
  const [affiliateCodes, setAffiliateCodes] = useState<{ code: string | null; success: boolean }>({
    code: null,
    success: false,
  });

  const query = gql`
    query userReferralCodes($account: String!) {
      referralCodes(first: 1000, where: { owner: $account }) {
        code
      }
    }
  `;

  useEffect(() => {
    if (!chainId || !account) return;

    getReferralsGraphClient(chainId)
      ?.query({ query, variables: { account: account.toLowerCase() } })
      .then((res) => {
        const codes = res?.data?.referralCodes || [];
        const parsedAffiliateCodes = codes.map((c) => decodeReferralCode(c?.code));
        setAffiliateCodes({ code: parsedAffiliateCodes[0] || null, success: true });
      })
      .catch(() => {
        setAffiliateCodes({ code: null, success: true });
      });

    return () => {
      setAffiliateCodes({ code: null, success: false });
    };
  }, [chainId, query, account]);

  return affiliateCodes;
}

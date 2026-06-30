import type { ApolloClient } from "@apollo/client";

const disabledGraphClient = {
  query: async <TData = any>() => ({ data: { rounds: [] } as TData }),
} as unknown as ApolloClient<any>;

export const chainlinkClient = disabledGraphClient;

export const REFERRAL_SUPPORTED_CHAIN_IDS: number[] = [];

export function getSyntheticsGraphClient(_chainId: number): ApolloClient<any> | null {
  return null;
}

export function getSubsquidGraphClient(_chainId: number): ApolloClient<any> | null {
  return null;
}

export function getProtocolGraphClient(_chainId: number): ApolloClient<any> | null {
  return null;
}

export function getReferralsGraphClient(_chainId: number): ApolloClient<any> | null {
  return null;
}

export function hasReferralsIndexer(_chainId: number): boolean {
  return false;
}

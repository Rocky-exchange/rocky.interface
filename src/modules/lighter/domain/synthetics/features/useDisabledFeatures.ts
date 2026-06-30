import type { ContractsChainId } from "sdk/configs/chains";

export type FeaturesSettings = {
  relayRouterEnabled: boolean;
  subaccountRelayRouterEnabled: boolean;
};

export type EnabledFeaturesResult = {
  features: FeaturesSettings | undefined;
};

export function useEnabledFeaturesRequest(_chainId: ContractsChainId): EnabledFeaturesResult {
  return {
    features: {
      relayRouterEnabled: false,
      subaccountRelayRouterEnabled: false,
    },
  };
}

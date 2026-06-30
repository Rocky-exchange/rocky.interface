import invert from "lodash/invert";
import mapValues from "lodash/mapValues";

import { ARBITRUM, ARBITRUM_SEPOLIA, AVALANCHE, AVALANCHE_FUJI, BOTANIX, type ContractsChainId } from "config/chains";

export const NETWORK_QUERY_PARAM = "network";
export const VERSION_QUERY_PARAM = "v";

export const NETWORK_ID_SLUGS_MAP: Record<ContractsChainId, string> = {
  [ARBITRUM]: "disabled",
  [AVALANCHE]: "disabled",
  [AVALANCHE_FUJI]: "disabled",
  [BOTANIX]: "botanix",
  [ARBITRUM_SEPOLIA]: "disabled",
};

export const NETWORK_SLUGS_ID_MAP = mapValues(invert(NETWORK_ID_SLUGS_MAP), Number);

import {
  AnyChainId,
  ARBITRUM,
  ARBITRUM_SEPOLIA,
  AVALANCHE,
  AVALANCHE_FUJI,
  BOTANIX,
  SOURCE_BASE_MAINNET,
  SOURCE_BSC_MAINNET,
  SOURCE_OPTIMISM_SEPOLIA,
  SOURCE_SEPOLIA,
} from "config/chains";

import gmIcon from "img/gm_icon.svg";
import base from "img/tokens/ic_base.svg";
import botanix from "img/tokens/ic_botanix.svg";
import glvIcon from "img/tokens/ic_glv.svg";
import protocolTokenIcon from "img/tokens/ic_primit.svg";
import optimismSepolia from "img/tokens/ic_op.svg";
import sepolia from "img/tokens/ic_sepolia.svg";

type ChainIcons = {
  network?: string;
  gm: string;
  glv?: string;
};

const ICONS: Record<number | "common", ChainIcons> = {
  [ARBITRUM]: {
    network: botanix,
    gm: gmIcon,
  },
  [ARBITRUM_SEPOLIA]: {
    network: botanix,
    gm: gmIcon,
  },
  [AVALANCHE]: {
    network: botanix,
    gm: gmIcon,
  },
  [AVALANCHE_FUJI]: {
    network: botanix,
    gm: gmIcon,
  },
  [BOTANIX]: {
    network: botanix,
    gm: gmIcon,
  },
  common: {
    gm: gmIcon,
    glv: glvIcon,
  },
};

export const CHAIN_ID_TO_NETWORK_ICON: Record<AnyChainId | 0, string> = {
  [ARBITRUM]: botanix,
  [AVALANCHE]: botanix,
  0: protocolTokenIcon,
  [SOURCE_BASE_MAINNET]: base,
  [AVALANCHE_FUJI]: botanix,
  [ARBITRUM_SEPOLIA]: botanix,
  [SOURCE_OPTIMISM_SEPOLIA]: optimismSepolia,
  [SOURCE_SEPOLIA]: sepolia,
  [BOTANIX]: botanix,
  [SOURCE_BSC_MAINNET]: botanix,
};

/**
 * For chain icons use `getChainIcon`
 */
export function getIcon(chainId: number | "common", label: keyof ChainIcons) {
  if (!chainId || !(chainId in ICONS)) {
    throw new Error(`No icons found for chain: ${chainId}`);
  }

  return ICONS[chainId][label];
}

export function getChainIcon(chainId: number): string {
  if (!(chainId in CHAIN_ID_TO_NETWORK_ICON)) {
    throw new Error(`No icon found for chain: ${chainId}`);
  }

  return CHAIN_ID_TO_NETWORK_ICON[chainId];
}

export function getIcons(chainId: number | "common") {
  if (!chainId || !(chainId in ICONS)) {
    throw new Error(`No icons found for chain: ${chainId}`);
  }

  return ICONS[chainId];
}

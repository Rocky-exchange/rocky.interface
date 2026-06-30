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

export const CHAIN_ID_TO_TX_URL_BUILDER: Record<AnyChainId, (_txId: string) => string> = {
  [ARBITRUM]: () => "",
  [AVALANCHE]: () => "",
  [SOURCE_BASE_MAINNET]: () => "",
  [SOURCE_OPTIMISM_SEPOLIA]: () => "",
  [ARBITRUM_SEPOLIA]: () => "",
  [AVALANCHE_FUJI]: () => "",
  [SOURCE_SEPOLIA]: () => "",
  [BOTANIX]: () => "",
  [SOURCE_BSC_MAINNET]: () => "",
};

export const CHAIN_ID_TO_EXPLORER_NAME: Record<AnyChainId, string> = {
  [ARBITRUM]: "",
  [AVALANCHE]: "",
  [AVALANCHE_FUJI]: "",
  [ARBITRUM_SEPOLIA]: "",
  [SOURCE_BASE_MAINNET]: "",
  [SOURCE_OPTIMISM_SEPOLIA]: "",
  [SOURCE_SEPOLIA]: "",
  [BOTANIX]: "",
  [SOURCE_BSC_MAINNET]: "",
};

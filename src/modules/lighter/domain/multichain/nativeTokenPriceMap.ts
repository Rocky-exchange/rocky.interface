import {
  ARBITRUM,
  ARBITRUM_SEPOLIA,
  AVALANCHE,
  SettlementChainId,
  SOURCE_BASE_MAINNET,
  SOURCE_OPTIMISM_SEPOLIA,
  SOURCE_SEPOLIA,
  SourceChainId,
} from "config/static/chains";
import { getTokenBySymbol } from "sdk/configs/tokens";

// Note: BSC is no longer a supported source chain (Canton migration removed
// cross-chain EVM bridging), so there is no BNB entry here anymore.
export const NATIVE_TOKEN_PRICE_MAP: Partial<
  Record<SourceChainId, Partial<Record<SettlementChainId, Partial<Record<SettlementChainId, string>>>>>
> = {
  [SOURCE_BASE_MAINNET]: {
    [AVALANCHE]: {
      [AVALANCHE]: getTokenBySymbol(AVALANCHE, "ETH").address,
    },
    [ARBITRUM]: {
      [ARBITRUM]: getTokenBySymbol(ARBITRUM, "ETH").address,
    },
  },
  [SOURCE_SEPOLIA]: {
    [ARBITRUM_SEPOLIA]: {
      [ARBITRUM_SEPOLIA]: getTokenBySymbol(ARBITRUM_SEPOLIA, "ETH").address,
    },
  },
  [SOURCE_OPTIMISM_SEPOLIA]: {
    [ARBITRUM_SEPOLIA]: {
      [ARBITRUM_SEPOLIA]: getTokenBySymbol(ARBITRUM_SEPOLIA, "ETH").address,
    },
  },
};

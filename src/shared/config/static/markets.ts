/*
  This files is used to pre-build data during the build process.
  Avoid adding client-side code here, as it can break the build process.

  However, this files can be a dependency for the client code.
*/
import { MARKETS as SDK_MARKETS } from "sdk/configs/markets";

import { ARBITRUM, ARBITRUM_SEPOLIA, AVALANCHE, AVALANCHE_FUJI, BOTANIX, ContractsChainId } from "./chains";

type MarketUiConfig = {
  enabled: boolean;
};

/*
  ATTENTION
  When adding new markets, please add them also to the end of the list in ./sortedMarkets.ts
*/
const MARKETS_UI_CONFIGS: Record<ContractsChainId, Record<string, MarketUiConfig>> = {
  [ARBITRUM]: {
    // BTC/USD [WBTC.e-USDC]
    "0x47c031236e19d024b42f8AE6780E44A573170703": {
      enabled: true,
    },
    // ETH/USD [WETH-USDC]
    "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336": {
      enabled: true,
    },
  },
  [AVALANCHE]: {
    // BTC/USD [BTC-USDC]
    "0xFb02132333A79C8B5Bd0b64E3AbccA5f7fAf2937": {
      enabled: true,
    },
    // ETH/USD [ETH-USDC]
    "0xB7e69749E3d2EDd90ea59A4932EFEa2D41E245d7": {
      enabled: true,
    },
  },
  [AVALANCHE_FUJI]: {
    // ETH/USD [ETH-USDC]
    "0xbf338a6C595f06B7Cfff2FA8c958d49201466374": {
      enabled: true,
    },
    // WBTC/USD [WBTC-USDC]
    "0x79E6e0E454dE82fA98c02dB012a2A69103630B07": {
      enabled: true,
    },
  },
  [ARBITRUM_SEPOLIA]: {
    // ETH/USD [WETH-USDC]
    "0x482Df3D320C964808579b585a8AC7Dd5D144eFaF": {
      enabled: true,
    },
    // BTC/USD [BTC-USDC]
    "0xBb532Ab4923C23c2bfA455151B14fec177a34C0D": {
      enabled: true,
    },
  },
  [BOTANIX]: {
    // BTC/USD [stBTC-stBTC]
    "0x6682BB60590a045A956541B1433f016Ed22E361d": {
      enabled: true,
    },
    // BTC/USD [stBTC-USDC.E]
    "0x2f95a2529328E427d3204555F164B1102086690E": {
      enabled: true,
    },
    // BTC/USD [PBTC-PBTC]
    "0x6bFDD025827F7CE130BcfC446927AEF34ae2a98d": {
      enabled: true,
    },
  },
};

export const MARKETS = Object.keys(MARKETS_UI_CONFIGS).reduce(
  (acc, network) => {
    return {
      ...acc,
      [network]: Object.keys(MARKETS_UI_CONFIGS[network]).reduce((acc, address) => {
        return {
          ...acc,
          [address]: {
            ...SDK_MARKETS[network][address],
            ...MARKETS_UI_CONFIGS[network][address],
          },
        };
      }, {}),
    };
  },
  {} as Record<
    number,
    Record<
      string,
      MarketUiConfig & {
        longTokenAddress: string;
        shortTokenAddress: string;
        indexTokenAddress: string;
        marketTokenAddress: string;
      }
    >
  >
);

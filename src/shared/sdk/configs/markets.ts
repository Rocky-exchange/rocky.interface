/*
  This files is used to pre-build data during the build process.
  Avoid adding client-side code here, as it can break the build process.
*/
import { ARBITRUM, ARBITRUM_SEPOLIA, AVALANCHE, AVALANCHE_FUJI, BOTANIX, ContractsChainId } from "./chains";
import { getTokenBySymbol } from "./tokens";

export const SWAP_GRAPH_MAX_MARKETS_PER_TOKEN = 5;

export type MarketConfig = {
  marketTokenAddress: string;
  indexTokenAddress: string;
  longTokenAddress: string;
  shortTokenAddress: string;
};

/*
  ATTENTION
  When adding new markets, please add them also to the end of the list in ./src/configs/static/sortedMarkets.ts
*/
export const MARKETS: Record<ContractsChainId, Record<string, MarketConfig>> = {
  [ARBITRUM]: {
    // BTC/USD [WBTC.e-USDC]
    "0x47c031236e19d024b42f8AE6780E44A573170703": {
      marketTokenAddress: "0x47c031236e19d024b42f8AE6780E44A573170703",
      indexTokenAddress: "0x47904963fc8b2340414262125aF798B9655E58Cd",
      longTokenAddress: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      shortTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    // ETH/USD [WETH-USDC]
    "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336": {
      marketTokenAddress: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
      indexTokenAddress: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      longTokenAddress: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      shortTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
  },
  [AVALANCHE]: {
    // BTC/USD [BTC-USDC]
    "0xFb02132333A79C8B5Bd0b64E3AbccA5f7fAf2937": {
      marketTokenAddress: "0xFb02132333A79C8B5Bd0b64E3AbccA5f7fAf2937",
      indexTokenAddress: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
      longTokenAddress: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
      shortTokenAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    },
    // ETH/USD [ETH-USDC]
    "0xB7e69749E3d2EDd90ea59A4932EFEa2D41E245d7": {
      marketTokenAddress: "0xB7e69749E3d2EDd90ea59A4932EFEa2D41E245d7",
      indexTokenAddress: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      longTokenAddress: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      shortTokenAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    },
  },
  [AVALANCHE_FUJI]: {
    // ETH/USD [ETH-USDC]
    "0xbf338a6C595f06B7Cfff2FA8c958d49201466374": {
      marketTokenAddress: "0xbf338a6C595f06B7Cfff2FA8c958d49201466374",
      indexTokenAddress: "0x82F0b3695Ed2324e55bbD9A9554cB4192EC3a514",
      longTokenAddress: "0x82F0b3695Ed2324e55bbD9A9554cB4192EC3a514",
      shortTokenAddress: "0x3eBDeaA0DB3FfDe96E7a0DBBAFEC961FC50F725F",
    },
    // WBTC/USD [WBTC-USDC]
    "0x79E6e0E454dE82fA98c02dB012a2A69103630B07": {
      marketTokenAddress: "0x79E6e0E454dE82fA98c02dB012a2A69103630B07",
      indexTokenAddress: "0x3Bd8e00c25B12E6E60fc8B6f1E1E2236102073Ca",
      longTokenAddress: "0x3Bd8e00c25B12E6E60fc8B6f1E1E2236102073Ca",
      shortTokenAddress: "0x3eBDeaA0DB3FfDe96E7a0DBBAFEC961FC50F725F",
    },
  },
  [ARBITRUM_SEPOLIA]: {
    // ETH/USD [WETH-USDC]
    "0x482Df3D320C964808579b585a8AC7Dd5D144eFaF": {
      marketTokenAddress: "0x482Df3D320C964808579b585a8AC7Dd5D144eFaF",
      indexTokenAddress: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      longTokenAddress: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      shortTokenAddress: "0x3321Fd36aEaB0d5CdfD26f4A3A93E2D2aAcCB99f",
    },
    // BTC/USD [BTC-USDC]
    "0xBb532Ab4923C23c2bfA455151B14fec177a34C0D": {
      marketTokenAddress: "0xBb532Ab4923C23c2bfA455151B14fec177a34C0D",
      indexTokenAddress: "0xF79cE1Cf38A09D572b021B4C5548b75A14082F12",
      longTokenAddress: "0xF79cE1Cf38A09D572b021B4C5548b75A14082F12",
      shortTokenAddress: "0x3321Fd36aEaB0d5CdfD26f4A3A93E2D2aAcCB99f",
    },
  },
  [BOTANIX]: {
    // BTC/USD [stBTC-stBTC]
    "0x6682BB60590a045A956541B1433f016Ed22E361d": {
      marketTokenAddress: "0x6682BB60590a045A956541B1433f016Ed22E361d",
      indexTokenAddress: "0x1B9e25f54225bcdCf347569E38C41Ade9BB686e5",
      longTokenAddress: "0xF4586028FFdA7Eca636864F80f8a3f2589E33795",
      shortTokenAddress: "0xF4586028FFdA7Eca636864F80f8a3f2589E33795",
    },
    // BTC/USD [stBTC-USDC.E]
    "0x2f95a2529328E427d3204555F164B1102086690E": {
      marketTokenAddress: "0x2f95a2529328E427d3204555F164B1102086690E",
      indexTokenAddress: "0x1B9e25f54225bcdCf347569E38C41Ade9BB686e5",
      longTokenAddress: "0xF4586028FFdA7Eca636864F80f8a3f2589E33795",
      shortTokenAddress: "0x29eE6138DD4C9815f46D34a4A1ed48F46758A402",
    },
    // BTC/USD [PBTC-PBTC]
    "0x6bFDD025827F7CE130BcfC446927AEF34ae2a98d": {
      marketTokenAddress: "0x6bFDD025827F7CE130BcfC446927AEF34ae2a98d",
      indexTokenAddress: "0x1B9e25f54225bcdCf347569E38C41Ade9BB686e5",
      longTokenAddress: "0x0D2437F93Fed6EA64Ef01cCde385FB1263910C56",
      shortTokenAddress: "0x0D2437F93Fed6EA64Ef01cCde385FB1263910C56",
    },
  },
};

export type MarketLabel = `${string}/USD [${string}-${string}]`;

export function getMarketByLabel(chainId: ContractsChainId, label: MarketLabel): MarketConfig {
  const marketsByAddress = MARKETS[chainId];

  if (!marketsByAddress) {
    throw new Error(`Markets not found for chainId ${chainId}`);
  }

  const labelMatch = label.match(/^(.+?)\/USD\s*\[([^\]]+)\]$/i);

  if (!labelMatch) {
    throw new Error(`Invalid market label ${label}`);
  }

  const [, indexSymbolRaw, tokensPart] = labelMatch;

  const separatorIndex = tokensPart.search(/[-/]/);

  if (separatorIndex === -1) {
    throw new Error(`Invalid market label ${label}`);
  }

  const longSymbolRaw = tokensPart.slice(0, separatorIndex).trim();
  const shortSymbolRaw = tokensPart.slice(separatorIndex + 1).trim();

  if (!longSymbolRaw || !shortSymbolRaw) {
    throw new Error(`Invalid market label ${label}`);
  }

  const indexToken = getTokenBySymbol(chainId, fixTokenSymbolFromMarketLabel(chainId, indexSymbolRaw));
  const longToken = getTokenBySymbol(chainId, fixTokenSymbolFromMarketLabel(chainId, longSymbolRaw), {
    isSynthetic: false,
  });
  const shortToken = getTokenBySymbol(chainId, fixTokenSymbolFromMarketLabel(chainId, shortSymbolRaw), {
    isSynthetic: false,
  });

  if (!longToken || !shortToken || !indexToken) {
    throw new Error(`Invalid market label ${label}`);
  }

  const market = Object.values(marketsByAddress).find(
    (market) =>
      market.longTokenAddress === longToken.address &&
      market.shortTokenAddress === shortToken.address &&
      market.indexTokenAddress === indexToken.address
  );

  if (!market) {
    throw new Error(`Market ${label} not found`);
  }

  return market;
}

export const fixTokenSymbolFromMarketLabel = (chainId: ContractsChainId, symbol: string) => {
  if (chainId === ARBITRUM && symbol === "WBTC") {
    return "BTC";
  }
  if (chainId === ARBITRUM && symbol === "ETH") {
    return "WETH";
  }
  return symbol;
};

import { zeroAddress } from "sdk/utils/evmCompat";

import type { Token, TokenAddressTypesMap, TokenCategory } from "sdk/types/tokens";

import { ARBITRUM, ARBITRUM_SEPOLIA, AVALANCHE, AVALANCHE_FUJI, BOTANIX } from "./chains";
import { getContract } from "./contracts";

export const NATIVE_TOKEN_ADDRESS = zeroAddress;

export const TOKENS: { [chainId: number]: Token[] } = {
  [ARBITRUM]: [
    {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
      address: zeroAddress,
      isNative: true,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
      coingeckoUrl: "",
      isV1Available: true,
    },
    {
      name: "Wrapped Ethereum",
      symbol: "WETH",
      decimals: 18,
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      isWrapped: true,
      baseSymbol: "ETH",
      imageUrl: "https://assets.coingecko.com/coins/images/2518/thumb/weth.png?1628852295",
      coingeckoUrl: "",
      isV1Available: true,
      isPermitSupported: true,
      contractVersion: "1",
    },
    {
      name: "Wrapped Bitcoin",
      symbol: "BTC",
      assetSymbol: "WBTC",
      baseSymbol: "BTC",
      decimals: 8,
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/26115/thumb/btcb.png?1655921693",
      coingeckoUrl: "",
      explorerUrl: "",
      isV1Available: true,
      isPermitSupported: true,
      contractVersion: "1",
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      isStable: true,
      isV1Available: true,
      imageUrl: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png?1547042389",
      coingeckoUrl: "",
      explorerUrl: "",
      isPermitSupported: true,
    },
    {
      name: "Tether",
      symbol: "USDT",
      decimals: 6,
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      isStable: true,
      imageUrl: "https://assets.coingecko.com/coins/images/325/thumb/Tether-logo.png?1598003707",
      explorerUrl: "",
      coingeckoUrl: "",
      isV1Available: true,
      isPermitSupported: true,
      contractVersion: "1",
    },
    /** Placeholder tokens */
    {
      name: "Primit Market tokens",
      symbol: "GM",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).gm
      isPlatformToken: true,
    },
    {
      name: "GLV Market tokens",
      symbol: "GLV",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).glv
      isPlatformToken: true,
    },
  ],
  [AVALANCHE]: [
    {
      name: "Avalanche",
      symbol: "AVAX",
      decimals: 18,
      address: zeroAddress,
      isNative: true,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/12559/small/coin-round-red.png?1604021818",
      coingeckoUrl: "",
      isV1Available: true,
    },
    {
      name: "Wrapped AVAX",
      symbol: "WAVAX",
      decimals: 18,
      address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      isWrapped: true,
      baseSymbol: "AVAX",
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/12559/small/coin-round-red.png?1604021818",
      coingeckoUrl: "",
      explorerUrl: "",
      isV1Available: true,
    },
    {
      name: "Ethereum (WETH.e)",
      symbol: "ETH",
      assetSymbol: "WETH.e",
      address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      decimals: 18,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
      coingeckoUrl: "",
      coingeckoSymbol: "WETH",
      explorerUrl: "",
      isV1Available: true,
    },
    {
      name: "Bitcoin (BTC.b)",
      symbol: "BTC",
      assetSymbol: "BTC.b",
      address: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
      decimals: 8,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/26115/thumb/btcb.png?1655921693",
      coingeckoUrl: "",
      explorerUrl: "",
      isV1Available: true,
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      decimals: 6,
      isStable: true,
      imageUrl: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png?1547042389",
      coingeckoUrl: "",
      explorerUrl: "",
      isV1Available: true,
      isPermitSupported: true,
    },
    {
      name: "Tether",
      symbol: "USDT",
      decimals: 6,
      address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      isStable: true,
      imageUrl: "https://assets.coingecko.com/coins/images/325/small/Tether-logo.png",
      coingeckoUrl: "",
      explorerUrl: "",
      isPermitSupported: true,
      contractVersion: "1",
    },
    /** Placeholder tokens */
    {
      name: "Primit Market tokens",
      symbol: "GM",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).gm
      isPlatformToken: true,
    },
    {
      name: "GLV Market tokens",
      symbol: "GLV",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).glv
      isPlatformToken: true,
    },
  ],
  [AVALANCHE_FUJI]: [
    {
      name: "Avalanche",
      symbol: "AVAX",
      priceDecimals: 3,
      decimals: 18,
      address: zeroAddress,
      isNative: true,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/12559/small/coin-round-red.png?1604021818",
    },
    {
      name: "Wrapped AVAX",
      symbol: "WAVAX",
      priceDecimals: 3,
      decimals: 18,
      address: "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3",
      isWrapped: true,
      baseSymbol: "AVAX",
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/12559/small/coin-round-red.png?1604021818",
      coingeckoUrl: "",
      explorerUrl: "",
      isPermitSupported: true,
    },
    {
      name: "Ethereum (WETH.e)",
      symbol: "ETH",
      assetSymbol: "WETH.e",
      address: "0x82F0b3695Ed2324e55bbD9A9554cB4192EC3a514",
      decimals: 18,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
      coingeckoUrl: "",
      coingeckoSymbol: "WETH",
      explorerUrl: "",
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      address: "0x3eBDeaA0DB3FfDe96E7a0DBBAFEC961FC50F725F",
      decimals: 6,
      isStable: true,
      imageUrl: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png?1547042389",
      coingeckoUrl: "",
      explorerUrl: "",
    },
    {
      name: "Tether",
      symbol: "USDT",
      decimals: 6,
      address: "0x289a53c680dD1162cD792101Fff5352728C6Fa41",
      isStable: true,
      imageUrl: "https://assets.coingecko.com/coins/images/325/small/Tether-logo.png",
      coingeckoUrl: "",
      explorerUrl: "",
    },
    {
      name: "Wrapped Bitcoin",
      symbol: "WBTC",
      decimals: 8,
      address: "0x3Bd8e00c25B12E6E60fc8B6f1E1E2236102073Ca",
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/7598/thumb/wrapped_bitcoin_wbtc.png?1548822744",
      coingeckoUrl: "",
      explorerUrl: "",
    },
    /** Placeholder tokens */
    {
      name: "Primit Market tokens",
      symbol: "GM",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).gm
      isPlatformToken: true,
    },
    {
      name: "GLV Market tokens",
      symbol: "GLV",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).glv
      isPlatformToken: true,
    },
  ],
  [ARBITRUM_SEPOLIA]: [
    {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
      address: zeroAddress,
      wrappedAddress: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      isNative: true,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
      coingeckoUrl: "",
    },
    {
      name: "Wrapped ETH",
      symbol: "WETH",
      address: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
      decimals: 18,
      isWrapped: true,
      baseSymbol: "ETH",
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png?1595348880",
      coingeckoUrl: "",
    },
    {
      name: "Bitcoin",
      symbol: "BTC",
      address: "0xF79cE1Cf38A09D572b021B4C5548b75A14082F12",
      decimals: 8,
      imageUrl: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png?1746042828",
      coingeckoUrl: "",
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      address: "0x3321Fd36aEaB0d5CdfD26f4A3A93E2D2aAcCB99f",
      decimals: 6,
      isStable: true,
      imageUrl: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png?1547042389",
      coingeckoUrl: "",
    },
    {
      name: "USDT",
      symbol: "USDT",
      address: "0xc96BDE5008518332Bb5c45177f9E70D75Ea5D865",
      decimals: 6,
      isStable: true,
      imageUrl: "https://assets.coingecko.com/coins/images/325/small/Tether-logo.png",
      coingeckoUrl: "",
    },
    /** Placeholder tokens */
    {
      name: "Primit Market tokens",
      symbol: "GM",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).gm
      isPlatformToken: true,
    },
    {
      name: "GLV Market tokens",
      symbol: "GLV",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).glv
      isPlatformToken: true,
    },
  ],
  [BOTANIX]: [
    {
      name: "Bitcoin",
      symbol: "BTC",
      assetSymbol: "BTC",
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      isNative: true,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400",
      coingeckoUrl: "",
      baseSymbol: "BTC",
    },
    {
      name: "Pegged BTC",
      symbol: "PBTC",
      assetSymbol: "pBTC",
      address: "0x0D2437F93Fed6EA64Ef01cCde385FB1263910C56",
      decimals: 18,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400",
      coingeckoUrl: "",
      baseSymbol: "BTC",
      isWrapped: true,
    },
    {
      name: "Staked BTC",
      symbol: "STBTC",
      assetSymbol: "stBTC",
      address: "0xF4586028FFdA7Eca636864F80f8a3f2589E33795",
      decimals: 18,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400",
      coingeckoUrl: "",
      baseSymbol: "BTC",
      isStaking: true,
    },
    {
      name: "BTC",
      symbol: "BTC",
      address: "0x1B9e25f54225bcdCf347569E38C41Ade9BB686e5",
      decimals: 8,
      isShortable: true,
      categories: ["layer1"],
      imageUrl: "https://assets.coingecko.com/coins/images/1/standard/bitcoin.png?1696501400",
      coingeckoUrl: "",
      isSynthetic: true,
    },
    {
      name: "USDC.E",
      symbol: "USDC.E",
      assetSymbol: "USDC.e",
      address: "0x29eE6138DD4C9815f46D34a4A1ed48F46758A402",
      decimals: 6,
      isStable: true,
      imageUrl: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png?1547042389",
      coingeckoUrl: "",
      isPermitSupported: true,
    },
    /** Placeholder tokens */
    {
      name: "Primit Market tokens",
      symbol: "GM",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).gm
      isPlatformToken: true,
    },
    {
      name: "GLV Market tokens",
      symbol: "GLV",
      address: "<market-token-address>",
      decimals: 18,
      // imageUrl provided by getIcons(...).glv
      isPlatformToken: true,
    },
  ],
};

export const TOKEN_COLOR_MAP = {
  ETH: "#6062a6",
  BTC: "#F7931A",
  WBTC: "#F7931A",
  PBTC: "#F7931A",
  USDC: "#2775CA",
  "USDC.E": "#2A5ADA",
  USDT: "#67B18A",
  AVAX: "#E84142",
  default: "#6062a6",
};

export const TOKENS_MAP: { [chainId: number]: { [address: string]: Token } } = {};
export const V1_TOKENS: { [chainId: number]: Token[] } = {};
export const V2_TOKENS: { [chainId: number]: Token[] } = {};
export const SYNTHETIC_TOKENS: { [chainId: number]: Token[] } = {};
export const TOKENS_BY_SYMBOL_MAP: { [chainId: number]: { [symbol: string]: Token } } = {};
export const WRAPPED_TOKENS_MAP: { [chainId: number]: Token } = {};
export const NATIVE_TOKENS_MAP: { [chainId: number]: Token } = {};

const CHAIN_IDS = [ARBITRUM, AVALANCHE, AVALANCHE_FUJI, BOTANIX, ARBITRUM_SEPOLIA];

for (let j = 0; j < CHAIN_IDS.length; j++) {
  const chainId = CHAIN_IDS[j];

  TOKENS_MAP[chainId] = {};
  TOKENS_BY_SYMBOL_MAP[chainId] = {};
  SYNTHETIC_TOKENS[chainId] = [];
  V1_TOKENS[chainId] = [];
  V2_TOKENS[chainId] = [];

  let tokens = TOKENS[chainId];
  let wrappedTokenAddress: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    TOKENS_MAP[chainId][token.address] = token;
    TOKENS_BY_SYMBOL_MAP[chainId][token.symbol] = token;

    if (token.isWrapped) {
      WRAPPED_TOKENS_MAP[chainId] = token;
      wrappedTokenAddress = token.address;
    }

    if (token.isNative) {
      NATIVE_TOKENS_MAP[chainId] = token;
    }

    if (token.isV1Available && !token.isTempHidden) {
      V1_TOKENS[chainId].push(token);
    }

    if ((!token.isPlatformToken || (token.isPlatformToken && token.isPlatformTradingToken)) && !token.isTempHidden) {
      V2_TOKENS[chainId].push(token);
    }

    if (token.isSynthetic) {
      SYNTHETIC_TOKENS[chainId].push(token);
    }
  }

  NATIVE_TOKENS_MAP[chainId].wrappedAddress = wrappedTokenAddress;
}

export function getSyntheticTokens(chainId: number) {
  return SYNTHETIC_TOKENS[chainId];
}

export function getWrappedToken(chainId: number) {
  return WRAPPED_TOKENS_MAP[chainId];
}

export function getNativeToken(chainId: number) {
  return NATIVE_TOKENS_MAP[chainId];
}

export function getTokens(chainId: number) {
  return TOKENS[chainId];
}

export function getV1Tokens(chainId: number) {
  return V1_TOKENS[chainId];
}

export function getV2Tokens(chainId: number) {
  return V2_TOKENS[chainId];
}

export function getTokensMap(chainId: number) {
  return TOKENS_MAP[chainId];
}

export function getWhitelistedV1Tokens(chainId: number) {
  return getV1Tokens(chainId);
}

export function getVisibleV1Tokens(chainId: number) {
  return getV1Tokens(chainId).filter((token) => !token.isWrapped);
}

export function isValidToken(chainId: number, address: string) {
  if (!TOKENS_MAP[chainId]) {
    throw new Error(`Incorrect chainId ${chainId}`);
  }
  return address in TOKENS_MAP[chainId];
}

export function isValidTokenSafe(chainId: number, address: string) {
  return address in TOKENS_MAP[chainId];
}

export function getToken(chainId: number, address: string) {
  // FIXME APE_deprecated token which is not in use but can be displayed
  if (chainId === ARBITRUM && address === "0x74885b4D524d497261259B38900f54e6dbAd2210") {
    return getTokenBySymbol(chainId, "APE");
  }

  if (!TOKENS_MAP[chainId]) {
    throw new Error(`Incorrect chainId ${chainId}`);
  }
  if (!TOKENS_MAP[chainId][address]) {
    throw new Error(`Incorrect address "${address}" for chainId ${chainId}`);
  }

  return TOKENS_MAP[chainId][address];
}

export function getTokenBySymbol(
  chainId: number,
  symbol: string,
  {
    isSynthetic,
    version,
    symbolType = "symbol",
  }: { isSynthetic?: boolean; version?: "v1" | "v2"; symbolType?: "symbol" | "baseSymbol" } = {}
) {
  let tokens = Object.values(TOKENS_MAP[chainId]);

  if (version) {
    tokens = version === "v1" ? getV1Tokens(chainId) : getV2Tokens(chainId);
  }

  let token: Token | undefined;

  if (isSynthetic !== undefined) {
    token = tokens.find((token) => {
      return token[symbolType]?.toLowerCase() === symbol.toLowerCase() && Boolean(token.isSynthetic) === isSynthetic;
    });
  } else {
    if (symbolType === "symbol" && TOKENS_BY_SYMBOL_MAP[chainId][symbol]) {
      token = TOKENS_BY_SYMBOL_MAP[chainId][symbol];
    } else {
      token = tokens.find((token) => token[symbolType]?.toLowerCase() === symbol.toLowerCase());
    }
  }

  if (!token) {
    throw new Error(`Incorrect symbol "${symbol}" for chainId ${chainId}`);
  }

  return token;
}

export function convertTokenAddress<T extends keyof TokenAddressTypesMap, R extends TokenAddressTypesMap[T]>(
  chainId: number,
  address: string,
  convertTo?: T
): R {
  const wrappedToken = getWrappedToken(chainId);

  if (convertTo === "wrapped" && address === NATIVE_TOKEN_ADDRESS) {
    return wrappedToken.address as R;
  }

  if (convertTo === "native" && address === wrappedToken.address) {
    return NATIVE_TOKEN_ADDRESS as R;
  }

  return address as R;
}

export function getNormalizedTokenSymbol(tokenSymbol: string) {
  if (["WBTC", "WETH", "WAVAX"].includes(tokenSymbol)) {
    return tokenSymbol.substr(1);
  } else if (["PBTC", "STBTC"].includes(tokenSymbol)) {
    return "BTC";
  } else if (tokenSymbol.includes(".")) {
    return tokenSymbol.split(".")[0];
  }
  return tokenSymbol;
}

export function isChartAvailableForToken(chainId: number, tokenSymbol: string) {
  let token;

  try {
    token = getTokenBySymbol(chainId, tokenSymbol);
  } catch (e) {
    return false;
  }

  if (token.isChartDisabled || (token.isPlatformToken && !token.isPlatformTradingToken)) return false;

  return true;
}

export function getPriceDecimals(chainId: number, tokenSymbol?: string) {
  if (!tokenSymbol) return 2;

  try {
    const token = getTokenBySymbol(chainId, tokenSymbol);
    return token.priceDecimals ?? 2;
  } catch (e) {
    return 2;
  }
}

export function getTokenBySymbolSafe(
  chainId: number,
  symbol: string,
  params: Parameters<typeof getTokenBySymbol>[2] = {}
) {
  try {
    return getTokenBySymbol(chainId, symbol, params);
  } catch (e) {
    return;
  }
}

export function isTokenInList(token: Token, tokenList: Token[]): boolean {
  return tokenList.some((t) => t.address === token.address);
}

export function isSimilarToken(tokenA: Token, tokenB: Token) {
  if (tokenA.address === tokenB.address) {
    return true;
  }

  if (tokenA.symbol === tokenB.symbol || tokenA.baseSymbol === tokenB.symbol || tokenA.symbol === tokenB.baseSymbol) {
    return true;
  }

  return false;
}

export function getTokenVisualMultiplier(token: Token): string {
  return token.visualPrefix || token.visualMultiplier?.toString() || "";
}

export function getStableTokens(chainId: number) {
  return getTokens(chainId).filter((t) => t.isStable);
}

export function getCategoryTokenAddresses(chainId: number, category: TokenCategory) {
  return TOKENS[chainId].filter((token) => token.categories?.includes(category)).map((token) => token.address);
}

export const createTokensMap = (tokens: Token[]) => {
  return tokens.reduce(
    (acc, token) => {
      acc[token.address] = token;
      return acc;
    },
    {} as Record<string, Token>
  );
};

const USD_BASED_STABLE_TOKEN_SYMBOLS = ["USDC", "USDC.E", "USDT", "DAI", "USDC.SG"];

export function isUsdBasedStableToken(token: Token) {
  return USD_BASED_STABLE_TOKEN_SYMBOLS.includes(token.symbol);
}

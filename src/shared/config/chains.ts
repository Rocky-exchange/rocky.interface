import sample from "lodash/sample";

import {
  AnyChainId,
  BOTANIX,
  ContractsChainId,
  CONTRACTS_CHAIN_IDS as SDK_CONTRACTS_CHAIN_IDS,
  CONTRACTS_CHAIN_IDS_DEV as SDK_CONTRACTS_CHAIN_IDS_DEV,
  SOURCE_BASE_MAINNET,
  SOURCE_BSC_MAINNET,
  SOURCE_OPTIMISM_SEPOLIA,
  SOURCE_SEPOLIA,
} from "sdk/configs/chains";

import { isDevelopment } from "./env";
import { ARBITRUM, ARBITRUM_SEPOLIA, AVALANCHE, AVALANCHE_FUJI, ETH_MAINNET } from "./static/chains";

export { CHAIN_NAMES_MAP, getChainName } from "sdk/configs/chains";
export * from "./static/chains";

export const CONTRACTS_CHAIN_IDS = isDevelopment() ? SDK_CONTRACTS_CHAIN_IDS_DEV : SDK_CONTRACTS_CHAIN_IDS;

function parseEther(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  const normalizedFraction = fraction.padEnd(18, "0").slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(normalizedFraction || "0");
}

export const ENV_ARBITRUM_RPC_URLS = import.meta.env.VITE_APP_ARBITRUM_RPC_URLS;
export const ENV_AVALANCHE_RPC_URLS = import.meta.env.VITE_APP_AVALANCHE_RPC_URLS;
export const ENV_AVALANCHE_FUJI_RPC_URLS = import.meta.env.VITE_APP_AVALANCHE_FUJI_RPC_URLS;
export const ENV_BOTANIX_RPC_URLS = import.meta.env.VITE_APP_BOTANIX_RPC_URLS;

const FALLBACK_DEFAULT_CHAIN_ID: ContractsChainId = AVALANCHE;

function resolveDefaultChainId(): ContractsChainId {
  const raw = import.meta.env.VITE_DEFAULT_CHAIN;
  if (!raw) return FALLBACK_DEFAULT_CHAIN_ID;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return FALLBACK_DEFAULT_CHAIN_ID;

  return (CONTRACTS_CHAIN_IDS as readonly number[]).includes(parsed)
    ? (parsed as ContractsChainId)
    : FALLBACK_DEFAULT_CHAIN_ID;
}

export const DEFAULT_CHAIN_ID = resolveDefaultChainId();
export const CHAIN_ID = DEFAULT_CHAIN_ID;

export const IS_NETWORK_DISABLED: Record<ContractsChainId, boolean> = {
  [ARBITRUM]: false,
  [AVALANCHE]: false,
  [ARBITRUM_SEPOLIA]: true, // 禁用
  [AVALANCHE_FUJI]: true, // 禁用
  [BOTANIX]: true, // 禁用
};

export const NETWORK_EXECUTION_TO_CREATE_FEE_FACTOR = {
  [ARBITRUM]: 10n ** 29n * 5n,
  [AVALANCHE]: 10n ** 29n * 35n,
  [AVALANCHE_FUJI]: 10n ** 29n * 2n,
} as const;

const constants = {
  [ARBITRUM]: {
    nativeTokenSymbol: "ETH",
    wrappedTokenSymbol: "WETH",
    defaultCollateralSymbol: "USDC.e",
    defaultFlagOrdersEnabled: false,
    positionReaderPropsLength: 9,
    v2: true,

    SWAP_ORDER_EXECUTION_GAS_FEE: parseEther("0.0003"),
    INCREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.0003"),
    // contract requires that execution fee be strictly greater than instead of gte
    DECREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.000300001"),
  },

  [AVALANCHE]: {
    nativeTokenSymbol: "AVAX",
    wrappedTokenSymbol: "WAVAX",
    defaultCollateralSymbol: "USDT",
    defaultFlagOrdersEnabled: true,
    positionReaderPropsLength: 9,
    v2: true,

    SWAP_ORDER_EXECUTION_GAS_FEE: parseEther("0.01"),
    INCREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.01"),
    // contract requires that execution fee be strictly greater than instead of gte
    DECREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.0100001"),
  },

  [AVALANCHE_FUJI]: {
    nativeTokenSymbol: "AVAX",
    wrappedTokenSymbol: "WAVAX",
    defaultCollateralSymbol: "USDT",
    defaultFlagOrdersEnabled: true,
    positionReaderPropsLength: 9,
    v2: true,

    SWAP_ORDER_EXECUTION_GAS_FEE: parseEther("0.01"),
    INCREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.01"),
    // contract requires that execution fee be strictly greater than instead of gte
    DECREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.0100001"),
  },

  [ARBITRUM_SEPOLIA]: {
    nativeTokenSymbol: "ETH",
    wrappedTokenSymbol: "WETH",
    defaultCollateralSymbol: "USDC",
    defaultFlagOrdersEnabled: true,
    positionReaderPropsLength: 9,
    v2: true,

    SWAP_ORDER_EXECUTION_GAS_FEE: parseEther("0.01"),
    INCREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.01"),
    // contract requires that execution fee be strictly greater than instead of gte
    DECREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.0100001"),
  },
  [BOTANIX]: {
    nativeTokenSymbol: "BTC",
    wrappedTokenSymbol: "PBTC",
    defaultCollateralSymbol: "USDC.E",
    defaultFlagOrdersEnabled: true,
    positionReaderPropsLength: 9,
    v2: true,

    SWAP_ORDER_EXECUTION_GAS_FEE: parseEther("0.01"),
    INCREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.01"),
    // contract requires that execution fee be strictly greater than instead of gte
    DECREASE_ORDER_EXECUTION_GAS_FEE: parseEther("0.0100001"),
  },
} satisfies Record<ContractsChainId, Record<string, any>>;

const _ALCHEMY_WHITELISTED_DOMAINS = ["primit.io", "www.primit.io", "app.primit.io", "api.primit.io"];
const _PRIMIT_DOMAINS = ["primit.io", "www.primit.io", "app.primit.io", "api.primit.io"];

export const RPC_PROVIDERS: Record<AnyChainId | typeof ETH_MAINNET, string[]> = {
  [ETH_MAINNET]: [],
  [ARBITRUM]: [],
  [AVALANCHE]: [],
  [AVALANCHE_FUJI]: [],
  [ARBITRUM_SEPOLIA]: [],
  [SOURCE_BASE_MAINNET]: [],
  [SOURCE_OPTIMISM_SEPOLIA]: [],
  [SOURCE_SEPOLIA]: [],
  [BOTANIX]: [],
  [SOURCE_BSC_MAINNET]: [],
};

export const FALLBACK_PROVIDERS: Record<AnyChainId, string[]> = {
  [ARBITRUM]: [],
  [AVALANCHE]: [],
  [AVALANCHE_FUJI]: [],
  [BOTANIX]: [],
  [ARBITRUM_SEPOLIA]: [],
  [SOURCE_BASE_MAINNET]: [],
  [SOURCE_OPTIMISM_SEPOLIA]: [],
  [SOURCE_SEPOLIA]: [],
  [SOURCE_BSC_MAINNET]: [],
};

export const PRIVATE_RPC_PROVIDERS: Partial<Record<AnyChainId, string[]>> = {
};

export const EXPRESS_RPC_PROVIDERS: Partial<Record<AnyChainId, string[]>> = {
};

type ConstantName = keyof (typeof constants)[ContractsChainId];

export const getConstant = <T extends ContractsChainId, K extends ConstantName>(
  chainId: T,
  key: K
): (typeof constants)[T][K] => {
  if (!constants[chainId]) {
    throw new Error(`Unsupported chainId ${chainId}`);
  }

  if (!(key in constants[chainId])) {
    throw new Error(`Key ${key} does not exist for chainId ${chainId}`);
  }

  return constants[chainId][key];
};

export function getFallbackRpcUrl(_chainId: number, _isLargeAccount = false): string {
  return "";
}

export function getExpressRpcUrl(_chainId: number): string {
  return "";
}

type AlchemyKeyPurpose = "fallback" | "largeAccount" | "express";

function getAlchemyKey(_purpose: AlchemyKeyPurpose = "fallback") {
  return import.meta.env.VITE_ALCHEMY_API_KEY ?? "";
}

export function getAlchemyArbitrumHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyAvalancheHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyAvalancheFujiHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyArbitrumWsUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyBotanixHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyBotanixWsUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyOptimismSepoliaHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyOptimismSepoliaWsUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyArbitrumSepoliaHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyArbitrumSepoliaWsUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyBaseMainnetHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyBaseMainnetWsUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyBscMainnetHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemyBscMainnetWsUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemySepoliaHttpUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getAlchemySepoliaWsUrl(_purpose: AlchemyKeyPurpose = "fallback") {
  return "";
}

export function getExplorerUrl(_chainId: number): string {
  return "";
}

export function getTokenExplorerUrl(chainId: number, tokenAddress: string) {
  return `${getExplorerUrl(chainId)}token/${tokenAddress}`;
}

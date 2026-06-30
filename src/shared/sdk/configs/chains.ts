import { Chain, defineChain } from "sdk/utils/evmCompat";

import type { GasLimitsConfig } from "sdk/types/fees";

import {
  AVALANCHE,
  AVALANCHE_FUJI,
  ARBITRUM,
  BOTANIX,
  ETH_MAINNET,
  ARBITRUM_SEPOLIA,
  SOURCE_OPTIMISM_SEPOLIA,
  SOURCE_SEPOLIA,
  SOURCE_BASE_MAINNET,
  SOURCE_BSC_MAINNET,
} from "./chainIds";
export {
  AVALANCHE,
  AVALANCHE_FUJI,
  ARBITRUM,
  BOTANIX,
  ETH_MAINNET,
  ARBITRUM_SEPOLIA,
  SOURCE_OPTIMISM_SEPOLIA,
  SOURCE_SEPOLIA,
  SOURCE_BASE_MAINNET,
  SOURCE_BSC_MAINNET,
};

export const CONTRACTS_CHAIN_IDS: ContractsChainId[] = [AVALANCHE];
export const CONTRACTS_CHAIN_IDS_DEV: ContractsChainId[] = [AVALANCHE, AVALANCHE_FUJI];

export type ContractsChainId =
  | typeof ARBITRUM
  | typeof AVALANCHE
  | typeof AVALANCHE_FUJI
  | typeof BOTANIX
  | typeof ARBITRUM_SEPOLIA;
export type ContractsChainIdProduction = Exclude<ContractsChainId, typeof AVALANCHE_FUJI | typeof ARBITRUM_SEPOLIA>;

export type SettlementChainId = typeof ARBITRUM_SEPOLIA | typeof ARBITRUM | typeof AVALANCHE;
export type SourceChainId =
  | typeof SOURCE_OPTIMISM_SEPOLIA
  | typeof SOURCE_SEPOLIA
  | typeof SOURCE_BASE_MAINNET
  | typeof SOURCE_BSC_MAINNET;
export type AnyChainId = ContractsChainId | SettlementChainId | SourceChainId;

export type ChainName =
  | "Canton"
  | "Disabled";

export const CHAIN_NAMES_MAP: Record<AnyChainId, ChainName> = {
  [ARBITRUM]: "Disabled",
  [AVALANCHE]: "Disabled",
  [AVALANCHE_FUJI]: "Disabled",
  [BOTANIX]: "Disabled",
  [ARBITRUM_SEPOLIA]: "Disabled",
  [SOURCE_OPTIMISM_SEPOLIA]: "Disabled",
  [SOURCE_SEPOLIA]: "Disabled",
  [SOURCE_BASE_MAINNET]: "Disabled",
  [SOURCE_BSC_MAINNET]: "Disabled",
};

export const CHAIN_SLUGS_MAP: Record<ContractsChainId, string> = {
  [ARBITRUM]: "disabled",
  [AVALANCHE]: "disabled",
  [AVALANCHE_FUJI]: "disabled",
  [ARBITRUM_SEPOLIA]: "disabled",
  [BOTANIX]: "disabled",
};

export const HIGH_EXECUTION_FEES_MAP: Record<ContractsChainId, number> = {
  [ARBITRUM]: 5, // 5 USD
  [AVALANCHE]: 5, // 5 USD
  [AVALANCHE_FUJI]: 5, // 5 USD
  [BOTANIX]: 5, // 5 USD
  [ARBITRUM_SEPOLIA]: 5, // 5 USD
};

// added to maxPriorityFeePerGas
// applied to EIP-1559 transactions only
// is not applied to execution fee calculation
export const MAX_FEE_PER_GAS_MAP: Record<number, bigint> = {
  [AVALANCHE]: 200000000000n, // 200 gwei
  [BOTANIX]: 20n,
};

// added to maxPriorityFeePerGas
// applied to EIP-1559 transactions only
// is also applied to the execution fee calculation
export const GAS_PRICE_PREMIUM_MAP: Record<number, bigint> = {
  [ARBITRUM]: 0n,
  [AVALANCHE]: 6000000000n, // 6 gwei
};

// Legacy minimum priority fee values retained for compatibility shapes.
export const MAX_PRIORITY_FEE_PER_GAS_MAP: Record<ContractsChainId, bigint | undefined> = {
  [ARBITRUM]: 1500000000n,
  [AVALANCHE]: 1500000000n,
  [AVALANCHE_FUJI]: 1500000000n,
  [ARBITRUM_SEPOLIA]: 1500000000n,
  [BOTANIX]: 7n,
};

export const EXCESSIVE_EXECUTION_FEES_MAP: Partial<Record<ContractsChainId, number>> = {
  [ARBITRUM]: 10, // 10 USD
  [AVALANCHE]: 10, // 10 USD
  [AVALANCHE_FUJI]: 10, // 10 USD
  [BOTANIX]: 10, // 10 USD
};

// Avoid stale gas spikes when the legacy chain is not actively used.
// if set, execution fee value should not be less than this in USD equivalent
export const MIN_EXECUTION_FEE_USD: Partial<Record<ContractsChainId, bigint | undefined>> = {
  [ARBITRUM]: undefined,
  [AVALANCHE]: undefined,
  [AVALANCHE_FUJI]: undefined,
  [BOTANIX]: 1000000000000000000000000000n, // 1e27 $0.001
};

// added to gasPrice
// applied to legacy gas-price transactions only
//
// it is *not* applied to the execution fee calculation, and in theory it could cause issues
// if gas price used in the execution fee calculation is lower than the gas price used in the transaction
// then the transaction will fail with InsufficientExecutionFee error.
//
// it doesn't make much sense to set this buffer higher than the execution fee buffer
// because if the paid gas price is higher than the gas price used in the execution fee calculation
// and the transaction will still fail with InsufficientExecutionFee
//
// this buffer could also cause issues on a blockchain that uses passed gas price
// especially if execution fee buffer and lower than gas price buffer defined bellow
export const GAS_PRICE_BUFFER_MAP: Record<number, bigint> = {
  [ARBITRUM]: 2000n, // 20%
};

function defineDisabledChain(id: number): Chain {
  return defineChain({
    id,
    name: "Canton Disabled",
    nativeCurrency: {
      name: "Canton",
      symbol: "CC",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [],
      },
    },
  });
}

const disabledChainByChainId: Record<AnyChainId, Chain> = {
  [AVALANCHE_FUJI]: defineDisabledChain(AVALANCHE_FUJI),
  [ARBITRUM]: defineDisabledChain(ARBITRUM),
  [AVALANCHE]: defineDisabledChain(AVALANCHE),
  [ARBITRUM_SEPOLIA]: defineDisabledChain(ARBITRUM_SEPOLIA),
  [BOTANIX]: defineDisabledChain(BOTANIX),
  [SOURCE_OPTIMISM_SEPOLIA]: defineDisabledChain(SOURCE_OPTIMISM_SEPOLIA),
  [SOURCE_SEPOLIA]: defineDisabledChain(SOURCE_SEPOLIA),
  [SOURCE_BASE_MAINNET]: defineDisabledChain(SOURCE_BASE_MAINNET),
  [SOURCE_BSC_MAINNET]: defineDisabledChain(SOURCE_BSC_MAINNET),
};

export const cantonDisabledChain: Chain = defineChain({
  id: BOTANIX,
  name: "Canton Disabled",
  nativeCurrency: {
    name: "Canton",
    symbol: "CC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [],
    },
  },
});

const VIEM_CHAIN_BY_CHAIN_ID: Record<AnyChainId, Chain> = {
  ...disabledChainByChainId,
};

export function getChainName(chainId: number): ChainName {
  return CHAIN_NAMES_MAP[chainId];
}

export const getViemChain = (chainId: number): Chain => {
  return VIEM_CHAIN_BY_CHAIN_ID[chainId];
};

export function getHighExecutionFee(chainId: number) {
  return HIGH_EXECUTION_FEES_MAP[chainId] ?? 5;
}

export function getExcessiveExecutionFee(chainId: number) {
  return EXCESSIVE_EXECUTION_FEES_MAP[chainId] ?? 10;
}

export function isContractsChain(chainId: number, dev = false): chainId is ContractsChainId {
  return (dev ? CONTRACTS_CHAIN_IDS_DEV : CONTRACTS_CHAIN_IDS).includes(chainId as ContractsChainId);
}

export function isTestnetChain(chainId: number): boolean {
  return [AVALANCHE_FUJI, ARBITRUM_SEPOLIA].includes(chainId);
}

export const EXECUTION_FEE_CONFIG_V2: {
  [chainId in ContractsChainId]: {
    shouldUseMaxPriorityFeePerGas: boolean;
    defaultBufferBps?: number;
  };
} = {
  [AVALANCHE]: {
    shouldUseMaxPriorityFeePerGas: true,
    defaultBufferBps: 1000, // 10%
  },
  [AVALANCHE_FUJI]: {
    shouldUseMaxPriorityFeePerGas: true,
    defaultBufferBps: 1000, // 10%
  },
  [ARBITRUM]: {
    shouldUseMaxPriorityFeePerGas: false,
    defaultBufferBps: 3000, // 30%
  },
  [ARBITRUM_SEPOLIA]: {
    shouldUseMaxPriorityFeePerGas: false,
    defaultBufferBps: 1000, // 10%
  },
  [BOTANIX]: {
    shouldUseMaxPriorityFeePerGas: true,
    defaultBufferBps: 3000, // 30%
  },
};

type StaticGasLimitsConfig = Pick<
  GasLimitsConfig,
  | "createOrderGasLimit"
  | "updateOrderGasLimit"
  | "cancelOrderGasLimit"
  | "tokenPermitGasLimit"
  | "tradingAccountCollateralGasLimit"
>;

export const GAS_LIMITS_STATIC_CONFIG: Record<ContractsChainId, StaticGasLimitsConfig> = {
  [ARBITRUM]: {
    createOrderGasLimit: 1_000_000n,
    updateOrderGasLimit: 800_000n,
    cancelOrderGasLimit: 700_000n,
    tokenPermitGasLimit: 90_000n,
    tradingAccountCollateralGasLimit: 0n,
  },
  [AVALANCHE]: {
    createOrderGasLimit: 1_000_000n,
    updateOrderGasLimit: 800_000n,
    cancelOrderGasLimit: 700_000n,
    tokenPermitGasLimit: 90_000n,
    tradingAccountCollateralGasLimit: 0n,
  },
  [AVALANCHE_FUJI]: {
    createOrderGasLimit: 1_000_000n,
    updateOrderGasLimit: 800_000n,
    cancelOrderGasLimit: 700_000n,
    tokenPermitGasLimit: 90_000n,
    tradingAccountCollateralGasLimit: 0n,
  },
  [ARBITRUM_SEPOLIA]: {
    createOrderGasLimit: 1_000_000n,
    updateOrderGasLimit: 800_000n,
    cancelOrderGasLimit: 1_500_000n,
    tokenPermitGasLimit: 90_000n,
    tradingAccountCollateralGasLimit: 400_000n,
  },
  [BOTANIX]: {
    createOrderGasLimit: 1_000_000n,
    updateOrderGasLimit: 800_000n,
    cancelOrderGasLimit: 700_000n,
    tokenPermitGasLimit: 90_000n,
    tradingAccountCollateralGasLimit: 0n,
  },
};

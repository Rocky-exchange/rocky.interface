import { defineChain } from "viem";
import { arbitrum, arbitrumSepolia, avalanche, avalancheFuji, base, optimismSepolia, sepolia, bsc, } from "viem/chains";
import { AVALANCHE, AVALANCHE_FUJI, ARBITRUM, BOTANIX, ETH_MAINNET, ARBITRUM_SEPOLIA, SOURCE_OPTIMISM_SEPOLIA, SOURCE_SEPOLIA, SOURCE_BASE_MAINNET, SOURCE_BSC_MAINNET, } from "./chainIds";
export { AVALANCHE, AVALANCHE_FUJI, ARBITRUM, BOTANIX, ETH_MAINNET, ARBITRUM_SEPOLIA, SOURCE_OPTIMISM_SEPOLIA, SOURCE_SEPOLIA, SOURCE_BASE_MAINNET, SOURCE_BSC_MAINNET, };
export const CONTRACTS_CHAIN_IDS = [ARBITRUM]; // 只保留 Arbitrum
export const CONTRACTS_CHAIN_IDS_DEV = [ARBITRUM, ARBITRUM_SEPOLIA]; // 开发环境包含测试网
export const CHAIN_NAMES_MAP = {
    [ARBITRUM]: "Arbitrum",
    [AVALANCHE]: "Avalanche",
    [AVALANCHE_FUJI]: "Avalanche Fuji",
    [BOTANIX]: "Botanix",
    [ARBITRUM_SEPOLIA]: "Arbitrum Sepolia",
    [SOURCE_OPTIMISM_SEPOLIA]: "Optimism Sepolia",
    [SOURCE_SEPOLIA]: "Sepolia",
    [SOURCE_BASE_MAINNET]: "Base",
    [SOURCE_BSC_MAINNET]: "BNB",
};
export const CHAIN_SLUGS_MAP = {
    [ARBITRUM]: "arbitrum",
    [AVALANCHE]: "avalanche",
    [AVALANCHE_FUJI]: "fuji",
    [ARBITRUM_SEPOLIA]: "arbitrum-sepolia",
    [BOTANIX]: "botanix",
};
export const HIGH_EXECUTION_FEES_MAP = {
    [ARBITRUM]: 5, // 5 USD
    [AVALANCHE]: 5, // 5 USD
    [AVALANCHE_FUJI]: 5, // 5 USD
    [BOTANIX]: 5, // 5 USD
    [ARBITRUM_SEPOLIA]: 5, // 5 USD
};
// added to maxPriorityFeePerGas
// applied to EIP-1559 transactions only
// is not applied to execution fee calculation
export const MAX_FEE_PER_GAS_MAP = {
    [AVALANCHE]: 200000000000n, // 200 gwei
    [BOTANIX]: 20n,
};
// added to maxPriorityFeePerGas
// applied to EIP-1559 transactions only
// is also applied to the execution fee calculation
export const GAS_PRICE_PREMIUM_MAP = {
    [ARBITRUM]: 0n,
    [AVALANCHE]: 6000000000n, // 6 gwei
};
/*
  that was a constant value in ethers v5, after ethers v6 migration we use it as a minimum for maxPriorityFeePerGas
*/
export const MAX_PRIORITY_FEE_PER_GAS_MAP = {
    [ARBITRUM]: 1500000000n,
    [AVALANCHE]: 1500000000n,
    [AVALANCHE_FUJI]: 1500000000n,
    [ARBITRUM_SEPOLIA]: 1500000000n,
    [BOTANIX]: 7n,
};
export const EXCESSIVE_EXECUTION_FEES_MAP = {
    [ARBITRUM]: 10, // 10 USD
    [AVALANCHE]: 10, // 10 USD
    [AVALANCHE_FUJI]: 10, // 10 USD
    [BOTANIX]: 10, // 10 USD
};
// avoid botanix gas spikes when chain is not actively used
// if set, execution fee value should not be less than this in USD equivalent
export const MIN_EXECUTION_FEE_USD = {
    [ARBITRUM]: undefined,
    [AVALANCHE]: undefined,
    [AVALANCHE_FUJI]: undefined,
    [BOTANIX]: 1000000000000000000000000000n, // 1e27 $0.001
};
// added to gasPrice
// applied to *non* EIP-1559 transactions only
//
// it is *not* applied to the execution fee calculation, and in theory it could cause issues
// if gas price used in the execution fee calculation is lower
// than the gas price used in the transaction (e.g. create order transaction)
// then the transaction will fail with InsufficientExecutionFee error.
// it is not an issue on Arbitrum though because the passed gas price does not affect the paid gas price.
// for example if current gas price is 0.1 gwei and UI passes 0.5 gwei the transaction
// Arbitrum will still charge 0.1 gwei per gas
//
// it doesn't make much sense to set this buffer higher than the execution fee buffer
// because if the paid gas price is higher than the gas price used in the execution fee calculation
// and the transaction will still fail with InsufficientExecutionFee
//
// this buffer could also cause issues on a blockchain that uses passed gas price
// especially if execution fee buffer and lower than gas price buffer defined bellow
export const GAS_PRICE_BUFFER_MAP = {
    [ARBITRUM]: 2000n, // 20%
};
export const botanix = defineChain({
    id: BOTANIX,
    name: "Botanix",
    nativeCurrency: {
        name: "Bitcoin",
        symbol: "BTC",
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: [
                // this rpc returns incorrect gas price
                // "https://rpc.botanixlabs.com",
                "https://rpc.ankr.com/botanix_mainnet",
            ],
        },
    },
    blockExplorers: {
        default: {
            name: "BotanixScan",
            url: "https://botanixscan.io",
        },
    },
    contracts: {
        multicall3: {
            address: "0x4BaA24f93a657f0c1b4A0Ffc72B91011E35cA46b",
        },
    },
});
const VIEM_CHAIN_BY_CHAIN_ID = {
    [AVALANCHE_FUJI]: avalancheFuji,
    [ARBITRUM]: arbitrum,
    [AVALANCHE]: avalanche,
    [ARBITRUM_SEPOLIA]: arbitrumSepolia,
    [BOTANIX]: botanix,
    [SOURCE_OPTIMISM_SEPOLIA]: optimismSepolia,
    [SOURCE_SEPOLIA]: sepolia,
    [SOURCE_BASE_MAINNET]: base,
    [SOURCE_BSC_MAINNET]: bsc,
};
export function getChainName(chainId) {
    return CHAIN_NAMES_MAP[chainId];
}
export const getViemChain = (chainId) => {
    return VIEM_CHAIN_BY_CHAIN_ID[chainId];
};
export function getHighExecutionFee(chainId) {
    return HIGH_EXECUTION_FEES_MAP[chainId] ?? 5;
}
export function getExcessiveExecutionFee(chainId) {
    return EXCESSIVE_EXECUTION_FEES_MAP[chainId] ?? 10;
}
export function isContractsChain(chainId, dev = false) {
    return (dev ? CONTRACTS_CHAIN_IDS_DEV : CONTRACTS_CHAIN_IDS).includes(chainId);
}
export function isTestnetChain(chainId) {
    return [AVALANCHE_FUJI, ARBITRUM_SEPOLIA].includes(chainId);
}
export const EXECUTION_FEE_CONFIG_V2 = {
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
export const GAS_LIMITS_STATIC_CONFIG = {
    [ARBITRUM]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 0n,
    },
    [AVALANCHE]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 0n,
    },
    [AVALANCHE_FUJI]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 0n,
    },
    [ARBITRUM_SEPOLIA]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 1500000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 400000n,
    },
    [BOTANIX]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 0n,
    },
};

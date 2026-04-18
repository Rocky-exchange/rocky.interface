"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAS_LIMITS_STATIC_CONFIG = exports.EXECUTION_FEE_CONFIG_V2 = exports.isTestnetChain = exports.isContractsChain = exports.getExcessiveExecutionFee = exports.getHighExecutionFee = exports.getViemChain = exports.getChainName = exports.botanix = exports.GAS_PRICE_BUFFER_MAP = exports.MIN_EXECUTION_FEE_USD = exports.EXCESSIVE_EXECUTION_FEES_MAP = exports.MAX_PRIORITY_FEE_PER_GAS_MAP = exports.GAS_PRICE_PREMIUM_MAP = exports.MAX_FEE_PER_GAS_MAP = exports.HIGH_EXECUTION_FEES_MAP = exports.CHAIN_SLUGS_MAP = exports.CHAIN_NAMES_MAP = exports.CONTRACTS_CHAIN_IDS_DEV = exports.CONTRACTS_CHAIN_IDS = exports.SOURCE_BSC_MAINNET = exports.SOURCE_BASE_MAINNET = exports.SOURCE_SEPOLIA = exports.SOURCE_OPTIMISM_SEPOLIA = exports.ARBITRUM_SEPOLIA = exports.ETH_MAINNET = exports.BOTANIX = exports.ARBITRUM = exports.AVALANCHE_FUJI = exports.AVALANCHE = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const chainIds_1 = require("./chainIds");
Object.defineProperty(exports, "AVALANCHE", { enumerable: true, get: function () { return chainIds_1.AVALANCHE; } });
Object.defineProperty(exports, "AVALANCHE_FUJI", { enumerable: true, get: function () { return chainIds_1.AVALANCHE_FUJI; } });
Object.defineProperty(exports, "ARBITRUM", { enumerable: true, get: function () { return chainIds_1.ARBITRUM; } });
Object.defineProperty(exports, "BOTANIX", { enumerable: true, get: function () { return chainIds_1.BOTANIX; } });
Object.defineProperty(exports, "ETH_MAINNET", { enumerable: true, get: function () { return chainIds_1.ETH_MAINNET; } });
Object.defineProperty(exports, "ARBITRUM_SEPOLIA", { enumerable: true, get: function () { return chainIds_1.ARBITRUM_SEPOLIA; } });
Object.defineProperty(exports, "SOURCE_OPTIMISM_SEPOLIA", { enumerable: true, get: function () { return chainIds_1.SOURCE_OPTIMISM_SEPOLIA; } });
Object.defineProperty(exports, "SOURCE_SEPOLIA", { enumerable: true, get: function () { return chainIds_1.SOURCE_SEPOLIA; } });
Object.defineProperty(exports, "SOURCE_BASE_MAINNET", { enumerable: true, get: function () { return chainIds_1.SOURCE_BASE_MAINNET; } });
Object.defineProperty(exports, "SOURCE_BSC_MAINNET", { enumerable: true, get: function () { return chainIds_1.SOURCE_BSC_MAINNET; } });
exports.CONTRACTS_CHAIN_IDS = [chainIds_1.ARBITRUM]; // 只保留 Arbitrum
exports.CONTRACTS_CHAIN_IDS_DEV = [chainIds_1.ARBITRUM, chainIds_1.ARBITRUM_SEPOLIA]; // 开发环境包含测试网
exports.CHAIN_NAMES_MAP = {
    [chainIds_1.ARBITRUM]: "Arbitrum",
    [chainIds_1.AVALANCHE]: "Avalanche",
    [chainIds_1.AVALANCHE_FUJI]: "Avalanche Fuji",
    [chainIds_1.BOTANIX]: "Botanix",
    [chainIds_1.ARBITRUM_SEPOLIA]: "Arbitrum Sepolia",
    [chainIds_1.SOURCE_OPTIMISM_SEPOLIA]: "Optimism Sepolia",
    [chainIds_1.SOURCE_SEPOLIA]: "Sepolia",
    [chainIds_1.SOURCE_BASE_MAINNET]: "Base",
    [chainIds_1.SOURCE_BSC_MAINNET]: "BNB",
};
exports.CHAIN_SLUGS_MAP = {
    [chainIds_1.ARBITRUM]: "arbitrum",
    [chainIds_1.AVALANCHE]: "avalanche",
    [chainIds_1.AVALANCHE_FUJI]: "fuji",
    [chainIds_1.ARBITRUM_SEPOLIA]: "arbitrum-sepolia",
    [chainIds_1.BOTANIX]: "botanix",
};
exports.HIGH_EXECUTION_FEES_MAP = {
    [chainIds_1.ARBITRUM]: 5, // 5 USD
    [chainIds_1.AVALANCHE]: 5, // 5 USD
    [chainIds_1.AVALANCHE_FUJI]: 5, // 5 USD
    [chainIds_1.BOTANIX]: 5, // 5 USD
    [chainIds_1.ARBITRUM_SEPOLIA]: 5, // 5 USD
};
// added to maxPriorityFeePerGas
// applied to EIP-1559 transactions only
// is not applied to execution fee calculation
exports.MAX_FEE_PER_GAS_MAP = {
    [chainIds_1.AVALANCHE]: 200000000000n, // 200 gwei
    [chainIds_1.BOTANIX]: 20n,
};
// added to maxPriorityFeePerGas
// applied to EIP-1559 transactions only
// is also applied to the execution fee calculation
exports.GAS_PRICE_PREMIUM_MAP = {
    [chainIds_1.ARBITRUM]: 0n,
    [chainIds_1.AVALANCHE]: 6000000000n, // 6 gwei
};
/*
  that was a constant value in ethers v5, after ethers v6 migration we use it as a minimum for maxPriorityFeePerGas
*/
exports.MAX_PRIORITY_FEE_PER_GAS_MAP = {
    [chainIds_1.ARBITRUM]: 1500000000n,
    [chainIds_1.AVALANCHE]: 1500000000n,
    [chainIds_1.AVALANCHE_FUJI]: 1500000000n,
    [chainIds_1.ARBITRUM_SEPOLIA]: 1500000000n,
    [chainIds_1.BOTANIX]: 7n,
};
exports.EXCESSIVE_EXECUTION_FEES_MAP = {
    [chainIds_1.ARBITRUM]: 10, // 10 USD
    [chainIds_1.AVALANCHE]: 10, // 10 USD
    [chainIds_1.AVALANCHE_FUJI]: 10, // 10 USD
    [chainIds_1.BOTANIX]: 10, // 10 USD
};
// avoid botanix gas spikes when chain is not actively used
// if set, execution fee value should not be less than this in USD equivalent
exports.MIN_EXECUTION_FEE_USD = {
    [chainIds_1.ARBITRUM]: undefined,
    [chainIds_1.AVALANCHE]: undefined,
    [chainIds_1.AVALANCHE_FUJI]: undefined,
    [chainIds_1.BOTANIX]: 1000000000000000000000000000n, // 1e27 $0.001
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
exports.GAS_PRICE_BUFFER_MAP = {
    [chainIds_1.ARBITRUM]: 2000n, // 20%
};
exports.botanix = (0, viem_1.defineChain)({
    id: chainIds_1.BOTANIX,
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
    [chainIds_1.AVALANCHE_FUJI]: chains_1.avalancheFuji,
    [chainIds_1.ARBITRUM]: chains_1.arbitrum,
    [chainIds_1.AVALANCHE]: chains_1.avalanche,
    [chainIds_1.ARBITRUM_SEPOLIA]: chains_1.arbitrumSepolia,
    [chainIds_1.BOTANIX]: exports.botanix,
    [chainIds_1.SOURCE_OPTIMISM_SEPOLIA]: chains_1.optimismSepolia,
    [chainIds_1.SOURCE_SEPOLIA]: chains_1.sepolia,
    [chainIds_1.SOURCE_BASE_MAINNET]: chains_1.base,
    [chainIds_1.SOURCE_BSC_MAINNET]: chains_1.bsc,
};
function getChainName(chainId) {
    return exports.CHAIN_NAMES_MAP[chainId];
}
exports.getChainName = getChainName;
const getViemChain = (chainId) => {
    return VIEM_CHAIN_BY_CHAIN_ID[chainId];
};
exports.getViemChain = getViemChain;
function getHighExecutionFee(chainId) {
    return exports.HIGH_EXECUTION_FEES_MAP[chainId] ?? 5;
}
exports.getHighExecutionFee = getHighExecutionFee;
function getExcessiveExecutionFee(chainId) {
    return exports.EXCESSIVE_EXECUTION_FEES_MAP[chainId] ?? 10;
}
exports.getExcessiveExecutionFee = getExcessiveExecutionFee;
function isContractsChain(chainId, dev = false) {
    return (dev ? exports.CONTRACTS_CHAIN_IDS_DEV : exports.CONTRACTS_CHAIN_IDS).includes(chainId);
}
exports.isContractsChain = isContractsChain;
function isTestnetChain(chainId) {
    return [chainIds_1.AVALANCHE_FUJI, chainIds_1.ARBITRUM_SEPOLIA].includes(chainId);
}
exports.isTestnetChain = isTestnetChain;
exports.EXECUTION_FEE_CONFIG_V2 = {
    [chainIds_1.AVALANCHE]: {
        shouldUseMaxPriorityFeePerGas: true,
        defaultBufferBps: 1000, // 10%
    },
    [chainIds_1.AVALANCHE_FUJI]: {
        shouldUseMaxPriorityFeePerGas: true,
        defaultBufferBps: 1000, // 10%
    },
    [chainIds_1.ARBITRUM]: {
        shouldUseMaxPriorityFeePerGas: false,
        defaultBufferBps: 3000, // 30%
    },
    [chainIds_1.ARBITRUM_SEPOLIA]: {
        shouldUseMaxPriorityFeePerGas: false,
        defaultBufferBps: 1000, // 10%
    },
    [chainIds_1.BOTANIX]: {
        shouldUseMaxPriorityFeePerGas: true,
        defaultBufferBps: 3000, // 30%
    },
};
exports.GAS_LIMITS_STATIC_CONFIG = {
    [chainIds_1.ARBITRUM]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 0n,
    },
    [chainIds_1.AVALANCHE]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 0n,
    },
    [chainIds_1.AVALANCHE_FUJI]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 0n,
    },
    [chainIds_1.ARBITRUM_SEPOLIA]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 1500000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 400000n,
    },
    [chainIds_1.BOTANIX]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
        gmxAccountCollateralGasLimit: 0n,
    },
};

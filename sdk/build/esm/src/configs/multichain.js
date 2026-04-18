import { ARBITRUM_SEPOLIA, ARBITRUM, AVALANCHE, SOURCE_OPTIMISM_SEPOLIA, SOURCE_SEPOLIA, SOURCE_BASE_MAINNET, SOURCE_BSC_MAINNET, } from "./chainIds";
function ensureExhaustive(value) {
    return Object.keys(value).map(Number);
}
export const SETTLEMENT_CHAINS = ensureExhaustive({
    [ARBITRUM_SEPOLIA]: true,
    [ARBITRUM]: true,
    [AVALANCHE]: true,
});
export const SOURCE_CHAINS = ensureExhaustive({
    [SOURCE_OPTIMISM_SEPOLIA]: true,
    [SOURCE_SEPOLIA]: true,
    [SOURCE_BASE_MAINNET]: true,
    [SOURCE_BSC_MAINNET]: true,
});
export function isSettlementChain(chainId) {
    return SETTLEMENT_CHAINS.includes(chainId);
}
export function isSourceChain(chainId) {
    return SOURCE_CHAINS.includes(chainId);
}

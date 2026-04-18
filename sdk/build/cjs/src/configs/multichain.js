"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSourceChain = exports.isSettlementChain = exports.SOURCE_CHAINS = exports.SETTLEMENT_CHAINS = void 0;
const chainIds_1 = require("./chainIds");
function ensureExhaustive(value) {
    return Object.keys(value).map(Number);
}
exports.SETTLEMENT_CHAINS = ensureExhaustive({
    [chainIds_1.ARBITRUM_SEPOLIA]: true,
    [chainIds_1.ARBITRUM]: true,
    [chainIds_1.AVALANCHE]: true,
});
exports.SOURCE_CHAINS = ensureExhaustive({
    [chainIds_1.SOURCE_OPTIMISM_SEPOLIA]: true,
    [chainIds_1.SOURCE_SEPOLIA]: true,
    [chainIds_1.SOURCE_BASE_MAINNET]: true,
    [chainIds_1.SOURCE_BSC_MAINNET]: true,
});
function isSettlementChain(chainId) {
    return exports.SETTLEMENT_CHAINS.includes(chainId);
}
exports.isSettlementChain = isSettlementChain;
function isSourceChain(chainId) {
    return exports.SOURCE_CHAINS.includes(chainId);
}
exports.isSourceChain = isSourceChain;

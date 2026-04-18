"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOracleKeeperFallbackUrls = exports.getOracleKeeperUrl = void 0;
const chains_1 = require("./chains");
const ORACLE_KEEPER_URLS = {
    [chains_1.ARBITRUM]: "https://arbitrum-api.gmxinfra.io",
    [chains_1.AVALANCHE]: "https://avalanche-api.gmxinfra.io",
    [chains_1.AVALANCHE_FUJI]: "https://synthetics-api-avax-fuji-upovm.ondigitalocean.app",
    [chains_1.BOTANIX]: "https://botanix-api.gmxinfra.io",
    [chains_1.ARBITRUM_SEPOLIA]: "https://dolphin-app-a2dup.ondigitalocean.app", // GMX官方测试网Oracle
};
const ORACLE_KEEPER_FALLBACK_URLS = {
    [chains_1.ARBITRUM]: ["https://arbitrum-api-fallback.gmxinfra.io", "https://arbitrum-api-fallback.gmxinfra2.io"],
    [chains_1.AVALANCHE]: ["https://avalanche-api-fallback.gmxinfra.io", "https://avalanche-api-fallback.gmxinfra2.io"],
    [chains_1.AVALANCHE_FUJI]: ["https://synthetics-api-avax-fuji-upovm.ondigitalocean.app"],
    [chains_1.BOTANIX]: ["https://botanix-api-fallback.gmxinfra.io", "https://botanix-api-fallback.gmxinfra2.io"],
    [chains_1.ARBITRUM_SEPOLIA]: ["https://dolphin-app-a2dup.ondigitalocean.app"], // GMX官方测试网Oracle作为fallback
};
function getOracleKeeperUrl(chainId) {
    if (!ORACLE_KEEPER_URLS[chainId]) {
        throw new Error(`No oracle keeper url for chain ${chainId}`);
    }
    return ORACLE_KEEPER_URLS[chainId];
}
exports.getOracleKeeperUrl = getOracleKeeperUrl;
function getOracleKeeperFallbackUrls(chainId) {
    if (!ORACLE_KEEPER_FALLBACK_URLS[chainId]) {
        throw new Error(`No oracle keeper fallback urls for chain ${chainId}`);
    }
    return ORACLE_KEEPER_FALLBACK_URLS[chainId];
}
exports.getOracleKeeperFallbackUrls = getOracleKeeperFallbackUrls;

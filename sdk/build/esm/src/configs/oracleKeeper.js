import { ARBITRUM, ARBITRUM_SEPOLIA, AVALANCHE, AVALANCHE_FUJI, BOTANIX } from "./chains";
const ORACLE_KEEPER_URLS = {
    [ARBITRUM]: "https://arbitrum-api.gmxinfra.io",
    [AVALANCHE]: "https://avalanche-api.gmxinfra.io",
    [AVALANCHE_FUJI]: "https://synthetics-api-avax-fuji-upovm.ondigitalocean.app",
    [BOTANIX]: "https://botanix-api.gmxinfra.io",
    [ARBITRUM_SEPOLIA]: "https://dolphin-app-a2dup.ondigitalocean.app", // GMX官方测试网Oracle
};
const ORACLE_KEEPER_FALLBACK_URLS = {
    [ARBITRUM]: ["https://arbitrum-api-fallback.gmxinfra.io", "https://arbitrum-api-fallback.gmxinfra2.io"],
    [AVALANCHE]: ["https://avalanche-api-fallback.gmxinfra.io", "https://avalanche-api-fallback.gmxinfra2.io"],
    [AVALANCHE_FUJI]: ["https://synthetics-api-avax-fuji-upovm.ondigitalocean.app"],
    [BOTANIX]: ["https://botanix-api-fallback.gmxinfra.io", "https://botanix-api-fallback.gmxinfra2.io"],
    [ARBITRUM_SEPOLIA]: ["https://dolphin-app-a2dup.ondigitalocean.app"], // GMX官方测试网Oracle作为fallback
};
export function getOracleKeeperUrl(chainId) {
    if (!ORACLE_KEEPER_URLS[chainId]) {
        throw new Error(`No oracle keeper url for chain ${chainId}`);
    }
    return ORACLE_KEEPER_URLS[chainId];
}
export function getOracleKeeperFallbackUrls(chainId) {
    if (!ORACLE_KEEPER_FALLBACK_URLS[chainId]) {
        throw new Error(`No oracle keeper fallback urls for chain ${chainId}`);
    }
    return ORACLE_KEEPER_FALLBACK_URLS[chainId];
}

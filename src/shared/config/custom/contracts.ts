/**
 * Custom/X10000 Contract Addresses
 *
 * Contract addresses specific to x10000 trading mode and API adapters
 */

import { zeroAddress } from "viem";
import { ARBITRUM, ARBITRUM_SEPOLIA } from "../chains";

/**
 * X10000 specific contract addresses by chain ID
 *
 * These are used for deposit/withdrawal operations in x10000 mode.
 * The configuration automatically switches based on the chainId:
 * - ARBITRUM_SEPOLIA (421614): Testnet addresses
 * - ARBITRUM (42161): Mainnet/production addresses
 *
 * Use the getter functions (getX10000UsdtAddress, getX10000ZtdxVaultAddress, getReferralRebateAddress)
 * to retrieve addresses for a specific chainId.
 */
export const X10000_CONTRACTS = {
  [ARBITRUM_SEPOLIA]: {
    // USDT token address on Arbitrum Sepolia testnet (redeployed 2026-01-27)
    // Used for deposits in x10000 mode
    USDT: "0xc96BDE5008518332Bb5c45177f9E70D75Ea5D865",
    // RockyVault contract address on Arbitrum Sepolia (redeployed 2026-01-27)
    // Used for same-chain deposits in x10000 mode
    ZTDX_VAULT: "0xe89d7cf9379fc608a416a3B3B3b0f806f12B8181",
    // RockyRebate contract address on Arbitrum Sepolia testnet (redeployed 2026-01-27)
    REFERRAL_REBATE: "0x0729f4635C38D03EaC9885eD40B38170AddBf3D0",
    // RockyEarn contract address on Arbitrum Sepolia testnet (redeployed 2026-01-27)
    EARN: "0x436dcB8a2478D636a6cC678AE7A2E4c5449cB3ba",
  },
  [ARBITRUM]: {
    // USDT token address on Arbitrum mainnet (Official Tether USDT)
    // Used for deposits in x10000 mode
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    // RockyVault contract address on Arbitrum mainnet (v4 - 2026-01-27)
    // Used for same-chain deposits in x10000 mode
    ZTDX_VAULT: "0x8c772aA1446c1fA2A9fB4072965fBaD49e8BDD66",
    // RockyRebate contract address on Arbitrum mainnet (v4 - 2026-01-27)
    REFERRAL_REBATE: "0xC0dA6380Fab3FACEbaBea3ccbEf788Bafa39023e",
    // RockyEarn contract address on Arbitrum mainnet (v4 - 2026-01-27)
    EARN: "0xa1aDBf4363064D3C3D891FEd180E749392Cfb185",
  },
} as const;

/**
 * Market symbol to contract address mapping
 * Used by API adapters (orderAdapter, tradeAdapter, positionAdapter)
 *
 * Maps market symbols (e.g., "BTC-USD", "ETHUSDT") to their contract addresses
 */
export const MARKET_SYMBOL_TO_ADDRESS: Record<number, Record<string, string>> = {
  [ARBITRUM_SEPOLIA]: {
    "BTC-USD": "0xBb532Ab4923C23c2bfA455151B14fec177a34C0D",
    "ETH-USD": "0x482Df3D320C964808579b585a8AC7Dd5D144eFaF",
    "ZTDX-USD": "0x756be641d97c796bd13856c76830f274fb0ac857",
    "SOL-USD": "0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9",
    // Also support API format (ETHUSDT -> ETH-USD)
    "BTCUSDT": "0xBb532Ab4923C23c2bfA455151B14fec177a34C0D",
    "ETHUSDT": "0x482Df3D320C964808579b585a8AC7Dd5D144eFaF",
    "ZTDXUSDT": "0x756be641d97c796bd13856c76830f274fb0ac857",
    "SOLUSDT": "0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9",
  },
  [ARBITRUM]: {
    // Mainnet market addresses - Use SDK standard addresses for compatibility
    "BTC-USD": "0x47c031236e19d024b42f8AE6780E44A573170703", // BTC/USD on Arbitrum mainnet
    "ETH-USD": "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336", // ETH/USD on Arbitrum mainnet (SDK standard address)
    "SOL-USD": "0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9", // SOL/USD on Arbitrum mainnet
    // Also support API format (ETHUSDT -> ETH-USD)
    "BTCUSDT": "0x47c031236e19d024b42f8AE6780E44A573170703",
    "ETHUSDT": "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
    "SOLUSDT": "0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9",
  },
} as const;

/**
 * Default collateral token addresses by chain
 * Used by API adapters for order/position/trade conversion
 */
export const DEFAULT_COLLATERAL_ADDRESS: Record<number, string> = {
  [ARBITRUM_SEPOLIA]: "0xc96BDE5008518332Bb5c45177f9E70D75Ea5D865", // Test USDT on Arbitrum Sepolia (redeployed 2026-01-27)
  [ARBITRUM]: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // Official Tether USDT on Arbitrum mainnet
} as const;

/**
 * Get USDT token address for a given chain ID in x10000 mode
 */
export function getX10000UsdtAddress(chainId: number): string | undefined {
  return X10000_CONTRACTS[chainId as keyof typeof X10000_CONTRACTS]?.USDT;
}

/**
 * Check if a token address is the USDT address for x10000 mode on the given chain
 */
export function isX10000UsdtAddress(chainId: number, tokenAddress: string): boolean {
  const usdtAddress = getX10000UsdtAddress(chainId);
  return usdtAddress?.toLowerCase() === tokenAddress.toLowerCase();
}

/**
 * Get ZTDXVault contract address for a given chain ID in x10000 mode
 */
export function getX10000ZtdxVaultAddress(chainId: number): string | undefined {
  return X10000_CONTRACTS[chainId as keyof typeof X10000_CONTRACTS]?.ZTDX_VAULT;
}

/**
 * Get market address from symbol for a given chain ID
 * Used by API adapters to convert API symbols to contract addresses
 */
export function getMarketAddressFromSymbol(chainId: number, symbol: string): string | undefined {
  return MARKET_SYMBOL_TO_ADDRESS[chainId]?.[symbol];
}

/**
 * Get symbol from market address for a given chain ID
 * Reverse lookup of getMarketAddressFromSymbol
 */
export function getSymbolFromMarketAddress(chainId: number, marketAddress: string): string | undefined {
  const mapping = MARKET_SYMBOL_TO_ADDRESS[chainId];
  if (!mapping) return undefined;

  for (const [symbol, address] of Object.entries(mapping)) {
    if (address.toLowerCase() === marketAddress.toLowerCase()) {
      return symbol;
    }
  }
  return undefined;
}

/**
 * Get default collateral token address for a given chain ID
 * Used by API adapters for order/position/trade conversion
 */
export function getDefaultCollateralAddress(chainId: number): string | undefined {
  return DEFAULT_COLLATERAL_ADDRESS[chainId];
}

/**
 * Get ReferralRebate contract address for a given chain ID
 */
export function getReferralRebateAddress(chainId: number): string | undefined {
  return X10000_CONTRACTS[chainId as keyof typeof X10000_CONTRACTS]?.REFERRAL_REBATE;
}

/**
 * Get Earn contract address for a given chain ID
 */
export function getEarnContractAddress(chainId: number): string | undefined {
  return X10000_CONTRACTS[chainId as keyof typeof X10000_CONTRACTS]?.EARN;
}


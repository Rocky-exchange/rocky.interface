/**
 * Treasury wallet addresses configuration
 * These addresses are used to track treasury balances across different protocols
 */

export type TreasuryAddress = {
  address: string;
  hasVenus?: boolean;
  hasPendle?: boolean;
};

/**
 * List of treasury wallet addresses with their protocol support flags
 */
export const TREASURY_ADDRESSES: TreasuryAddress[] = [
  { address: "0x4bd1cdaab4254fc43ef6424653ca2375b4c94c0e" },
  { address: "0xc6378ddf536410c14666dc59bc92b5ebc0f2f79e" },
  { address: "0x0263ad94023a5df6d64f54bfef089f1fbf8a4ca0" },
  { address: "0xea8a734db4c7ea50c32b5db8a0cb811707e8ace3" },
  { address: "0xe1f7c5209938780625e354dc546e28397f6ce174", hasVenus: true, hasPendle: true },
  { address: "0x68863dde14303bced249ca8ec6af85d4694dea6a" },
  { address: "0x0339740d92fb8baf73bab0e9eb9494bc0df1cafd" },
  { address: "0x2c247a44928d66041d9f7b11a69d7a84d25207ba" },
  { address: "0x0a2962120b11A4a36700C5De00D4980E58a2D1C0" },
  { address: "0xe57fE47902A35Bc0d82C83e39610Af546E1D18B9" },
];

/**
 * Get all treasury addresses as an array of strings
 */
export const getTreasuryAddresses = (): string[] => {
  return TREASURY_ADDRESSES.map((item) => item.address);
};

/**
 * Get treasury addresses that support Venus protocol
 */
export const getVenusTreasuryAddresses = (): string[] => {
  return TREASURY_ADDRESSES.filter((item) => item.hasVenus).map((item) => item.address);
};

/**
 * Get treasury addresses that support Pendle protocol
 */
export const getPendleTreasuryAddresses = (): string[] => {
  return TREASURY_ADDRESSES.filter((item) => item.hasPendle).map((item) => item.address);
};

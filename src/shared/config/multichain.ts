import {
  ARBITRUM,
  ARBITRUM_SEPOLIA,
  AVALANCHE,
  AVALANCHE_FUJI,
  BOTANIX,
  SOURCE_BASE_MAINNET,
  SOURCE_BSC_MAINNET,
  SOURCE_OPTIMISM_SEPOLIA,
  SOURCE_SEPOLIA,
} from "config/chains";
import type { AnyChainId, SettlementChainId, SourceChainId } from "config/chains";

import type { BridgeEndpointId } from "@/modules/lighter/domain/multichain/types";

export type MultichainTokenId = {
  chainId: SettlementChainId | SourceChainId;
  address: string;
  decimals: number;
  bridgeProvider: string;
  symbol: string;
  isTestnet?: boolean;
};

type MultichainTokenMapping = Record<
  SettlementChainId,
  Record<
    SourceChainId,
    Record<
      string,
      {
        settlementChainTokenAddress: string;
        sourceChainTokenAddress: string;
        sourceChainTokenDecimals: number;
      }
    >
  >
>;

type MultichainWithdrawSupportedTokens = Partial<Record<SettlementChainId, string[]>>;
type MultichainSourceToSettlementsMap = Record<SourceChainId, SettlementChainId[]>;

export const SETTLEMENT_CHAINS: SettlementChainId[] = [ARBITRUM_SEPOLIA, ARBITRUM, AVALANCHE] as SettlementChainId[];
export const SOURCE_CHAINS: SourceChainId[] = [];

export function isSettlementChain(chainId: number | undefined): chainId is SettlementChainId {
  return chainId !== undefined && SETTLEMENT_CHAINS.includes(chainId as SettlementChainId);
}

export function isSourceChain(chainId: number | undefined): chainId is SourceChainId {
  return chainId !== undefined && SOURCE_CHAINS.includes(chainId as SourceChainId);
}

export const DEBUG_MULTICHAIN_SAME_CHAIN_DEPOSIT = false;
export const DEPOSIT_ALLOWED_SOURCE_CHAIN_IDS: readonly number[] = [];
export const MULTICHAIN_TOKEN_MAPPING = {} as MultichainTokenMapping;
export const MULTICHAIN_TRANSFER_SUPPORTED_TOKENS = {} as MultichainWithdrawSupportedTokens;
export const CHAIN_ID_TO_TOKEN_ID_MAP = {} as Record<
  SettlementChainId | SourceChainId,
  Record<string, MultichainTokenId>
>;
export const MULTICHAIN_SOURCE_TO_SETTLEMENTS_MAPPING = {} as MultichainSourceToSettlementsMap;

export const DEFAULT_SETTLEMENT_CHAIN_ID_MAP: Record<AnyChainId, SettlementChainId> = {
  [ARBITRUM_SEPOLIA]: ARBITRUM_SEPOLIA,
  [SOURCE_OPTIMISM_SEPOLIA]: ARBITRUM_SEPOLIA,
  [SOURCE_SEPOLIA]: ARBITRUM_SEPOLIA,
  [SOURCE_BASE_MAINNET]: ARBITRUM,
  [SOURCE_BSC_MAINNET]: ARBITRUM,
  [BOTANIX]: ARBITRUM,
  [ARBITRUM]: ARBITRUM,
  [AVALANCHE]: AVALANCHE,
  [AVALANCHE_FUJI]: ARBITRUM_SEPOLIA,
};

export function getMultichainTokenId(_chainId: number, _tokenAddress: string): MultichainTokenId | undefined {
  return undefined;
}

export function getBridgePoolAddress(_chainId: number, _tokenAddress: string): string | undefined {
  return undefined;
}

export function getBridgeEndpointId(_chainId: number): BridgeEndpointId | undefined {
  return undefined;
}

export function getMappedTokenId(
  _fromChainId: SettlementChainId | SourceChainId,
  _fromChainTokenAddress: string,
  _toChainId: SettlementChainId | SourceChainId
): MultichainTokenId | undefined {
  return undefined;
}

export const MULTICALLS_MAP = {} as Record<SourceChainId, string>;
export const OVERRIDE_ERC20_BYTECODE = "0x" as `0x${string}`;
export const CHAIN_ID_PREFERRED_DEPOSIT_TOKEN = {} as Record<SettlementChainId, string>;
export const MULTICHAIN_FUNDING_SLIPPAGE_BPS = 50;
export const BridgeErrorsAbi: any[] = [];
export const IBridgeAbi: any[] = [];
export const CHAIN_ID_TO_ENDPOINT_ID = {} as Record<SettlementChainId | SourceChainId, BridgeEndpointId>;
export const ENDPOINT_ID_TO_CHAIN_ID = {} as Partial<Record<BridgeEndpointId, SettlementChainId | SourceChainId>>;
export const FAKE_INPUT_AMOUNT_MAP: Record<string, bigint> = {};
export const RANDOM_SLOT = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const RANDOM_WALLET = {
  address: "0x0000000000000000000000000000000000000000",
};

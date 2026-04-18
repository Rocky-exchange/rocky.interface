import { ContractsChainId } from "./chains";
export declare const SWAP_GRAPH_MAX_MARKETS_PER_TOKEN = 5;
export type MarketConfig = {
    marketTokenAddress: string;
    indexTokenAddress: string;
    longTokenAddress: string;
    shortTokenAddress: string;
};
export declare const MARKETS: Record<ContractsChainId, Record<string, MarketConfig>>;
export type MarketLabel = `${string}/USD [${string}-${string}]`;
export declare function getMarketByLabel(chainId: ContractsChainId, label: MarketLabel): MarketConfig;
export declare const fixTokenSymbolFromMarketLabel: (chainId: ContractsChainId, symbol: string) => string;

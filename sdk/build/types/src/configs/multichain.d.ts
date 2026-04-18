import { SettlementChainId, SourceChainId } from "./chains";
export declare const SETTLEMENT_CHAINS: SettlementChainId[];
export declare const SOURCE_CHAINS: SourceChainId[];
export declare function isSettlementChain(chainId: number): chainId is SettlementChainId;
export declare function isSourceChain(chainId: number | undefined): chainId is SourceChainId;

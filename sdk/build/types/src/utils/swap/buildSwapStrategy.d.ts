import { MarketsInfoData } from "../../types/markets";
import { SwapStrategyForSwapOrders } from "../../types/swapStrategy";
import { TokenData } from "../../types/tokens";
import { ExternalSwapQuoteParams, SwapOptimizationOrderArray } from "../../types/trade";
export declare function buildSwapStrategy({ amountIn, tokenIn, tokenOut, marketsInfoData, chainId, swapOptimizationOrder, externalSwapQuoteParams, }: {
    chainId: number;
    amountIn: bigint;
    tokenIn: TokenData;
    tokenOut: TokenData;
    marketsInfoData: MarketsInfoData | undefined;
    swapOptimizationOrder: SwapOptimizationOrderArray | undefined;
    externalSwapQuoteParams: ExternalSwapQuoteParams;
}): SwapStrategyForSwapOrders;
export declare function buildReverseSwapStrategy({ amountOut, tokenIn, tokenOut, marketsInfoData, chainId, externalSwapQuoteParams, swapOptimizationOrder, }: {
    chainId: number;
    amountOut: bigint;
    tokenIn: TokenData;
    tokenOut: TokenData;
    marketsInfoData: MarketsInfoData | undefined;
    externalSwapQuoteParams: ExternalSwapQuoteParams;
    swapOptimizationOrder: SwapOptimizationOrderArray | undefined;
}): SwapStrategyForSwapOrders;

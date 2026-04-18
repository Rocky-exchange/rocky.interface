"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReverseSwapStrategy = exports.buildSwapStrategy = void 0;
const bigmath_1 = require("../bigmath");
const tokens_1 = require("../tokens");
const externalSwapPath_1 = require("./externalSwapPath");
const externalSwapQuoteByPath_1 = require("./externalSwapQuoteByPath");
const swapPath_1 = require("./swapPath");
/*
  Order/Priority of getting swap strategy:
  1. Check if it needs a swap and return noSwap if tokens are equivalent, stake or unstake [noSwap]
  2. Check if there is a swap path stats for the internal swap quote and return internalSwap if there is [internalSwap]
  3. Check if there is a combined swap strategy and return combinedSwap if there is [combinedSwap]
  4. Return defaultSwapStrategy (noSwap) if there is no other swap strategy [noSwap]
*/
function buildSwapStrategy({ amountIn, tokenIn, tokenOut, marketsInfoData, chainId, swapOptimizationOrder, externalSwapQuoteParams, }) {
    const priceIn = tokenIn.prices.minPrice;
    const usdIn = (0, tokens_1.convertToUsd)(amountIn, tokenIn.decimals, priceIn);
    if (amountIn < 0n) {
        amountIn = 0n;
    }
    const defaultSwapStrategy = {
        type: "noSwap",
        externalSwapQuote: undefined,
        swapPathStats: undefined,
        amountIn,
        amountOut: (0, tokens_1.convertToTokenAmount)(usdIn, tokenOut.decimals, tokenOut.prices.maxPrice),
        usdIn,
        usdOut: usdIn,
        priceIn,
        priceOut: tokenOut.prices.maxPrice,
        feesUsd: 0n,
    };
    if ((0, tokens_1.getIsEquivalentTokens)(tokenIn, tokenOut) || (0, tokens_1.getIsStake)(tokenIn, tokenOut) || (0, tokens_1.getIsUnstake)(tokenIn, tokenOut)) {
        return defaultSwapStrategy;
    }
    const findSwapPath = (0, swapPath_1.createFindSwapPath)({
        chainId,
        fromTokenAddress: tokenIn.address,
        toTokenAddress: tokenOut.address,
        marketsInfoData,
        isExpressFeeSwap: false,
    });
    const swapPathStats = findSwapPath(usdIn, { order: swapOptimizationOrder });
    if (swapPathStats) {
        return {
            type: "internalSwap",
            swapPathStats,
            externalSwapQuote: undefined,
            amountIn,
            amountOut: swapPathStats.amountOut,
            usdIn: usdIn,
            usdOut: swapPathStats.usdOut,
            priceIn: priceIn,
            priceOut: tokenOut.prices.maxPrice,
            feesUsd: usdIn - swapPathStats.usdOut,
        };
    }
    const availableExternalSwapPaths = (0, externalSwapPath_1.getAvailableExternalSwapPaths)({ chainId, fromTokenAddress: tokenIn.address });
    const suitableSwapPath = availableExternalSwapPaths.find((path) => {
        const findSwapPath = (0, swapPath_1.createFindSwapPath)({
            chainId,
            fromTokenAddress: path.outTokenAddress,
            toTokenAddress: tokenOut.address,
            marketsInfoData,
            isExpressFeeSwap: false,
        });
        const swapPathStats = findSwapPath(usdIn);
        return Boolean(swapPathStats);
    });
    if (suitableSwapPath && suitableSwapPath.outTokenAddress !== tokenOut.address) {
        const externalSwapQuoteForCombinedSwap = (0, externalSwapQuoteByPath_1.getExternalSwapQuoteByPath)({
            amountIn,
            externalSwapPath: suitableSwapPath,
            externalSwapQuoteParams,
        });
        const findSwapPathForSuitableSwapPath = (0, swapPath_1.createFindSwapPath)({
            chainId,
            fromTokenAddress: suitableSwapPath.outTokenAddress,
            toTokenAddress: tokenOut.address,
            marketsInfoData,
            isExpressFeeSwap: false,
        });
        const swapPathStatsForCombinedSwap = externalSwapQuoteForCombinedSwap
            ? findSwapPathForSuitableSwapPath(externalSwapQuoteForCombinedSwap.usdOut)
            : undefined;
        return externalSwapQuoteForCombinedSwap && swapPathStatsForCombinedSwap
            ? {
                type: "combinedSwap",
                externalSwapQuote: externalSwapQuoteForCombinedSwap,
                swapPathStats: swapPathStatsForCombinedSwap,
                amountIn,
                amountOut: swapPathStatsForCombinedSwap.amountOut,
                usdIn: externalSwapQuoteForCombinedSwap.usdIn,
                usdOut: swapPathStatsForCombinedSwap.usdOut,
                priceIn: externalSwapQuoteForCombinedSwap.priceIn,
                priceOut: tokenOut.prices.maxPrice,
                feesUsd: externalSwapQuoteForCombinedSwap.usdIn - swapPathStatsForCombinedSwap.usdOut,
            }
            : defaultSwapStrategy;
    }
    return defaultSwapStrategy;
}
exports.buildSwapStrategy = buildSwapStrategy;
// Used for getting swap amounts by to value
function buildReverseSwapStrategy({ amountOut, tokenIn, tokenOut, marketsInfoData, chainId, externalSwapQuoteParams, swapOptimizationOrder, }) {
    const priceIn = (0, tokens_1.getMidPrice)(tokenIn.prices);
    const priceOut = (0, tokens_1.getMidPrice)(tokenOut.prices);
    const preferredUsdOut = (0, tokens_1.convertToUsd)(amountOut, tokenOut.decimals, (0, tokens_1.getMidPrice)(tokenOut.prices));
    const approximateAmountIn = (0, tokens_1.convertToTokenAmount)(preferredUsdOut, tokenIn.decimals, (0, tokens_1.getMidPrice)(tokenIn.prices));
    const approximateUsdIn = preferredUsdOut;
    const defaultSwapStrategy = {
        type: "noSwap",
        externalSwapQuote: undefined,
        swapPathStats: undefined,
        amountIn: approximateAmountIn,
        amountOut: amountOut,
        usdIn: approximateUsdIn,
        usdOut: preferredUsdOut,
        priceIn,
        priceOut,
        feesUsd: 0n,
    };
    if ((0, tokens_1.getIsEquivalentTokens)(tokenIn, tokenOut) || (0, tokens_1.getIsStake)(tokenIn, tokenOut) || (0, tokens_1.getIsUnstake)(tokenIn, tokenOut)) {
        return defaultSwapStrategy;
    }
    const findSwapPath = (0, swapPath_1.createFindSwapPath)({
        chainId,
        fromTokenAddress: tokenIn.address,
        toTokenAddress: tokenOut.address,
        marketsInfoData,
        isExpressFeeSwap: false,
    });
    const approximateSwapPathStats = findSwapPath(approximateUsdIn, { order: swapOptimizationOrder });
    if (approximateSwapPathStats) {
        // Increase or decrease usdIn the same way preferred usdOut is different from swapStrategy.usdOut
        // preferred_in / approximate_in = preferred_out / approximate_out
        // preferred_in = approximate_in * preferred_out / approximate_out
        const adjustedUsdIn = approximateSwapPathStats.usdOut > 0
            ? bigmath_1.bigMath.mulDiv(approximateUsdIn, preferredUsdOut, approximateSwapPathStats.usdOut)
            : 0n;
        const adjustedAmountIn = (0, tokens_1.convertToTokenAmount)(adjustedUsdIn, tokenIn.decimals, (0, tokens_1.getMidPrice)(tokenIn.prices));
        const adjustedSwapPathStats = findSwapPath(adjustedUsdIn, { order: swapOptimizationOrder });
        if (adjustedSwapPathStats) {
            return {
                type: "internalSwap",
                swapPathStats: adjustedSwapPathStats,
                externalSwapQuote: undefined,
                amountIn: adjustedAmountIn,
                amountOut: adjustedSwapPathStats.amountOut,
                usdIn: adjustedUsdIn,
                usdOut: adjustedSwapPathStats.usdOut,
                priceIn: priceIn,
                priceOut: priceOut,
                feesUsd: adjustedUsdIn - adjustedSwapPathStats.usdOut,
            };
        }
    }
    const availableExternalSwapPaths = (0, externalSwapPath_1.getAvailableExternalSwapPaths)({ chainId, fromTokenAddress: tokenIn.address });
    const suitableSwapPath = availableExternalSwapPaths.find((path) => {
        if (path.outTokenAddress !== tokenOut.address)
            return false;
        const findSwapPath = (0, swapPath_1.createFindSwapPath)({
            chainId,
            fromTokenAddress: tokenIn.address,
            toTokenAddress: path.inTokenAddress,
            marketsInfoData,
            isExpressFeeSwap: false,
        });
        const swapPathStats = findSwapPath(approximateUsdIn);
        return Boolean(swapPathStats);
    });
    if (suitableSwapPath) {
        const approximateExternalSwapQuoteForCombinedSwap = (0, externalSwapQuoteByPath_1.getExternalSwapQuoteByPath)({
            amountIn: approximateAmountIn,
            externalSwapPath: suitableSwapPath,
            externalSwapQuoteParams,
        });
        if (!approximateExternalSwapQuoteForCombinedSwap) {
            return defaultSwapStrategy;
        }
        const findSwapPathForSuitableSwapPath = (0, swapPath_1.createFindSwapPath)({
            chainId,
            fromTokenAddress: tokenIn.address,
            toTokenAddress: suitableSwapPath.inTokenAddress,
            marketsInfoData,
            isExpressFeeSwap: false,
        });
        const approximateSwapPathStatsForCombinedSwap = findSwapPathForSuitableSwapPath(approximateExternalSwapQuoteForCombinedSwap.usdOut);
        if (!approximateSwapPathStatsForCombinedSwap) {
            return defaultSwapStrategy;
        }
        const adjustedUsdIn = approximateSwapPathStatsForCombinedSwap.usdOut > 0
            ? bigmath_1.bigMath.mulDiv(approximateUsdIn, preferredUsdOut, approximateSwapPathStatsForCombinedSwap.usdOut)
            : 0n;
        const adjustedAmountIn = (0, tokens_1.convertToTokenAmount)(adjustedUsdIn, tokenIn.decimals, (0, tokens_1.getMidPrice)(tokenIn.prices));
        const adjustedExternalSwapQuoteForCombinedSwap = (0, externalSwapQuoteByPath_1.getExternalSwapQuoteByPath)({
            amountIn: adjustedAmountIn,
            externalSwapPath: suitableSwapPath,
            externalSwapQuoteParams,
        });
        if (!adjustedExternalSwapQuoteForCombinedSwap) {
            return defaultSwapStrategy;
        }
        const adjustedSwapPathStatsForCombinedSwap = findSwapPathForSuitableSwapPath(adjustedExternalSwapQuoteForCombinedSwap.usdOut);
        if (!adjustedSwapPathStatsForCombinedSwap) {
            return defaultSwapStrategy;
        }
        return {
            type: "combinedSwap",
            externalSwapQuote: adjustedExternalSwapQuoteForCombinedSwap,
            swapPathStats: adjustedSwapPathStatsForCombinedSwap,
            amountIn: adjustedAmountIn,
            amountOut: adjustedSwapPathStatsForCombinedSwap.amountOut,
            usdIn: adjustedExternalSwapQuoteForCombinedSwap.usdIn,
            usdOut: adjustedSwapPathStatsForCombinedSwap.usdOut,
            priceIn: adjustedExternalSwapQuoteForCombinedSwap.priceIn,
            priceOut: priceOut,
            feesUsd: adjustedExternalSwapQuoteForCombinedSwap.usdIn - adjustedSwapPathStatsForCombinedSwap.usdOut,
        };
    }
    return defaultSwapStrategy;
}
exports.buildReverseSwapStrategy = buildReverseSwapStrategy;

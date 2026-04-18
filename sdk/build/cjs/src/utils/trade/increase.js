"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextPositionValuesForIncreaseTrade = exports.getIncreasePositionPrices = exports.leverageBySizeValues = exports.getTokensRatio = exports.getIncreasePositionAmounts = void 0;
const viem_1 = require("viem");
const factors_1 = require("../../configs/factors");
const orders_1 = require("../../types/orders");
const bigmath_1 = require("../bigmath");
const fees_1 = require("../fees");
const numbers_1 = require("../numbers");
const positions_1 = require("../positions");
const prices_1 = require("../prices");
const swap_1 = require("../swap");
const tokens_1 = require("../tokens");
function getIncreasePositionAmounts(p) {
    const { marketInfo, indexToken, initialCollateralToken, collateralToken, initialCollateralAmount, indexTokenAmount, isLong, leverage, triggerPrice, limitOrderType, position, fixedAcceptablePriceImpactBps, acceptablePriceImpactBuffer, externalSwapQuote, findSwapPath, userReferralInfo, uiFeeFactor, strategy, marketsInfoData, chainId, externalSwapQuoteParams, isSetAcceptablePriceImpactEnabled, } = p;
    const swapStrategy = {
        type: "noSwap",
        externalSwapQuote: undefined,
        swapPathStats: undefined,
        amountIn: 0n,
        amountOut: 0n,
        usdIn: 0n,
        usdOut: 0n,
        priceIn: 0n,
        priceOut: 0n,
        feesUsd: 0n,
    };
    const values = {
        initialCollateralAmount: 0n,
        initialCollateralUsd: 0n,
        collateralDeltaAmount: 0n,
        collateralDeltaUsd: 0n,
        swapStrategy,
        indexTokenAmount: 0n,
        sizeDeltaUsd: 0n,
        sizeDeltaInTokens: 0n,
        estimatedLeverage: 0n,
        indexPrice: 0n,
        initialCollateralPrice: 0n,
        collateralPrice: 0n,
        triggerPrice: 0n,
        acceptablePrice: 0n,
        acceptablePriceDeltaBps: 0n,
        recommendedAcceptablePriceDeltaBps: 0n,
        positionFeeUsd: 0n,
        uiFeeUsd: 0n,
        swapUiFeeUsd: 0n,
        feeDiscountUsd: 0n,
        borrowingFeeUsd: 0n,
        fundingFeeUsd: 0n,
        positionPriceImpactDeltaUsd: 0n,
        potentialPriceImpactDiffUsd: 0n,
        limitOrderType: limitOrderType,
        triggerThresholdType: undefined,
    };
    const isLimit = limitOrderType !== undefined;
    const swapOptimizationOrder = isLimit ? ["length", "liquidity"] : undefined;
    const prices = getIncreasePositionPrices({
        triggerPrice,
        indexToken,
        initialCollateralToken,
        collateralToken,
        limitOrderType,
        isLong,
    });
    values.indexPrice = prices.indexPrice;
    values.initialCollateralPrice = prices.initialCollateralPrice;
    values.collateralPrice = prices.collateralPrice;
    values.triggerPrice = prices.triggerPrice;
    values.triggerThresholdType = prices.triggerThresholdType;
    values.borrowingFeeUsd = position?.pendingBorrowingFeesUsd || 0n;
    values.fundingFeeUsd = position?.pendingFundingFeesUsd || 0n;
    if (values.indexPrice <= 0 || values.initialCollateralPrice <= 0 || values.collateralPrice <= 0) {
        return values;
    }
    // Size and collateral
    if (strategy === "leverageByCollateral" &&
        leverage !== undefined &&
        initialCollateralAmount !== undefined &&
        initialCollateralAmount > 0) {
        values.estimatedLeverage = leverage;
        values.initialCollateralAmount = initialCollateralAmount;
        values.initialCollateralUsd = (0, tokens_1.convertToUsd)(initialCollateralAmount, initialCollateralToken.decimals, values.initialCollateralPrice);
        if (externalSwapQuote) {
            const swapStrategy = {
                type: "externalSwap",
                externalSwapQuote,
                swapPathStats: undefined,
                ...externalSwapQuote,
            };
            values.swapStrategy = swapStrategy;
        }
        else {
            const swapAmounts = (0, swap_1.getSwapAmountsByFromValue)({
                tokenIn: initialCollateralToken,
                tokenOut: collateralToken,
                amountIn: initialCollateralAmount,
                isLimit: false,
                findSwapPath,
                uiFeeFactor,
                swapOptimizationOrder,
                marketsInfoData,
                chainId,
                externalSwapQuoteParams,
            });
            values.swapStrategy = swapAmounts.swapStrategy;
        }
        const swapAmountOut = values.swapStrategy.amountOut;
        const baseCollateralUsd = (0, tokens_1.convertToUsd)(swapAmountOut, collateralToken.decimals, values.collateralPrice);
        const baseSizeDeltaUsd = bigmath_1.bigMath.mulDiv(baseCollateralUsd, leverage, factors_1.BASIS_POINTS_DIVISOR_BIGINT);
        const { balanceWasImproved } = (0, fees_1.getPriceImpactForPosition)(marketInfo, baseSizeDeltaUsd, isLong);
        const basePositionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, baseSizeDeltaUsd, balanceWasImproved, userReferralInfo);
        const baseUiFeeUsd = (0, numbers_1.applyFactor)(baseSizeDeltaUsd, uiFeeFactor);
        const totalSwapVolumeUsd = (0, fees_1.getTotalSwapVolumeFromSwapStats)(values.swapStrategy.swapPathStats?.swapSteps);
        values.swapUiFeeUsd = (0, numbers_1.applyFactor)(totalSwapVolumeUsd, uiFeeFactor);
        values.sizeDeltaUsd = bigmath_1.bigMath.mulDiv(baseCollateralUsd - basePositionFeeInfo.positionFeeUsd - baseUiFeeUsd - values.swapUiFeeUsd, leverage, factors_1.BASIS_POINTS_DIVISOR_BIGINT);
        values.indexTokenAmount = (0, tokens_1.convertToTokenAmount)(values.sizeDeltaUsd, indexToken.decimals, values.indexPrice);
        const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, values.sizeDeltaUsd, balanceWasImproved, userReferralInfo);
        values.positionFeeUsd = positionFeeInfo.positionFeeUsd;
        values.feeDiscountUsd = positionFeeInfo.discountUsd;
        values.uiFeeUsd = (0, numbers_1.applyFactor)(values.sizeDeltaUsd, uiFeeFactor);
        values.collateralDeltaUsd =
            baseCollateralUsd -
                values.positionFeeUsd -
                values.borrowingFeeUsd -
                values.fundingFeeUsd -
                values.uiFeeUsd -
                values.swapUiFeeUsd;
        values.collateralDeltaAmount = (0, tokens_1.convertToTokenAmount)(values.collateralDeltaUsd, collateralToken.decimals, values.collateralPrice);
    }
    else if (strategy === "leverageBySize" &&
        leverage !== undefined &&
        indexTokenAmount !== undefined &&
        indexTokenAmount > 0) {
        values.estimatedLeverage = leverage;
        values.indexTokenAmount = indexTokenAmount;
        values.sizeDeltaUsd = (0, tokens_1.convertToUsd)(indexTokenAmount, indexToken.decimals, values.indexPrice);
        const { balanceWasImproved } = (0, fees_1.getPriceImpactForPosition)(marketInfo, values.sizeDeltaUsd, isLong);
        const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, values.sizeDeltaUsd, balanceWasImproved, userReferralInfo);
        values.positionFeeUsd = positionFeeInfo.positionFeeUsd;
        values.feeDiscountUsd = positionFeeInfo.discountUsd;
        values.uiFeeUsd = (0, numbers_1.applyFactor)(values.sizeDeltaUsd, uiFeeFactor);
        const { collateralDeltaUsd, collateralDeltaAmount, baseCollateralAmount } = leverageBySizeValues({
            collateralToken,
            leverage,
            sizeDeltaUsd: values.sizeDeltaUsd,
            collateralPrice: values.collateralPrice,
            uiFeeFactor,
            positionFeeUsd: values.positionFeeUsd,
            borrowingFeeUsd: values.borrowingFeeUsd,
            fundingFeeUsd: values.fundingFeeUsd,
            uiFeeUsd: values.uiFeeUsd,
            swapUiFeeUsd: values.swapUiFeeUsd,
        });
        values.collateralDeltaUsd = collateralDeltaUsd;
        values.collateralDeltaAmount = collateralDeltaAmount;
        if (externalSwapQuote) {
            const swapStrategy = {
                type: "externalSwap",
                externalSwapQuote,
                swapPathStats: undefined,
                ...externalSwapQuote,
            };
            values.swapStrategy = swapStrategy;
        }
        else {
            const swapAmounts = (0, swap_1.getSwapAmountsByToValue)({
                tokenIn: initialCollateralToken,
                tokenOut: collateralToken,
                amountOut: baseCollateralAmount,
                isLimit: false,
                findSwapPath,
                uiFeeFactor,
                marketsInfoData,
                chainId,
                externalSwapQuoteParams,
            });
            values.swapStrategy = swapAmounts.swapStrategy;
        }
        const swapAmountIn = values.swapStrategy.amountIn;
        values.initialCollateralAmount = swapAmountIn;
        values.initialCollateralUsd = (0, tokens_1.convertToUsd)(values.initialCollateralAmount, initialCollateralToken.decimals, values.initialCollateralPrice);
    }
    else if (strategy === "independent") {
        if (indexTokenAmount !== undefined && indexTokenAmount > 0) {
            values.indexTokenAmount = indexTokenAmount;
            values.sizeDeltaUsd = (0, tokens_1.convertToUsd)(indexTokenAmount, indexToken.decimals, values.indexPrice);
            const { balanceWasImproved } = (0, fees_1.getPriceImpactForPosition)(marketInfo, values.sizeDeltaUsd, isLong);
            const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, values.sizeDeltaUsd, balanceWasImproved, userReferralInfo);
            values.positionFeeUsd = positionFeeInfo.positionFeeUsd;
            values.feeDiscountUsd = positionFeeInfo.discountUsd;
            values.uiFeeUsd = (0, numbers_1.applyFactor)(values.sizeDeltaUsd, uiFeeFactor);
        }
        if (initialCollateralAmount !== undefined && initialCollateralAmount > 0) {
            values.initialCollateralAmount = initialCollateralAmount;
            values.initialCollateralUsd = (0, tokens_1.convertToUsd)(initialCollateralAmount, initialCollateralToken.decimals, values.initialCollateralPrice);
            if (externalSwapQuote) {
                const swapStrategy = {
                    type: "externalSwap",
                    externalSwapQuote,
                    swapPathStats: undefined,
                    ...externalSwapQuote,
                };
                values.swapStrategy = swapStrategy;
            }
            else {
                const swapAmounts = (0, swap_1.getSwapAmountsByFromValue)({
                    tokenIn: initialCollateralToken,
                    tokenOut: collateralToken,
                    amountIn: initialCollateralAmount,
                    isLimit: false,
                    findSwapPath,
                    uiFeeFactor,
                    swapOptimizationOrder,
                    marketsInfoData,
                    chainId,
                    externalSwapQuoteParams,
                });
                values.swapStrategy = swapAmounts.swapStrategy;
            }
            const swapAmountIn = values.swapStrategy.amountIn;
            const baseCollateralUsd = (0, tokens_1.convertToUsd)(swapAmountIn, initialCollateralToken.decimals, values.initialCollateralPrice);
            values.collateralDeltaUsd =
                baseCollateralUsd -
                    values.positionFeeUsd -
                    values.borrowingFeeUsd -
                    values.fundingFeeUsd -
                    values.uiFeeUsd -
                    values.swapUiFeeUsd;
            values.collateralDeltaAmount = (0, tokens_1.convertToTokenAmount)(values.collateralDeltaUsd, collateralToken.decimals, values.collateralPrice);
        }
        values.estimatedLeverage = (0, positions_1.getLeverage)({
            sizeInUsd: values.sizeDeltaUsd,
            collateralUsd: values.collateralDeltaUsd,
            pnl: 0n,
            pendingBorrowingFeesUsd: 0n,
            pendingFundingFeesUsd: 0n,
        });
    }
    const acceptablePriceInfo = (0, prices_1.getAcceptablePriceInfo)({
        marketInfo,
        isIncrease: true,
        isLimit,
        isLong,
        indexPrice: values.indexPrice,
        sizeDeltaUsd: values.sizeDeltaUsd,
    });
    values.positionPriceImpactDeltaUsd = acceptablePriceInfo.priceImpactDeltaUsd;
    values.potentialPriceImpactDiffUsd = (0, positions_1.getPriceImpactDiffUsd)({
        totalImpactDeltaUsd: values.positionPriceImpactDeltaUsd,
        marketInfo,
        sizeDeltaUsd: values.sizeDeltaUsd,
    });
    values.acceptablePrice = acceptablePriceInfo.acceptablePrice;
    values.acceptablePriceDeltaBps = acceptablePriceInfo.acceptablePriceDeltaBps;
    if (isLimit) {
        if (!isSetAcceptablePriceImpactEnabled || limitOrderType === orders_1.OrderType.StopIncrease) {
            values.acceptablePrice = isLong ? viem_1.maxUint256 : 0n;
        }
        else {
            let maxNegativePriceImpactBps = fixedAcceptablePriceImpactBps;
            values.recommendedAcceptablePriceDeltaBps = (0, prices_1.getDefaultAcceptablePriceImpactBps)({
                isIncrease: true,
                isLong,
                indexPrice: values.indexPrice,
                sizeDeltaUsd: values.sizeDeltaUsd,
                priceImpactDeltaUsd: values.positionPriceImpactDeltaUsd,
                acceptablePriceImapctBuffer: acceptablePriceImpactBuffer || factors_1.DEFAULT_ACCEPTABLE_PRICE_IMPACT_BUFFER,
            });
            if (maxNegativePriceImpactBps === undefined) {
                maxNegativePriceImpactBps = values.recommendedAcceptablePriceDeltaBps;
            }
            const limitAcceptablePriceInfo = (0, prices_1.getAcceptablePriceInfo)({
                marketInfo,
                isIncrease: true,
                isLimit,
                isLong,
                indexPrice: values.indexPrice,
                sizeDeltaUsd: values.sizeDeltaUsd,
                maxNegativePriceImpactBps,
            });
            values.acceptablePrice = limitAcceptablePriceInfo.acceptablePrice;
            values.acceptablePriceDeltaBps = limitAcceptablePriceInfo.acceptablePriceDeltaBps;
        }
    }
    values.sizeDeltaInTokens = (0, tokens_1.convertToTokenAmount)(values.sizeDeltaUsd, indexToken.decimals, values.indexPrice);
    return values;
}
exports.getIncreasePositionAmounts = getIncreasePositionAmounts;
function getTokensRatio({ fromToken, toToken, triggerRatioValue, markPrice, }) {
    const fromTokenPrice = fromToken?.prices.minPrice;
    const markRatio = (0, tokens_1.getTokensRatioByPrice)({
        fromToken,
        toToken,
        fromPrice: fromTokenPrice,
        toPrice: markPrice,
    });
    if (triggerRatioValue === undefined) {
        return { markRatio };
    }
    const triggerRatio = {
        ratio: triggerRatioValue > 0 ? triggerRatioValue : markRatio.ratio,
        largestToken: markRatio.largestToken,
        smallestToken: markRatio.smallestToken,
    };
    return {
        markRatio,
        triggerRatio,
    };
}
exports.getTokensRatio = getTokensRatio;
function leverageBySizeValues({ collateralToken, leverage, sizeDeltaUsd, collateralPrice, positionFeeUsd, borrowingFeeUsd, uiFeeUsd, swapUiFeeUsd, fundingFeeUsd, }) {
    const collateralDeltaUsd = bigmath_1.bigMath.mulDiv(sizeDeltaUsd, factors_1.BASIS_POINTS_DIVISOR_BIGINT, leverage);
    const collateralDeltaAmount = (0, tokens_1.convertToTokenAmount)(collateralDeltaUsd, collateralToken.decimals, collateralPrice);
    const baseCollateralUsd = collateralDeltaUsd !== 0n
        ? collateralDeltaUsd + positionFeeUsd + borrowingFeeUsd + fundingFeeUsd + uiFeeUsd + swapUiFeeUsd
        : 0n;
    const baseCollateralAmount = (0, tokens_1.convertToTokenAmount)(baseCollateralUsd, collateralToken.decimals, collateralPrice);
    return {
        collateralDeltaUsd,
        collateralDeltaAmount,
        baseCollateralUsd,
        baseCollateralAmount,
    };
}
exports.leverageBySizeValues = leverageBySizeValues;
function getIncreasePositionPrices({ triggerPrice, indexToken, initialCollateralToken, collateralToken, limitOrderType, isLong, }) {
    let indexPrice;
    let initialCollateralPrice;
    let triggerThresholdType;
    let collateralPrice;
    if (triggerPrice !== undefined && triggerPrice > 0 && limitOrderType !== undefined) {
        indexPrice = triggerPrice;
        initialCollateralPrice = (0, tokens_1.getIsEquivalentTokens)(indexToken, initialCollateralToken)
            ? triggerPrice
            : initialCollateralToken.prices.minPrice;
        collateralPrice = (0, tokens_1.getIsEquivalentTokens)(indexToken, collateralToken)
            ? triggerPrice
            : collateralToken.prices.minPrice;
        triggerThresholdType = (0, prices_1.getOrderThresholdType)(limitOrderType, isLong);
    }
    else {
        indexPrice = (0, prices_1.getMarkPrice)({ prices: indexToken.prices, isIncrease: true, isLong });
        initialCollateralPrice = initialCollateralToken.prices.minPrice;
        collateralPrice = collateralToken.prices.minPrice;
    }
    return {
        indexPrice,
        initialCollateralPrice,
        collateralPrice,
        triggerThresholdType,
        triggerPrice,
    };
}
exports.getIncreasePositionPrices = getIncreasePositionPrices;
function getNextPositionValuesForIncreaseTrade(p) {
    const { existingPosition, marketInfo, collateralToken, sizeDeltaUsd, sizeDeltaInTokens, collateralDeltaUsd, collateralDeltaAmount, indexPrice, isLong, showPnlInLeverage, minCollateralUsd, userReferralInfo, positionPriceImpactDeltaUsd, } = p;
    const nextCollateralUsd = existingPosition ? existingPosition.collateralUsd + collateralDeltaUsd : collateralDeltaUsd;
    const nextCollateralAmount = existingPosition
        ? existingPosition.collateralAmount + collateralDeltaAmount
        : collateralDeltaAmount;
    const nextSizeUsd = existingPosition ? existingPosition.sizeInUsd + sizeDeltaUsd : sizeDeltaUsd;
    const nextSizeInTokens = existingPosition ? existingPosition.sizeInTokens + sizeDeltaInTokens : sizeDeltaInTokens;
    const nextEntryPrice = (0, positions_1.getEntryPrice)({
        sizeInUsd: nextSizeUsd,
        sizeInTokens: nextSizeInTokens,
        indexToken: marketInfo.indexToken,
    }) ?? indexPrice;
    const nextPnl = existingPosition
        ? (0, positions_1.getPositionPnlUsd)({
            marketInfo,
            sizeInUsd: nextSizeUsd,
            sizeInTokens: nextSizeInTokens,
            markPrice: indexPrice,
            isLong,
        })
        : undefined;
    const nextLeverage = (0, positions_1.getLeverage)({
        sizeInUsd: nextSizeUsd,
        collateralUsd: nextCollateralUsd,
        pnl: showPnlInLeverage ? nextPnl : undefined,
        pendingBorrowingFeesUsd: 0n, // deducted on order
        pendingFundingFeesUsd: 0n, // deducted on order
    });
    const nextLiqPrice = (0, positions_1.getLiquidationPrice)({
        marketInfo,
        collateralToken,
        sizeInUsd: nextSizeUsd,
        sizeInTokens: nextSizeInTokens,
        collateralUsd: nextCollateralUsd,
        collateralAmount: nextCollateralAmount,
        minCollateralUsd,
        pendingBorrowingFeesUsd: 0n, // deducted on order
        pendingFundingFeesUsd: 0n, // deducted on order
        pendingImpactAmount: existingPosition?.pendingImpactAmount ?? 0n,
        isLong: isLong,
        userReferralInfo,
    });
    let nextPendingImpactDeltaUsd = existingPosition?.pendingImpactUsd !== undefined
        ? existingPosition.pendingImpactUsd + positionPriceImpactDeltaUsd
        : positionPriceImpactDeltaUsd;
    const potentialPriceImpactDiffUsd = (0, positions_1.getPriceImpactDiffUsd)({
        totalImpactDeltaUsd: nextPendingImpactDeltaUsd,
        marketInfo,
        sizeDeltaUsd: nextSizeUsd,
    });
    if (nextPendingImpactDeltaUsd > 0) {
        nextPendingImpactDeltaUsd = (0, fees_1.capPositionImpactUsdByMaxPriceImpactFactor)(marketInfo, nextSizeUsd, nextPendingImpactDeltaUsd);
    }
    nextPendingImpactDeltaUsd = (0, fees_1.capPositionImpactUsdByMaxImpactPool)(marketInfo, nextPendingImpactDeltaUsd);
    return {
        nextSizeUsd,
        nextCollateralUsd,
        nextEntryPrice,
        nextLeverage,
        nextLiqPrice,
        nextPendingImpactDeltaUsd,
        potentialPriceImpactDiffUsd,
    };
}
exports.getNextPositionValuesForIncreaseTrade = getNextPositionValuesForIncreaseTrade;

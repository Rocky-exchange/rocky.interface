"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextPositionValuesForDecreaseTrade = exports.getTotalFeesUsdForDecrease = exports.estimateCollateralCost = exports.payForCollateralCost = exports.getMinCollateralUsdForLeverage = exports.getIsFullClose = exports.getDecreasePositionAmounts = void 0;
const factors_1 = require("../../configs/factors");
const orders_1 = require("../../types/orders");
const bigmath_1 = require("../bigmath");
const fees_1 = require("../fees");
const numbers_1 = require("../numbers");
const positions_1 = require("../positions");
const prices_1 = require("../prices");
const swap_1 = require("../swap");
const tokens_1 = require("../tokens");
function getDecreasePositionAmounts(p) {
    const { marketInfo, collateralToken, isLong, position, closeSizeUsd, keepLeverage, triggerPrice, fixedAcceptablePriceImpactBps, acceptablePriceImpactBuffer, userReferralInfo, minCollateralUsd, minPositionSizeUsd, uiFeeFactor, triggerOrderType: orderType, receiveToken: receiveTokenArg, isSetAcceptablePriceImpactEnabled, } = p;
    const { indexToken } = marketInfo;
    const receiveToken = receiveTokenArg ?? collateralToken;
    const values = {
        isFullClose: false,
        sizeDeltaUsd: 0n,
        sizeDeltaInTokens: 0n,
        collateralDeltaUsd: 0n,
        collateralDeltaAmount: 0n,
        indexPrice: 0n,
        collateralPrice: 0n,
        triggerPrice: 0n,
        acceptablePrice: 0n,
        proportionalPendingImpactDeltaUsd: 0n,
        closePriceImpactDeltaUsd: 0n,
        totalPendingImpactDeltaUsd: 0n,
        priceImpactDiffUsd: 0n,
        balanceWasImproved: false,
        acceptablePriceDeltaBps: 0n,
        recommendedAcceptablePriceDeltaBps: 0n,
        estimatedPnl: 0n,
        estimatedPnlPercentage: 0n,
        realizedPnl: 0n,
        realizedPnlPercentage: 0n,
        positionFeeUsd: 0n,
        uiFeeUsd: 0n,
        swapUiFeeUsd: 0n,
        borrowingFeeUsd: 0n,
        fundingFeeUsd: 0n,
        feeDiscountUsd: 0n,
        swapProfitFeeUsd: 0n,
        payedOutputUsd: 0n,
        payedRemainingCollateralUsd: 0n,
        payedRemainingCollateralAmount: 0n,
        receiveTokenAmount: 0n,
        receiveUsd: 0n,
        triggerOrderType: orderType,
        triggerThresholdType: undefined,
        decreaseSwapType: orders_1.DecreasePositionSwapType.NoSwap,
    };
    const pnlToken = isLong ? marketInfo.longToken : marketInfo.shortToken;
    values.decreaseSwapType = getDecreaseSwapType(pnlToken, collateralToken, receiveToken);
    const markPrice = (0, prices_1.getMarkPrice)({ prices: indexToken.prices, isIncrease: false, isLong });
    const isTrigger = orderType !== undefined;
    if (orderType) {
        values.triggerPrice = triggerPrice;
        values.indexPrice = triggerPrice ?? markPrice;
        values.collateralPrice = (0, tokens_1.getIsEquivalentTokens)(indexToken, collateralToken)
            ? triggerPrice ?? markPrice
            : collateralToken.prices.minPrice;
        values.triggerThresholdType = (0, prices_1.getOrderThresholdType)(orderType, isLong);
    }
    else {
        values.indexPrice = markPrice;
        values.collateralPrice = collateralToken.prices.minPrice;
    }
    if (closeSizeUsd <= 0) {
        return values;
    }
    values.sizeDeltaUsd = closeSizeUsd;
    if (!position || position.sizeInUsd <= 0 || position.sizeInTokens <= 0) {
        applyAcceptablePrice({
            position,
            marketInfo,
            isLong,
            isTrigger,
            fixedAcceptablePriceImpactBps,
            acceptablePriceImpactBuffer,
            values,
            isSetAcceptablePriceImpactEnabled,
        });
        const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, values.sizeDeltaUsd, values.balanceWasImproved, userReferralInfo);
        values.positionFeeUsd = positionFeeInfo.positionFeeUsd;
        values.feeDiscountUsd = positionFeeInfo.discountUsd;
        values.uiFeeUsd = (0, numbers_1.applyFactor)(values.sizeDeltaUsd, uiFeeFactor);
        const totalFeesUsd = getTotalFeesUsdForDecrease({
            positionFeeUsd: values.positionFeeUsd,
            borrowingFeeUsd: 0n,
            fundingFeeUsd: 0n,
            swapProfitFeeUsd: 0n,
            swapUiFeeUsd: 0n,
            uiFeeUsd: values.uiFeeUsd,
            pnlUsd: 0n,
            totalPendingImpactDeltaUsd: values.totalPendingImpactDeltaUsd,
        });
        values.payedOutputUsd = totalFeesUsd;
        return values;
    }
    const estimatedCollateralUsd = (0, tokens_1.convertToUsd)(position.collateralAmount, collateralToken.decimals, values.collateralPrice);
    let estimatedCollateralDeltaUsd = 0n;
    if (keepLeverage) {
        estimatedCollateralDeltaUsd = bigmath_1.bigMath.mulDiv(values.sizeDeltaUsd, estimatedCollateralUsd, position.sizeInUsd);
    }
    values.isFullClose = getIsFullClose({
        position,
        sizeDeltaUsd: values.sizeDeltaUsd,
        indexPrice: values.indexPrice,
        remainingCollateralUsd: estimatedCollateralUsd - estimatedCollateralDeltaUsd,
        minCollateralUsd,
        minPositionSizeUsd,
    });
    if (values.isFullClose) {
        values.sizeDeltaUsd = position.sizeInUsd;
        values.sizeDeltaInTokens = position.sizeInTokens;
    }
    else {
        if (position.isLong) {
            values.sizeDeltaInTokens = (0, numbers_1.roundUpDivision)(position.sizeInTokens * values.sizeDeltaUsd, position.sizeInUsd);
        }
        else {
            values.sizeDeltaInTokens = bigmath_1.bigMath.mulDiv(position.sizeInTokens, values.sizeDeltaUsd, position.sizeInUsd);
        }
    }
    // PNL
    values.estimatedPnl = (0, positions_1.getPositionPnlUsd)({
        marketInfo,
        sizeInUsd: position.sizeInUsd,
        sizeInTokens: position.sizeInTokens,
        markPrice: values.indexPrice,
        isLong,
    });
    values.realizedPnl = bigmath_1.bigMath.mulDiv(values.estimatedPnl, values.sizeDeltaInTokens, position.sizeInTokens);
    values.realizedPnlPercentage =
        estimatedCollateralUsd !== 0n ? (0, numbers_1.getBasisPoints)(values.realizedPnl, estimatedCollateralUsd) : 0n;
    values.estimatedPnlPercentage =
        estimatedCollateralUsd !== 0n ? (0, numbers_1.getBasisPoints)(values.estimatedPnl, estimatedCollateralUsd) : 0n;
    applyAcceptablePrice({
        position,
        marketInfo,
        isLong,
        isTrigger,
        fixedAcceptablePriceImpactBps,
        acceptablePriceImpactBuffer,
        values,
        isSetAcceptablePriceImpactEnabled,
    });
    // Profit
    let profitUsd = 0n;
    if (values.realizedPnl > 0) {
        profitUsd = profitUsd + values.realizedPnl;
    }
    if (values.totalPendingImpactDeltaUsd > 0) {
        profitUsd = profitUsd + values.totalPendingImpactDeltaUsd;
    }
    const profitAmount = (0, tokens_1.convertToTokenAmount)(profitUsd, collateralToken.decimals, values.collateralPrice);
    // Fees
    const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, values.sizeDeltaUsd, values.balanceWasImproved, userReferralInfo);
    const estimatedPositionFeeCost = estimateCollateralCost(positionFeeInfo.positionFeeUsd, collateralToken, values.collateralPrice);
    const estimatedDiscountCost = estimateCollateralCost(positionFeeInfo.discountUsd, collateralToken, values.collateralPrice);
    values.positionFeeUsd = estimatedPositionFeeCost.usd;
    values.feeDiscountUsd = estimatedDiscountCost.usd;
    values.uiFeeUsd = (0, numbers_1.applyFactor)(values.sizeDeltaUsd, uiFeeFactor);
    const borrowFeeCost = estimateCollateralCost(position.pendingBorrowingFeesUsd, collateralToken, values.collateralPrice);
    values.borrowingFeeUsd = borrowFeeCost.usd;
    const fundingFeeCost = estimateCollateralCost(position.pendingFundingFeesUsd, collateralToken, values.collateralPrice);
    values.fundingFeeUsd = fundingFeeCost.usd;
    if (profitUsd > 0 && values.decreaseSwapType === orders_1.DecreasePositionSwapType.SwapPnlTokenToCollateralToken) {
        const swapProfitStats = (0, swap_1.getSwapStats)({
            marketInfo,
            tokenInAddress: pnlToken.address,
            tokenOutAddress: collateralToken.address,
            usdIn: profitUsd,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        values.swapProfitFeeUsd = swapProfitStats.swapFeeUsd - swapProfitStats.priceImpactDeltaUsd;
        values.swapUiFeeUsd = (0, numbers_1.applyFactor)(swapProfitStats.usdIn, uiFeeFactor);
    }
    else {
        values.swapProfitFeeUsd = 0n;
    }
    const totalFeesUsd = getTotalFeesUsdForDecrease({
        positionFeeUsd: values.positionFeeUsd,
        borrowingFeeUsd: values.borrowingFeeUsd,
        fundingFeeUsd: values.fundingFeeUsd,
        swapProfitFeeUsd: values.swapProfitFeeUsd,
        swapUiFeeUsd: values.swapUiFeeUsd,
        uiFeeUsd: values.uiFeeUsd,
        pnlUsd: values.realizedPnl,
        totalPendingImpactDeltaUsd: values.totalPendingImpactDeltaUsd,
    });
    const payedInfo = payForCollateralCost({
        initialCostUsd: totalFeesUsd,
        collateralToken,
        collateralPrice: values.collateralPrice,
        outputAmount: profitAmount,
        remainingCollateralAmount: position.collateralAmount,
    });
    values.payedOutputUsd = (0, tokens_1.convertToUsd)(payedInfo.paidOutputAmount, collateralToken.decimals, values.collateralPrice);
    values.payedRemainingCollateralAmount = payedInfo.paidRemainingCollateralAmount;
    values.payedRemainingCollateralUsd = (0, tokens_1.convertToUsd)(payedInfo.paidRemainingCollateralAmount, collateralToken.decimals, values.collateralPrice);
    // Collateral delta
    if (values.isFullClose) {
        values.collateralDeltaUsd = estimatedCollateralUsd;
        values.collateralDeltaAmount = position.collateralAmount;
        values.receiveTokenAmount = payedInfo.outputAmount + payedInfo.remainingCollateralAmount;
    }
    else if (keepLeverage &&
        position.sizeInUsd > 0 &&
        estimatedCollateralUsd > 0 &&
        payedInfo.remainingCollateralAmount > 0) {
        const remainingCollateralUsd = (0, tokens_1.convertToUsd)(payedInfo.remainingCollateralAmount, collateralToken.decimals, values.collateralPrice);
        const nextSizeInUsd = position.sizeInUsd - values.sizeDeltaUsd;
        const leverageWithoutPnl = (0, positions_1.getLeverage)({
            sizeInUsd: position.sizeInUsd,
            collateralUsd: estimatedCollateralUsd,
            pendingBorrowingFeesUsd: position.pendingBorrowingFeesUsd,
            pendingFundingFeesUsd: position.pendingFundingFeesUsd,
            pnl: undefined,
        });
        values.collateralDeltaUsd =
            /**
             * 1. @see https://app.asana.com/0/1204313444805313/1207549197964321/f
             * 2. leverageWithoutPnl may be zero if sizeInUsd is defaulted to 0n when position not ready yet
             */
            leverageWithoutPnl !== undefined && leverageWithoutPnl !== 0n
                ? remainingCollateralUsd - bigmath_1.bigMath.mulDiv(nextSizeInUsd, numbers_1.BASIS_POINTS_DIVISOR_BIGINT, leverageWithoutPnl)
                : 0n;
        values.collateralDeltaAmount = (0, tokens_1.convertToTokenAmount)(values.collateralDeltaUsd, collateralToken.decimals, values.collateralPrice);
        values.receiveTokenAmount = payedInfo.outputAmount + values.collateralDeltaAmount;
    }
    else {
        values.collateralDeltaUsd = 0n;
        values.collateralDeltaAmount = 0n;
        values.receiveTokenAmount = payedInfo.outputAmount;
    }
    values.receiveUsd = (0, tokens_1.convertToUsd)(values.receiveTokenAmount, collateralToken.decimals, values.collateralPrice);
    return values;
}
exports.getDecreasePositionAmounts = getDecreasePositionAmounts;
function getIsFullClose(p) {
    const { position, sizeDeltaUsd, indexPrice, remainingCollateralUsd, minCollateralUsd, minPositionSizeUsd } = p;
    const { marketInfo, isLong } = position;
    if (position.sizeInUsd - sizeDeltaUsd < (0, numbers_1.expandDecimals)(1, numbers_1.USD_DECIMALS)) {
        return true;
    }
    const estimatedPnl = (0, positions_1.getPositionPnlUsd)({
        marketInfo,
        sizeInUsd: position.sizeInUsd,
        sizeInTokens: position.sizeInTokens,
        markPrice: indexPrice,
        isLong,
    });
    const realizedPnl = bigmath_1.bigMath.mulDiv(estimatedPnl, sizeDeltaUsd, position.sizeInUsd);
    const estimatedRemainingPnl = estimatedPnl - realizedPnl;
    if (realizedPnl < 0) {
        const estimatedRemainingCollateralUsd = remainingCollateralUsd - realizedPnl;
        let minCollateralFactor = isLong
            ? marketInfo.minCollateralFactorForOpenInterestLong
            : marketInfo.minCollateralFactorForOpenInterestShort;
        const minCollateralFactorForMarket = marketInfo.minCollateralFactor;
        if (minCollateralFactorForMarket > minCollateralFactor) {
            minCollateralFactor = minCollateralFactorForMarket;
        }
        const minCollateralUsdForLeverage = (0, numbers_1.applyFactor)(position.sizeInUsd, minCollateralFactor);
        const willCollateralBeSufficient = estimatedRemainingCollateralUsd >= minCollateralUsdForLeverage;
        if (!willCollateralBeSufficient) {
            if (estimatedRemainingCollateralUsd + estimatedRemainingPnl < minCollateralUsd ||
                position.sizeInUsd - sizeDeltaUsd < minPositionSizeUsd) {
                return true;
            }
        }
    }
    return false;
}
exports.getIsFullClose = getIsFullClose;
function getMinCollateralUsdForLeverage(position, openInterestDelta) {
    const minCollateralFactor = (0, positions_1.getMinCollateralFactorForPosition)(position, openInterestDelta);
    return (0, numbers_1.applyFactor)(position.sizeInUsd, minCollateralFactor);
}
exports.getMinCollateralUsdForLeverage = getMinCollateralUsdForLeverage;
function payForCollateralCost(p) {
    const { initialCostUsd, collateralToken, collateralPrice, outputAmount, remainingCollateralAmount } = p;
    const values = {
        outputAmount: BigInt(outputAmount),
        remainingCollateralAmount: BigInt(remainingCollateralAmount),
        paidOutputAmount: 0n,
        paidRemainingCollateralAmount: 0n,
    };
    let remainingCostAmount = (0, tokens_1.convertToTokenAmount)(initialCostUsd, collateralToken.decimals, collateralPrice);
    if (remainingCostAmount == 0n) {
        return values;
    }
    if (values.outputAmount > 0) {
        if (values.outputAmount > remainingCostAmount) {
            values.outputAmount = values.outputAmount - remainingCostAmount;
            values.paidOutputAmount = remainingCostAmount;
            remainingCostAmount = 0n;
        }
        else {
            remainingCostAmount = remainingCostAmount - values.outputAmount;
            values.paidOutputAmount = values.outputAmount;
            values.outputAmount = 0n;
        }
    }
    if (remainingCostAmount == 0n) {
        return values;
    }
    if (values.remainingCollateralAmount > remainingCostAmount) {
        values.remainingCollateralAmount = values.remainingCollateralAmount - remainingCostAmount;
        values.paidRemainingCollateralAmount = remainingCostAmount;
        remainingCostAmount = 0n;
    }
    else {
        remainingCostAmount = remainingCostAmount - remainingCollateralAmount;
        values.paidRemainingCollateralAmount = values.remainingCollateralAmount;
        values.remainingCollateralAmount = 0n;
    }
    return values;
}
exports.payForCollateralCost = payForCollateralCost;
function applyAcceptablePrice(p) {
    const { position, marketInfo, isLong, values, isTrigger, fixedAcceptablePriceImpactBps, acceptablePriceImpactBuffer, isSetAcceptablePriceImpactEnabled, } = p;
    const acceptablePriceInfo = (0, prices_1.getAcceptablePriceInfo)({
        marketInfo,
        isIncrease: false,
        isLimit: false,
        isLong,
        indexPrice: values.indexPrice,
        sizeDeltaUsd: values.sizeDeltaUsd,
    });
    values.acceptablePrice = acceptablePriceInfo.acceptablePrice;
    values.acceptablePriceDeltaBps = acceptablePriceInfo.acceptablePriceDeltaBps;
    values.balanceWasImproved = acceptablePriceInfo.balanceWasImproved;
    const totalImpactValues = (0, positions_1.getNetPriceImpactDeltaUsdForDecrease)({
        marketInfo,
        sizeInUsd: position?.sizeInUsd ?? 0n,
        pendingImpactAmount: position?.pendingImpactAmount ?? 0n,
        sizeDeltaUsd: values.sizeDeltaUsd,
        priceImpactDeltaUsd: acceptablePriceInfo.priceImpactDeltaUsd,
    });
    values.closePriceImpactDeltaUsd = acceptablePriceInfo.priceImpactDeltaUsd;
    values.totalPendingImpactDeltaUsd = totalImpactValues.totalImpactDeltaUsd;
    values.proportionalPendingImpactDeltaUsd = totalImpactValues.proportionalPendingImpactDeltaUsd;
    values.priceImpactDiffUsd = totalImpactValues.priceImpactDiffUsd;
    if (isTrigger) {
        if (!isSetAcceptablePriceImpactEnabled || values.triggerOrderType === orders_1.OrderType.StopLossDecrease) {
            values.acceptablePrice = isLong ? 0n : numbers_1.MaxUint256;
        }
        else {
            let maxNegativePriceImpactBps = fixedAcceptablePriceImpactBps;
            values.recommendedAcceptablePriceDeltaBps = (0, prices_1.getDefaultAcceptablePriceImpactBps)({
                isIncrease: false,
                isLong,
                indexPrice: values.indexPrice,
                sizeDeltaUsd: values.sizeDeltaUsd,
                priceImpactDeltaUsd: values.closePriceImpactDeltaUsd,
                acceptablePriceImapctBuffer: acceptablePriceImpactBuffer || factors_1.DEFAULT_ACCEPTABLE_PRICE_IMPACT_BUFFER,
            });
            if (maxNegativePriceImpactBps === undefined) {
                maxNegativePriceImpactBps = values.recommendedAcceptablePriceDeltaBps;
            }
            const triggerAcceptablePriceInfo = (0, prices_1.getAcceptablePriceInfo)({
                marketInfo,
                isIncrease: false,
                isLimit: false,
                isLong,
                indexPrice: values.indexPrice,
                sizeDeltaUsd: values.sizeDeltaUsd,
                maxNegativePriceImpactBps,
            });
            values.acceptablePrice = triggerAcceptablePriceInfo.acceptablePrice;
            values.acceptablePriceDeltaBps = triggerAcceptablePriceInfo.acceptablePriceDeltaBps;
        }
    }
    return values;
}
function estimateCollateralCost(baseUsd, collateralToken, collateralPrice) {
    const amount = (0, tokens_1.convertToTokenAmount)(baseUsd, collateralToken.decimals, collateralToken.prices.minPrice);
    const usd = (0, tokens_1.convertToUsd)(amount, collateralToken.decimals, collateralPrice);
    return {
        amount,
        usd,
    };
}
exports.estimateCollateralCost = estimateCollateralCost;
function getTotalFeesUsdForDecrease({ positionFeeUsd, borrowingFeeUsd, fundingFeeUsd, swapProfitFeeUsd, swapUiFeeUsd, uiFeeUsd, pnlUsd, totalPendingImpactDeltaUsd, }) {
    const negativePriceImpactUsd = totalPendingImpactDeltaUsd < 0 ? bigmath_1.bigMath.abs(totalPendingImpactDeltaUsd) : 0n;
    const negativePnlUsd = pnlUsd < 0 ? bigmath_1.bigMath.abs(pnlUsd) : 0n;
    const totalFeesUsd = positionFeeUsd +
        borrowingFeeUsd +
        fundingFeeUsd +
        swapProfitFeeUsd +
        swapUiFeeUsd +
        uiFeeUsd +
        negativePnlUsd +
        negativePriceImpactUsd;
    return totalFeesUsd;
}
exports.getTotalFeesUsdForDecrease = getTotalFeesUsdForDecrease;
function getNextPositionValuesForDecreaseTrade(p) {
    const { existingPosition, marketInfo, collateralToken, sizeDeltaUsd, sizeDeltaInTokens, realizedPnl, estimatedPnl, collateralDeltaUsd, collateralDeltaAmount, payedRemainingCollateralUsd, payedRemainingCollateralAmount, showPnlInLeverage, proportionalPendingImpactDeltaUsd, isLong, minCollateralUsd, userReferralInfo, } = p;
    const nextSizeUsd = existingPosition ? existingPosition.sizeInUsd - sizeDeltaUsd : 0n;
    const nextSizeInTokens = existingPosition ? existingPosition.sizeInTokens - sizeDeltaInTokens : 0n;
    let nextCollateralUsd = existingPosition
        ? existingPosition.collateralUsd - collateralDeltaUsd - payedRemainingCollateralUsd
        : 0n;
    if (nextCollateralUsd < 0) {
        nextCollateralUsd = 0n;
    }
    let nextCollateralAmount = existingPosition
        ? existingPosition.collateralAmount - collateralDeltaAmount - payedRemainingCollateralAmount
        : 0n;
    if (nextCollateralAmount < 0) {
        nextCollateralAmount = 0n;
    }
    const nextPnl = estimatedPnl ? estimatedPnl - realizedPnl : 0n;
    const nextPnlPercentage = nextCollateralUsd !== 0n ? (0, numbers_1.getBasisPoints)(nextPnl, nextCollateralUsd) : 0n;
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
        sizeInTokens: nextSizeInTokens,
        sizeInUsd: nextSizeUsd,
        collateralUsd: nextCollateralUsd,
        collateralAmount: nextCollateralAmount,
        minCollateralUsd,
        userReferralInfo,
        pendingImpactAmount: existingPosition?.pendingImpactAmount ?? 0n,
        pendingBorrowingFeesUsd: 0n, // deducted on order
        pendingFundingFeesUsd: 0n, // deducted on order
        isLong: isLong,
    });
    const nextPendingImpactDeltaUsd = existingPosition?.pendingImpactUsd !== undefined && proportionalPendingImpactDeltaUsd !== undefined
        ? existingPosition.pendingImpactUsd - proportionalPendingImpactDeltaUsd
        : 0n;
    return {
        nextSizeUsd,
        nextCollateralUsd,
        nextLiqPrice,
        nextPnl,
        nextPnlPercentage,
        nextLeverage,
        nextPendingImpactDeltaUsd,
    };
}
exports.getNextPositionValuesForDecreaseTrade = getNextPositionValuesForDecreaseTrade;
function getDecreaseSwapType(pnlToken, collateralToken, receiveToken) {
    if ((0, tokens_1.getIsEquivalentTokens)(pnlToken, collateralToken)) {
        return orders_1.DecreasePositionSwapType.NoSwap;
    }
    else if ((0, tokens_1.getIsEquivalentTokens)(pnlToken, receiveToken)) {
        return orders_1.DecreasePositionSwapType.SwapCollateralTokenToPnlToken;
    }
    else {
        return orders_1.DecreasePositionSwapType.SwapPnlTokenToCollateralToken;
    }
}

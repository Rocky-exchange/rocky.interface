"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMinCollateralFactorForPosition = exports.getPriceImpactDiffUsd = exports.getNetPriceImpactDeltaUsdForDecrease = exports.getLiquidationPrice = exports.getLeverage = exports.getPositionPnlAfterFees = exports.getPositionNetValue = exports.getPositionPendingFeesUsd = exports.getPositionValueUsd = exports.getPositionPnlUsd = exports.getEntryPrice = exports.parsePositionKey = exports.getPositionKey = void 0;
const factors_1 = require("../configs/factors");
const bigmath_1 = require("./bigmath");
const fees_1 = require("./fees");
const markets_1 = require("./markets");
const numbers_1 = require("./numbers");
const tokens_1 = require("./tokens");
function getPositionKey(account, marketAddress, collateralAddress, isLong) {
    return `${account}:${marketAddress}:${collateralAddress}:${isLong}`;
}
exports.getPositionKey = getPositionKey;
function parsePositionKey(positionKey) {
    const [account, marketAddress, collateralAddress, isLong] = positionKey.split(":");
    return { account, marketAddress, collateralAddress, isLong: isLong === "true" };
}
exports.parsePositionKey = parsePositionKey;
function getEntryPrice(p) {
    const { sizeInUsd, sizeInTokens, indexToken } = p;
    if (sizeInTokens <= 0) {
        return undefined;
    }
    return bigmath_1.bigMath.mulDiv(sizeInUsd, (0, numbers_1.expandDecimals)(1, indexToken.decimals), sizeInTokens);
}
exports.getEntryPrice = getEntryPrice;
function getPositionPnlUsd(p) {
    const { marketInfo, sizeInUsd, sizeInTokens, markPrice, isLong } = p;
    const positionValueUsd = getPositionValueUsd({ indexToken: marketInfo.indexToken, sizeInTokens, markPrice });
    let totalPnl = isLong ? positionValueUsd - sizeInUsd : sizeInUsd - positionValueUsd;
    if (totalPnl <= 0) {
        return totalPnl;
    }
    const poolPnl = (0, markets_1.getMarketPnl)(marketInfo, isLong, true);
    const poolUsd = (0, markets_1.getPoolUsdWithoutPnl)(marketInfo, isLong, "minPrice");
    const cappedPnl = (0, markets_1.getCappedPoolPnl)({
        marketInfo,
        poolUsd,
        poolPnl,
        isLong,
    });
    const WEI_PRECISION = (0, numbers_1.expandDecimals)(1, 18);
    if (cappedPnl !== poolPnl && cappedPnl > 0 && poolPnl > 0) {
        totalPnl = bigmath_1.bigMath.mulDiv(totalPnl, cappedPnl / WEI_PRECISION, poolPnl / WEI_PRECISION);
    }
    return totalPnl;
}
exports.getPositionPnlUsd = getPositionPnlUsd;
function getPositionValueUsd(p) {
    const { indexToken, sizeInTokens, markPrice } = p;
    return (0, tokens_1.convertToUsd)(sizeInTokens, indexToken.decimals, markPrice);
}
exports.getPositionValueUsd = getPositionValueUsd;
function getPositionPendingFeesUsd(p) {
    const { pendingFundingFeesUsd, pendingBorrowingFeesUsd } = p;
    return pendingBorrowingFeesUsd + pendingFundingFeesUsd;
}
exports.getPositionPendingFeesUsd = getPositionPendingFeesUsd;
function getPositionNetValue(p) {
    const { pnl, closingFeeUsd, collateralUsd, uiFeeUsd, totalPendingImpactDeltaUsd, priceImpactDiffUsd } = p;
    const pendingFeesUsd = getPositionPendingFeesUsd(p);
    return (collateralUsd - pendingFeesUsd - closingFeeUsd - uiFeeUsd + pnl + totalPendingImpactDeltaUsd + priceImpactDiffUsd);
}
exports.getPositionNetValue = getPositionNetValue;
function getPositionPnlAfterFees({ pnl, pendingBorrowingFeesUsd, pendingFundingFeesUsd, closingFeeUsd, uiFeeUsd, totalPendingImpactDeltaUsd, priceImpactDiffUsd, }) {
    const pnlAfterFees = pnl -
        pendingBorrowingFeesUsd -
        pendingFundingFeesUsd -
        closingFeeUsd -
        uiFeeUsd +
        totalPendingImpactDeltaUsd +
        priceImpactDiffUsd;
    return pnlAfterFees;
}
exports.getPositionPnlAfterFees = getPositionPnlAfterFees;
function getLeverage(p) {
    const { pnl, sizeInUsd, collateralUsd, pendingBorrowingFeesUsd, pendingFundingFeesUsd } = p;
    const totalPendingFeesUsd = getPositionPendingFeesUsd({ pendingFundingFeesUsd, pendingBorrowingFeesUsd });
    const remainingCollateralUsd = collateralUsd + (pnl ?? 0n) - totalPendingFeesUsd;
    if (remainingCollateralUsd <= 0) {
        return undefined;
    }
    return bigmath_1.bigMath.mulDiv(sizeInUsd, factors_1.BASIS_POINTS_DIVISOR_BIGINT, remainingCollateralUsd);
}
exports.getLeverage = getLeverage;
function getLiquidationPrice(p) {
    const { sizeInUsd, sizeInTokens, collateralUsd, collateralAmount, marketInfo, collateralToken, pendingFundingFeesUsd, pendingBorrowingFeesUsd, pendingImpactAmount, minCollateralUsd, isLong, userReferralInfo, useMaxPriceImpact, } = p;
    if (sizeInUsd <= 0 || sizeInTokens <= 0) {
        return undefined;
    }
    const { indexToken } = marketInfo;
    const closingFeeUsd = (0, fees_1.getPositionFee)(marketInfo, sizeInUsd, false, userReferralInfo).positionFeeUsd;
    const totalPendingFeesUsd = getPositionPendingFeesUsd({ pendingFundingFeesUsd, pendingBorrowingFeesUsd });
    const totalFeesUsd = totalPendingFeesUsd + closingFeeUsd;
    const maxNegativePriceImpactUsd = -1n * (0, numbers_1.applyFactor)(sizeInUsd, marketInfo.maxPositionImpactFactorForLiquidations);
    let priceImpactDeltaUsd = 0n;
    if (useMaxPriceImpact) {
        priceImpactDeltaUsd = maxNegativePriceImpactUsd;
    }
    else {
        const priceImpactForPosition = (0, fees_1.getPriceImpactForPosition)(marketInfo, -sizeInUsd, isLong, { fallbackToZero: true });
        priceImpactDeltaUsd = priceImpactForPosition.priceImpactDeltaUsd;
        if (priceImpactDeltaUsd > 0) {
            priceImpactDeltaUsd = (0, fees_1.capPositionImpactUsdByMaxPriceImpactFactor)(marketInfo, sizeInUsd, priceImpactDeltaUsd);
        }
        const pendingImpactUsd = (0, tokens_1.convertToUsd)(pendingImpactAmount, marketInfo.indexToken.decimals, pendingImpactAmount > 0 ? marketInfo.indexToken.prices.minPrice : marketInfo.indexToken.prices.maxPrice);
        priceImpactDeltaUsd = priceImpactDeltaUsd + pendingImpactUsd;
        if (priceImpactDeltaUsd > 0) {
            priceImpactDeltaUsd = 0n;
        }
        else if (priceImpactDeltaUsd < maxNegativePriceImpactUsd) {
            priceImpactDeltaUsd = maxNegativePriceImpactUsd;
        }
    }
    let liquidationCollateralUsd = (0, numbers_1.applyFactor)(sizeInUsd, marketInfo.minCollateralFactorForLiquidation);
    if (liquidationCollateralUsd < minCollateralUsd) {
        liquidationCollateralUsd = minCollateralUsd;
    }
    let liquidationPrice;
    if ((0, tokens_1.getIsEquivalentTokens)(collateralToken, indexToken)) {
        if (isLong) {
            const denominator = sizeInTokens + collateralAmount;
            if (denominator == 0n) {
                return undefined;
            }
            liquidationPrice =
                ((sizeInUsd + liquidationCollateralUsd - priceImpactDeltaUsd + totalFeesUsd) / denominator) *
                    (0, numbers_1.expandDecimals)(1, indexToken.decimals);
        }
        else {
            const denominator = sizeInTokens - collateralAmount;
            if (denominator == 0n) {
                return undefined;
            }
            liquidationPrice =
                ((sizeInUsd - liquidationCollateralUsd + priceImpactDeltaUsd - totalFeesUsd) / denominator) *
                    (0, numbers_1.expandDecimals)(1, indexToken.decimals);
        }
    }
    else {
        if (sizeInTokens == 0n) {
            return undefined;
        }
        const remainingCollateralUsd = collateralUsd + priceImpactDeltaUsd - totalPendingFeesUsd - closingFeeUsd;
        if (isLong) {
            liquidationPrice =
                ((liquidationCollateralUsd - remainingCollateralUsd + sizeInUsd) / sizeInTokens) *
                    (0, numbers_1.expandDecimals)(1, indexToken.decimals);
        }
        else {
            liquidationPrice =
                ((liquidationCollateralUsd - remainingCollateralUsd - sizeInUsd) / -sizeInTokens) *
                    (0, numbers_1.expandDecimals)(1, indexToken.decimals);
        }
    }
    if (liquidationPrice <= 0) {
        return undefined;
    }
    return liquidationPrice;
}
exports.getLiquidationPrice = getLiquidationPrice;
function getNetPriceImpactDeltaUsdForDecrease({ marketInfo, sizeInUsd, pendingImpactAmount, priceImpactDeltaUsd, sizeDeltaUsd, }) {
    const { proportionalPendingImpactDeltaUsd } = (0, fees_1.getProportionalPendingImpactValues)({
        sizeInUsd,
        sizeDeltaUsd,
        pendingImpactAmount,
        indexToken: marketInfo.indexToken,
    });
    let totalImpactDeltaUsd = priceImpactDeltaUsd + proportionalPendingImpactDeltaUsd;
    const priceImpactDiffUsd = getPriceImpactDiffUsd({
        totalImpactDeltaUsd,
        marketInfo,
        sizeDeltaUsd,
    });
    if (totalImpactDeltaUsd > 0) {
        totalImpactDeltaUsd = (0, fees_1.capPositionImpactUsdByMaxPriceImpactFactor)(marketInfo, sizeDeltaUsd, totalImpactDeltaUsd);
    }
    totalImpactDeltaUsd = (0, fees_1.capPositionImpactUsdByMaxImpactPool)(marketInfo, totalImpactDeltaUsd);
    return {
        totalImpactDeltaUsd,
        proportionalPendingImpactDeltaUsd,
        priceImpactDiffUsd,
    };
}
exports.getNetPriceImpactDeltaUsdForDecrease = getNetPriceImpactDeltaUsdForDecrease;
function getPriceImpactDiffUsd({ totalImpactDeltaUsd, marketInfo, sizeDeltaUsd, }) {
    if (totalImpactDeltaUsd > 0) {
        return 0n;
    }
    const { maxNegativeImpactFactor } = (0, fees_1.getMaxPositionImpactFactors)(marketInfo);
    const maxNegativeImpactUsd = -(0, numbers_1.applyFactor)(sizeDeltaUsd, maxNegativeImpactFactor);
    let priceImpactDiffUsd = 0n;
    if (totalImpactDeltaUsd < maxNegativeImpactUsd) {
        priceImpactDiffUsd = maxNegativeImpactUsd - totalImpactDeltaUsd;
    }
    return priceImpactDiffUsd;
}
exports.getPriceImpactDiffUsd = getPriceImpactDiffUsd;
function getMinCollateralFactorForPosition(position, openInterestDelta) {
    const marketInfo = position.marketInfo;
    const isLong = position.isLong;
    const openInterest = (0, markets_1.getOpenInterestUsd)(marketInfo, isLong) + openInterestDelta;
    const minCollateralFactorMultiplier = isLong
        ? marketInfo.minCollateralFactorForOpenInterestLong
        : marketInfo.minCollateralFactorForOpenInterestShort;
    let minCollateralFactor = bigmath_1.bigMath.mulDiv(openInterest, minCollateralFactorMultiplier, numbers_1.PRECISION);
    const minCollateralFactorForMarket = marketInfo.minCollateralFactor;
    if (minCollateralFactorForMarket > minCollateralFactor) {
        minCollateralFactor = minCollateralFactorForMarket;
    }
    return minCollateralFactor;
}
exports.getMinCollateralFactorForPosition = getMinCollateralFactorForPosition;

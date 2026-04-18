"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultAcceptablePriceImpactBps = exports.getAcceptablePriceByPriceImpact = exports.getAcceptablePriceInfo = exports.getOrderThresholdType = exports.getShouldUseMaxPrice = exports.getMarkPrice = void 0;
const factors_1 = require("../configs/factors");
const orders_1 = require("../types/orders");
const trade_1 = require("../types/trade");
const bigmath_1 = require("./bigmath");
const fees_1 = require("./fees");
const numbers_1 = require("./numbers");
const tokens_1 = require("./tokens");
function getMarkPrice(p) {
    const { prices, isIncrease, isLong } = p;
    const shouldUseMaxPrice = getShouldUseMaxPrice(isIncrease, isLong);
    return shouldUseMaxPrice ? prices.maxPrice : prices.minPrice;
}
exports.getMarkPrice = getMarkPrice;
function getShouldUseMaxPrice(isIncrease, isLong) {
    return isIncrease ? isLong : !isLong;
}
exports.getShouldUseMaxPrice = getShouldUseMaxPrice;
function getOrderThresholdType(orderType, isLong) {
    // limit increase order
    if (orderType === orders_1.OrderType.LimitIncrease) {
        return isLong ? trade_1.TriggerThresholdType.Below : trade_1.TriggerThresholdType.Above;
    }
    // stop market order
    if (orderType === orders_1.OrderType.StopIncrease) {
        return isLong ? trade_1.TriggerThresholdType.Above : trade_1.TriggerThresholdType.Below;
    }
    // take profit order
    if (orderType === orders_1.OrderType.LimitDecrease) {
        return isLong ? trade_1.TriggerThresholdType.Above : trade_1.TriggerThresholdType.Below;
    }
    // stop loss order
    if (orderType === orders_1.OrderType.StopLossDecrease) {
        return isLong ? trade_1.TriggerThresholdType.Below : trade_1.TriggerThresholdType.Above;
    }
    return undefined;
}
exports.getOrderThresholdType = getOrderThresholdType;
function getAcceptablePriceInfo(p) {
    const { marketInfo, isIncrease, isLong, indexPrice, sizeDeltaUsd, maxNegativePriceImpactBps } = p;
    const { indexToken } = marketInfo;
    const values = {
        acceptablePrice: 0n,
        acceptablePriceDeltaBps: 0n,
        priceImpactDeltaAmount: 0n,
        priceImpactDeltaUsd: 0n,
        priceImpactDiffUsd: 0n,
        balanceWasImproved: false,
    };
    if (sizeDeltaUsd <= 0 || indexPrice == 0n) {
        return values;
    }
    const shouldFlipPriceImpact = getShouldUseMaxPrice(p.isIncrease, p.isLong);
    // For Limit / Trigger orders
    if (maxNegativePriceImpactBps !== undefined && maxNegativePriceImpactBps > 0) {
        let priceDelta = bigmath_1.bigMath.mulDiv(indexPrice, maxNegativePriceImpactBps, factors_1.BASIS_POINTS_DIVISOR_BIGINT);
        priceDelta = shouldFlipPriceImpact ? priceDelta * -1n : priceDelta;
        values.acceptablePrice = indexPrice - priceDelta;
        values.acceptablePriceDeltaBps = maxNegativePriceImpactBps * -1n;
        const priceImpact = (0, fees_1.getPriceImpactByAcceptablePrice)({
            sizeDeltaUsd,
            acceptablePrice: values.acceptablePrice,
            indexPrice,
            isLong,
            isIncrease,
        });
        values.priceImpactDeltaUsd = priceImpact.priceImpactDeltaUsd;
        values.priceImpactDeltaAmount = priceImpact.priceImpactDeltaAmount;
        return values;
    }
    const { priceImpactDeltaUsd, balanceWasImproved } = (0, fees_1.getCappedPositionImpactUsd)(marketInfo, sizeDeltaUsd, isLong, isIncrease, {
        fallbackToZero: !isIncrease,
        shouldCapNegativeImpact: false,
    });
    /**
     * We display this value as price impact on action (increase or decrease)
     * But for acceptable price calculation uncapped price impact is used
     * Also on decrease action we calculate totalImpactUsd which will be deducted from the collateral
     */
    values.priceImpactDeltaUsd = priceImpactDeltaUsd;
    values.balanceWasImproved = balanceWasImproved;
    if (values.priceImpactDeltaUsd > 0) {
        values.priceImpactDeltaAmount = (0, tokens_1.convertToTokenAmount)(values.priceImpactDeltaUsd, indexToken.decimals, indexToken.prices.maxPrice);
    }
    else {
        values.priceImpactDeltaAmount = (0, numbers_1.roundUpMagnitudeDivision)(values.priceImpactDeltaUsd * (0, numbers_1.expandDecimals)(1, indexToken.decimals), indexToken.prices.minPrice);
    }
    // Use uncapped price impact for the acceptable price calculation
    const { priceImpactDeltaUsd: priceImpactDeltaUsdForAcceptablePrice } = (0, fees_1.getCappedPositionImpactUsd)(marketInfo, sizeDeltaUsd, isLong, isIncrease, {
        fallbackToZero: !isIncrease,
        shouldCapNegativeImpact: false,
    });
    const acceptablePriceValues = getAcceptablePriceByPriceImpact({
        isIncrease,
        isLong,
        indexPrice,
        sizeDeltaUsd,
        priceImpactDeltaUsd: priceImpactDeltaUsdForAcceptablePrice,
    });
    values.acceptablePrice = acceptablePriceValues.acceptablePrice;
    values.acceptablePriceDeltaBps = acceptablePriceValues.acceptablePriceDeltaBps;
    return values;
}
exports.getAcceptablePriceInfo = getAcceptablePriceInfo;
function getAcceptablePriceByPriceImpact(p) {
    const { indexPrice, sizeDeltaUsd, priceImpactDeltaUsd } = p;
    if (sizeDeltaUsd <= 0 || indexPrice == 0n) {
        return {
            acceptablePrice: indexPrice,
            acceptablePriceDeltaBps: 0n,
            priceDelta: 0n,
        };
    }
    const shouldFlipPriceImpact = getShouldUseMaxPrice(p.isIncrease, p.isLong);
    const priceImpactForPriceAdjustment = shouldFlipPriceImpact ? priceImpactDeltaUsd * -1n : priceImpactDeltaUsd;
    const acceptablePrice = bigmath_1.bigMath.mulDiv(indexPrice, sizeDeltaUsd + priceImpactForPriceAdjustment, sizeDeltaUsd);
    const priceDelta = (indexPrice - acceptablePrice) * (shouldFlipPriceImpact ? 1n : -1n);
    const acceptablePriceDeltaBps = (0, numbers_1.getBasisPoints)(priceDelta, p.indexPrice);
    return {
        acceptablePrice,
        acceptablePriceDeltaBps,
        priceDelta,
    };
}
exports.getAcceptablePriceByPriceImpact = getAcceptablePriceByPriceImpact;
function getDefaultAcceptablePriceImpactBps(p) {
    const { indexPrice, sizeDeltaUsd, priceImpactDeltaUsd, acceptablePriceImapctBuffer = factors_1.DEFAULT_ACCEPTABLE_PRICE_IMPACT_BUFFER, } = p;
    if (priceImpactDeltaUsd > 0) {
        return BigInt(acceptablePriceImapctBuffer);
    }
    const baseAcceptablePriceValues = getAcceptablePriceByPriceImpact({
        isIncrease: p.isIncrease,
        isLong: p.isLong,
        indexPrice,
        sizeDeltaUsd,
        priceImpactDeltaUsd,
    });
    if (baseAcceptablePriceValues.acceptablePriceDeltaBps < 0) {
        return bigmath_1.bigMath.abs(baseAcceptablePriceValues.acceptablePriceDeltaBps) + BigInt(acceptablePriceImapctBuffer);
    }
    return BigInt(acceptablePriceImapctBuffer);
}
exports.getDefaultAcceptablePriceImpactBps = getDefaultAcceptablePriceImpactBps;

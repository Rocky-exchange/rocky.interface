"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCappedPriceImpactPercentageFromFees = exports.applyImpactFactor = exports.calculateImpactForCrossoverRebalance = exports.calculateImpactForSameSideRebalance = exports.getPriceImpactUsd = exports.getNextPoolAmountsParams = exports.getPriceImpactForSwap = exports.getProportionalPendingImpactValues = exports.getPriceImpactForPosition = exports.getMaxPositionImpactFactors = exports.capPositionImpactUsdByMaxPriceImpactFactor = exports.capPositionImpactUsdByMaxImpactPool = exports.getCappedPositionImpactUsd = exports.applySwapImpactWithCap = exports.getPriceImpactByAcceptablePrice = void 0;
const bigmath_1 = require("../bigmath");
const markets_1 = require("../markets");
const numbers_1 = require("../numbers");
const tokens_1 = require("../tokens");
const tradeHistory_1 = require("../tradeHistory");
function getPriceImpactByAcceptablePrice(p) {
    const { sizeDeltaUsd, acceptablePrice, indexPrice: markPrice, isLong, isIncrease } = p;
    const shouldFlipPriceDiff = isIncrease ? !isLong : isLong;
    const priceDelta = (markPrice - acceptablePrice) * (shouldFlipPriceDiff ? -1n : 1n);
    const acceptablePriceDeltaBps = markPrice === 0n ? 0n : (0, numbers_1.getBasisPoints)(priceDelta, markPrice);
    const priceImpactDeltaUsd = acceptablePrice === 0n ? 0n : (sizeDeltaUsd * priceDelta) / acceptablePrice;
    const priceImpactDeltaAmount = markPrice === 0n ? 0n : priceImpactDeltaUsd / markPrice;
    return {
        priceImpactDeltaUsd,
        priceImpactDeltaAmount,
        priceDelta,
        acceptablePriceDeltaBps,
    };
}
exports.getPriceImpactByAcceptablePrice = getPriceImpactByAcceptablePrice;
function applySwapImpactWithCap(marketInfo, token, priceImpactDeltaUsd) {
    const tokenPoolType = (0, markets_1.getTokenPoolType)(marketInfo, token.address);
    if (!tokenPoolType) {
        throw new Error(`Token ${token.address} is not a collateral of the market ${marketInfo.marketTokenAddress}`);
    }
    const isLongCollateral = tokenPoolType === "long";
    const price = priceImpactDeltaUsd > 0 ? token.prices.maxPrice : token.prices.minPrice;
    let impactDeltaAmount;
    let cappedDiffUsd = 0n;
    if (priceImpactDeltaUsd > 0) {
        // round positive impactAmount down, this will be deducted from the swap impact pool for the user
        impactDeltaAmount = (0, tokens_1.convertToTokenAmount)(priceImpactDeltaUsd, token.decimals, price);
        const maxImpactAmount = isLongCollateral
            ? marketInfo.swapImpactPoolAmountLong
            : marketInfo.swapImpactPoolAmountShort;
        if (impactDeltaAmount > maxImpactAmount) {
            cappedDiffUsd = bigmath_1.bigMath.mulDiv(impactDeltaAmount - maxImpactAmount, price, (0, numbers_1.expandDecimals)(1, token.decimals));
            impactDeltaAmount = maxImpactAmount;
        }
    }
    else {
        // round negative impactAmount up, this will be deducted from the user
        impactDeltaAmount = (0, numbers_1.roundUpMagnitudeDivision)(priceImpactDeltaUsd * (0, numbers_1.expandDecimals)(1, token.decimals), price);
    }
    return { impactDeltaAmount, cappedDiffUsd };
}
exports.applySwapImpactWithCap = applySwapImpactWithCap;
function getCappedPositionImpactUsd(marketInfo, sizeDeltaUsd, isLong, isIncrease, opts = {}) {
    sizeDeltaUsd = isIncrease ? sizeDeltaUsd : sizeDeltaUsd * -1n;
    const { priceImpactDeltaUsd, balanceWasImproved } = getPriceImpactForPosition(marketInfo, sizeDeltaUsd, isLong, opts);
    if (priceImpactDeltaUsd < 0 && !opts.shouldCapNegativeImpact) {
        return { priceImpactDeltaUsd, balanceWasImproved };
    }
    const cappedImpactUsd = capPositionImpactUsdByMaxPriceImpactFactor(marketInfo, sizeDeltaUsd, priceImpactDeltaUsd);
    return {
        priceImpactDeltaUsd: cappedImpactUsd,
        balanceWasImproved,
    };
}
exports.getCappedPositionImpactUsd = getCappedPositionImpactUsd;
function capPositionImpactUsdByMaxImpactPool(marketInfo, positionImpactDeltaUsd) {
    if (positionImpactDeltaUsd < 0) {
        return positionImpactDeltaUsd;
    }
    const { indexToken } = marketInfo;
    const impactPoolAmount = marketInfo.positionImpactPoolAmount;
    const maxPriceImpactUsdBasedOnImpactPool = (0, tokens_1.convertToUsd)(impactPoolAmount, indexToken.decimals, indexToken.prices.minPrice);
    if (positionImpactDeltaUsd > maxPriceImpactUsdBasedOnImpactPool) {
        positionImpactDeltaUsd = maxPriceImpactUsdBasedOnImpactPool;
    }
    return positionImpactDeltaUsd;
}
exports.capPositionImpactUsdByMaxImpactPool = capPositionImpactUsdByMaxImpactPool;
function capPositionImpactUsdByMaxPriceImpactFactor(marketInfo, sizeDeltaUsd, positionImpactDeltaUsd) {
    const { maxPositiveImpactFactor, maxNegativeImpactFactor } = getMaxPositionImpactFactors(marketInfo);
    const maxPriceImapctFactor = positionImpactDeltaUsd > 0 ? maxPositiveImpactFactor : maxNegativeImpactFactor;
    const maxPriceImpactUsdBasedOnMaxPriceImpactFactor = (0, numbers_1.applyFactor)(bigmath_1.bigMath.abs(sizeDeltaUsd), maxPriceImapctFactor);
    if (bigmath_1.bigMath.abs(positionImpactDeltaUsd) > maxPriceImpactUsdBasedOnMaxPriceImpactFactor) {
        positionImpactDeltaUsd = maxPriceImpactUsdBasedOnMaxPriceImpactFactor * (positionImpactDeltaUsd > 0 ? 1n : -1n);
    }
    return positionImpactDeltaUsd;
}
exports.capPositionImpactUsdByMaxPriceImpactFactor = capPositionImpactUsdByMaxPriceImpactFactor;
function getMaxPositionImpactFactors(marketInfo) {
    let maxPositiveImpactFactor = marketInfo.maxPositionImpactFactorPositive;
    const maxNegativeImpactFactor = marketInfo.maxPositionImpactFactorNegative;
    if (maxPositiveImpactFactor > maxNegativeImpactFactor) {
        maxPositiveImpactFactor = maxNegativeImpactFactor;
    }
    return { maxPositiveImpactFactor, maxNegativeImpactFactor };
}
exports.getMaxPositionImpactFactors = getMaxPositionImpactFactors;
function getPriceImpactForPosition(marketInfo, sizeDeltaUsd, isLong, opts = {}) {
    const { longInterestUsd, shortInterestUsd } = marketInfo;
    const { currentLongUsd, currentShortUsd, nextLongUsd, nextShortUsd } = getNextOpenInterestParams({
        currentLongUsd: longInterestUsd,
        currentShortUsd: shortInterestUsd,
        usdDelta: sizeDeltaUsd,
        isLong: isLong,
    });
    const { priceImpactDeltaUsd, balanceWasImproved } = getPriceImpactUsd({
        currentLongUsd,
        currentShortUsd,
        nextLongUsd,
        nextShortUsd,
        factorPositive: marketInfo.positionImpactFactorPositive,
        factorNegative: marketInfo.positionImpactFactorNegative,
        exponentFactor: marketInfo.positionImpactExponentFactor,
        fallbackToZero: opts.fallbackToZero,
    });
    if (priceImpactDeltaUsd > 0) {
        return {
            priceImpactDeltaUsd,
            balanceWasImproved,
        };
    }
    if (bigmath_1.bigMath.abs(marketInfo.virtualInventoryForPositions) <= 0) {
        return {
            priceImpactDeltaUsd,
            balanceWasImproved,
        };
    }
    const virtualInventoryParams = getNextOpenInterestForVirtualInventory({
        virtualInventory: marketInfo.virtualInventoryForPositions,
        usdDelta: sizeDeltaUsd,
        isLong: isLong,
    });
    const { priceImpactDeltaUsd: priceImpactUsdForVirtualInventory } = getPriceImpactUsd({
        currentLongUsd: virtualInventoryParams.currentLongUsd,
        currentShortUsd: virtualInventoryParams.currentShortUsd,
        nextLongUsd: virtualInventoryParams.nextLongUsd,
        nextShortUsd: virtualInventoryParams.nextShortUsd,
        factorPositive: marketInfo.positionImpactFactorPositive,
        factorNegative: marketInfo.positionImpactFactorNegative,
        exponentFactor: marketInfo.positionImpactExponentFactor,
        fallbackToZero: opts.fallbackToZero,
    });
    return {
        priceImpactDeltaUsd: priceImpactUsdForVirtualInventory < priceImpactDeltaUsd
            ? priceImpactUsdForVirtualInventory
            : priceImpactDeltaUsd,
        balanceWasImproved,
    };
}
exports.getPriceImpactForPosition = getPriceImpactForPosition;
function getProportionalPendingImpactValues({ sizeInUsd, pendingImpactAmount, sizeDeltaUsd, indexToken, }) {
    const proportionalPendingImpactDeltaAmount = sizeDeltaUsd !== 0n && sizeInUsd !== 0n
        ? bigmath_1.bigMath.mulDiv(pendingImpactAmount, sizeDeltaUsd, sizeInUsd, pendingImpactAmount < 0n)
        : 0n;
    const proportionalPendingImpactDeltaUsd = (0, tokens_1.convertToUsd)(proportionalPendingImpactDeltaAmount, indexToken.decimals, proportionalPendingImpactDeltaAmount > 0 ? indexToken.prices.minPrice : indexToken.prices.maxPrice);
    return { proportionalPendingImpactDeltaAmount, proportionalPendingImpactDeltaUsd };
}
exports.getProportionalPendingImpactValues = getProportionalPendingImpactValues;
function getPriceImpactForSwap(marketInfo, tokenA, tokenB, usdDeltaTokenA, usdDeltaTokenB, opts = {}) {
    const tokenAPoolType = (0, markets_1.getTokenPoolType)(marketInfo, tokenA.address);
    const tokenBPoolType = (0, markets_1.getTokenPoolType)(marketInfo, tokenB.address);
    if (tokenAPoolType === undefined ||
        tokenBPoolType === undefined ||
        (tokenAPoolType === tokenBPoolType && !marketInfo.isSameCollaterals)) {
        throw new Error(`Invalid tokens to swap ${marketInfo.marketTokenAddress} ${tokenA.address} ${tokenB.address}`);
    }
    const [longToken, shortToken] = tokenAPoolType === "long" ? [tokenA, tokenB] : [tokenB, tokenA];
    const [longDeltaUsd, shortDeltaUsd] = tokenAPoolType === "long" ? [usdDeltaTokenA, usdDeltaTokenB] : [usdDeltaTokenB, usdDeltaTokenA];
    const { longPoolUsd, shortPoolUsd, nextLongPoolUsd, nextShortPoolUsd } = getNextPoolAmountsParams({
        longToken,
        shortToken,
        longPoolAmount: marketInfo.longPoolAmount,
        shortPoolAmount: marketInfo.shortPoolAmount,
        longDeltaUsd,
        shortDeltaUsd,
    });
    const { priceImpactDeltaUsd, balanceWasImproved } = getPriceImpactUsd({
        currentLongUsd: longPoolUsd,
        currentShortUsd: shortPoolUsd,
        nextLongUsd: nextLongPoolUsd,
        nextShortUsd: nextShortPoolUsd,
        factorPositive: marketInfo.swapImpactFactorPositive,
        factorNegative: marketInfo.swapImpactFactorNegative,
        exponentFactor: marketInfo.swapImpactExponentFactor,
        fallbackToZero: opts.fallbackToZero,
    });
    if (priceImpactDeltaUsd > 0) {
        return {
            priceImpactDeltaUsd,
            balanceWasImproved,
        };
    }
    const virtualInventoryLong = marketInfo.virtualPoolAmountForLongToken;
    const virtualInventoryShort = marketInfo.virtualPoolAmountForShortToken;
    if (virtualInventoryLong <= 0 || virtualInventoryShort <= 0) {
        return {
            priceImpactDeltaUsd,
            balanceWasImproved,
        };
    }
    const virtualInventoryParams = getNextPoolAmountsParams({
        longToken,
        shortToken,
        longPoolAmount: virtualInventoryLong,
        shortPoolAmount: virtualInventoryShort,
        longDeltaUsd,
        shortDeltaUsd,
    });
    const { priceImpactDeltaUsd: priceImpactUsdForVirtualInventory } = getPriceImpactUsd({
        currentLongUsd: virtualInventoryParams.longPoolUsd,
        currentShortUsd: virtualInventoryParams.shortPoolUsd,
        nextLongUsd: virtualInventoryParams.nextLongPoolUsd,
        nextShortUsd: virtualInventoryParams.nextShortPoolUsd,
        factorPositive: marketInfo.swapImpactFactorPositive,
        factorNegative: marketInfo.swapImpactFactorNegative,
        exponentFactor: marketInfo.swapImpactExponentFactor,
        fallbackToZero: opts.fallbackToZero,
    });
    return {
        priceImpactDeltaUsd: priceImpactUsdForVirtualInventory < priceImpactDeltaUsd
            ? priceImpactUsdForVirtualInventory
            : priceImpactDeltaUsd,
        balanceWasImproved,
    };
}
exports.getPriceImpactForSwap = getPriceImpactForSwap;
function getNextOpenInterestForVirtualInventory(p) {
    const { virtualInventory, usdDelta, isLong } = p;
    let currentLongUsd = 0n;
    let currentShortUsd = 0n;
    if (virtualInventory > 0n) {
        currentShortUsd = virtualInventory;
    }
    else {
        currentLongUsd = virtualInventory * -1n;
    }
    if (usdDelta < 0n) {
        const offset = bigmath_1.bigMath.abs(usdDelta);
        currentLongUsd = currentLongUsd + offset;
        currentShortUsd = currentShortUsd + offset;
    }
    return getNextOpenInterestParams({
        currentLongUsd,
        currentShortUsd,
        usdDelta,
        isLong,
    });
}
function getNextOpenInterestParams(p) {
    const { currentLongUsd, currentShortUsd, usdDelta, isLong } = p;
    let nextLongUsd = currentLongUsd;
    let nextShortUsd = currentShortUsd;
    if (isLong) {
        nextLongUsd = (currentLongUsd ?? 0n) + (usdDelta ?? 0n);
    }
    else {
        nextShortUsd = (currentShortUsd ?? 0n) + (usdDelta ?? 0n);
    }
    return {
        currentLongUsd,
        currentShortUsd,
        nextLongUsd,
        nextShortUsd,
    };
}
function getNextPoolAmountsParams(p) {
    const { longToken, shortToken, longPoolAmount, shortPoolAmount, longDeltaUsd, shortDeltaUsd } = p;
    const longPrice = (0, tokens_1.getMidPrice)(longToken.prices);
    const shortPrice = (0, tokens_1.getMidPrice)(shortToken.prices);
    const longPoolUsd = (0, tokens_1.convertToUsd)(longPoolAmount, longToken.decimals, longPrice);
    const shortPoolUsd = (0, tokens_1.convertToUsd)(shortPoolAmount, shortToken.decimals, shortPrice);
    const nextLongPoolUsd = longPoolUsd + longDeltaUsd;
    const nextShortPoolUsd = shortPoolUsd + shortDeltaUsd;
    return {
        longPoolUsd,
        shortPoolUsd,
        nextLongPoolUsd,
        nextShortPoolUsd,
    };
}
exports.getNextPoolAmountsParams = getNextPoolAmountsParams;
/**
 * @see https://github.com/gmx-io/gmx-synthetics/blob/updates/contracts/pricing/SwapPricingUtils.sol
 */
function getPriceImpactUsd(p) {
    const { nextLongUsd, nextShortUsd } = p;
    if (nextLongUsd < 0n || nextShortUsd < 0n) {
        if (p.fallbackToZero) {
            return {
                priceImpactDeltaUsd: 0n,
                balanceWasImproved: false,
            };
        }
        else {
            throw new Error("Negative pool amount");
        }
    }
    const currentDiff = bigmath_1.bigMath.abs(p.currentLongUsd - p.currentShortUsd);
    const nextDiff = bigmath_1.bigMath.abs(nextLongUsd - nextShortUsd);
    const isSameSideRebalance = p.currentLongUsd < p.currentShortUsd === nextLongUsd < nextShortUsd;
    let priceImpactDeltaUsd;
    const balanceWasImproved = nextDiff < currentDiff;
    if (isSameSideRebalance) {
        const hasPositiveImpact = nextDiff < currentDiff;
        const factor = hasPositiveImpact ? p.factorPositive : p.factorNegative;
        priceImpactDeltaUsd = calculateImpactForSameSideRebalance({
            currentDiff,
            nextDiff,
            hasPositiveImpact,
            factor,
            exponentFactor: p.exponentFactor,
        });
    }
    else {
        priceImpactDeltaUsd = calculateImpactForCrossoverRebalance({
            currentDiff,
            nextDiff,
            factorPositive: p.factorPositive,
            factorNegative: p.factorNegative,
            exponentFactor: p.exponentFactor,
        });
    }
    return {
        priceImpactDeltaUsd,
        balanceWasImproved,
    };
}
exports.getPriceImpactUsd = getPriceImpactUsd;
/**
 *  @see https://github.com/gmx-io/gmx-synthetics/blob/5fd9991ff2c37ae5f24f03bc9c132730b012ebf2/contracts/pricing/PricingUtils.sol
 */
function calculateImpactForSameSideRebalance(p) {
    const { currentDiff, nextDiff, hasPositiveImpact, factor, exponentFactor } = p;
    const currentImpact = applyImpactFactor(currentDiff, factor, exponentFactor);
    const nextImpact = applyImpactFactor(nextDiff, factor, exponentFactor);
    const deltaDiff = bigmath_1.bigMath.abs(currentImpact - nextImpact);
    return hasPositiveImpact ? deltaDiff : -deltaDiff;
}
exports.calculateImpactForSameSideRebalance = calculateImpactForSameSideRebalance;
/**
 *  @see  https://github.com/gmx-io/gmx-synthetics/blob/5fd9991ff2c37ae5f24f03bc9c132730b012ebf2/contracts/pricing/PricingUtils.sol
 */
function calculateImpactForCrossoverRebalance(p) {
    const { currentDiff, nextDiff, factorNegative, factorPositive, exponentFactor } = p;
    const positiveImpact = applyImpactFactor(currentDiff, factorPositive, exponentFactor);
    const negativeImpactUsd = applyImpactFactor(nextDiff, factorNegative, exponentFactor);
    const deltaDiffUsd = bigmath_1.bigMath.abs(positiveImpact - negativeImpactUsd);
    return positiveImpact > negativeImpactUsd ? deltaDiffUsd : -deltaDiffUsd;
}
exports.calculateImpactForCrossoverRebalance = calculateImpactForCrossoverRebalance;
function applyImpactFactor(diff, factor, exponent) {
    // Convert diff and exponent to float js numbers
    const _diff = Number(diff) / 10 ** 30;
    const _exponent = Number(exponent) / 10 ** 30;
    // Handle edge cases: if diff is 0 or negative, or exponent calculation results in NaN/Infinity
    if (_diff <= 0 || !Number.isFinite(_diff) || !Number.isFinite(_exponent)) {
        return 0n;
    }
    // Pow and convert back to BigInt with 30 decimals
    const powResult = _diff ** _exponent;
    // Check if pow result is valid
    if (!Number.isFinite(powResult) || Number.isNaN(powResult)) {
        return 0n;
    }
    let result = (0, tradeHistory_1.bigNumberify)(BigInt(Math.round(powResult * 10 ** 30)));
    result = (result * factor) / (0, numbers_1.expandDecimals)(1, 30);
    return result;
}
exports.applyImpactFactor = applyImpactFactor;
function getCappedPriceImpactPercentageFromFees({ fees, isSwap, }) {
    if (isSwap) {
        return fees?.swapPriceImpact?.precisePercentage ?? 0n;
    }
    return fees?.positionNetPriceImpact?.precisePercentage ?? 0n;
}
exports.getCappedPriceImpactPercentageFromFees = getCappedPriceImpactPercentageFromFees;

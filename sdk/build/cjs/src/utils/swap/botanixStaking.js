"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBotanixStakingExternalSwapQuote = void 0;
const viem_1 = require("viem");
const StBTC_1 = __importDefault(require("../../abis/StBTC"));
const chains_1 = require("../../configs/chains");
const contracts_1 = require("../../configs/contracts");
const trade_1 = require("../../types/trade");
const bigmath_1 = require("../bigmath");
const numbers_1 = require("../numbers");
const externalSwapPath_1 = require("./externalSwapPath");
const tokens_1 = require("../tokens");
const COEF_REDUCER = (0, numbers_1.getBasisPoints)(1n, 10000n);
const getBotanixStakingExternalSwapQuote = ({ tokenInAddress, tokenOutAddress, amountIn, gasPrice, receiverAddress, tokensData, assetsPerShare, }) => {
    const inTokenData = (0, tokens_1.getTokenData)(tokensData, tokenInAddress);
    const outTokenData = (0, tokens_1.getTokenData)(tokensData, tokenOutAddress);
    const assetsPerShareRate = (0, numbers_1.getBasisPoints)(assetsPerShare, 10n ** 18n) - COEF_REDUCER;
    const sharesPerAssetRate = (0, numbers_1.getBasisPoints)(10n ** 18n, assetsPerShare) - COEF_REDUCER;
    if (!inTokenData || !outTokenData) {
        return undefined;
    }
    if (externalSwapPath_1.AVAILABLE_BOTANIX_DEPOSIT_PAIRS.some((pair) => pair.from === tokenInAddress && pair.to === tokenOutAddress)) {
        const priceIn = (0, tokens_1.getMidPrice)(inTokenData.prices);
        const priceOut = bigmath_1.bigMath.mulDiv(priceIn, sharesPerAssetRate, numbers_1.BASIS_POINTS_DIVISOR_BIGINT);
        const usdIn = (0, tokens_1.convertToUsd)(amountIn, inTokenData.decimals, priceIn);
        const amountOut = amountIn > 0n ? bigmath_1.bigMath.mulDiv(amountIn, sharesPerAssetRate, numbers_1.BASIS_POINTS_DIVISOR_BIGINT) - gasPrice : 0n;
        const usdOut = amountOut > 0n ? (0, tokens_1.convertToUsd)(amountOut, outTokenData.decimals, priceOut) : 0n;
        return {
            aggregator: trade_1.ExternalSwapAggregator.BotanixStaking,
            inTokenAddress: tokenInAddress,
            outTokenAddress: tokenOutAddress,
            receiver: receiverAddress,
            amountIn,
            amountOut,
            usdIn: usdIn,
            usdOut: usdOut,
            priceIn,
            priceOut,
            feesUsd: gasPrice,
            needSpenderApproval: true,
            txnData: {
                to: (0, contracts_1.getContract)(chains_1.BOTANIX, "StBTC"),
                data: (0, viem_1.encodeFunctionData)({
                    abi: StBTC_1.default,
                    functionName: "deposit",
                    args: [amountIn, receiverAddress],
                }),
                value: 0n,
                estimatedGas: gasPrice,
                estimatedExecutionFee: gasPrice,
            },
        };
    }
    if (externalSwapPath_1.AVAILABLE_BOTANIX_WITHDRAW_PAIRS.some((pair) => pair.from === tokenInAddress && pair.to === tokenOutAddress)) {
        const priceIn = (0, tokens_1.getMidPrice)(inTokenData.prices);
        const priceOut = bigmath_1.bigMath.mulDiv(priceIn, assetsPerShareRate, numbers_1.BASIS_POINTS_DIVISOR_BIGINT);
        const usdIn = (0, tokens_1.convertToUsd)(amountIn, inTokenData.decimals, priceIn);
        const amountOut = amountIn > 0n ? bigmath_1.bigMath.mulDiv(amountIn, assetsPerShareRate, numbers_1.BASIS_POINTS_DIVISOR_BIGINT) - gasPrice : 0n;
        const usdOut = amountOut > 0n ? (0, tokens_1.convertToUsd)(amountOut, outTokenData.decimals, priceOut) : 0n;
        return {
            aggregator: trade_1.ExternalSwapAggregator.BotanixStaking,
            inTokenAddress: tokenInAddress,
            outTokenAddress: tokenOutAddress,
            receiver: receiverAddress,
            amountIn,
            amountOut,
            usdIn: usdIn,
            usdOut: usdOut,
            priceIn,
            priceOut,
            feesUsd: gasPrice,
            needSpenderApproval: true,
            txnData: {
                to: (0, contracts_1.getContract)(chains_1.BOTANIX, "StBTC"),
                data: (0, viem_1.encodeFunctionData)({
                    abi: StBTC_1.default,
                    functionName: "withdraw",
                    args: [amountIn, receiverAddress, (0, contracts_1.getContract)(chains_1.BOTANIX, "ExternalHandler")],
                }),
                value: 0n,
                estimatedGas: gasPrice,
                estimatedExecutionFee: gasPrice,
            },
        };
    }
};
exports.getBotanixStakingExternalSwapQuote = getBotanixStakingExternalSwapQuote;

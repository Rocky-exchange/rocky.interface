"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExternalSwapQuoteByPath = void 0;
const trade_1 = require("../../types/trade");
const botanixStaking_1 = require("./botanixStaking");
const getExternalSwapQuoteByPath = ({ amountIn, externalSwapPath, externalSwapQuoteParams, }) => {
    if (amountIn === undefined ||
        externalSwapQuoteParams.gasPrice === undefined ||
        externalSwapQuoteParams.tokensData === undefined ||
        externalSwapQuoteParams.botanixStakingAssetsPerShare === undefined ||
        externalSwapQuoteParams.receiverAddress === undefined) {
        return undefined;
    }
    if (externalSwapPath.aggregator === trade_1.ExternalSwapAggregator.BotanixStaking) {
        return (0, botanixStaking_1.getBotanixStakingExternalSwapQuote)({
            tokenInAddress: externalSwapPath.inTokenAddress,
            tokenOutAddress: externalSwapPath.outTokenAddress,
            amountIn,
            gasPrice: externalSwapQuoteParams.gasPrice,
            receiverAddress: externalSwapQuoteParams.receiverAddress,
            tokensData: externalSwapQuoteParams.tokensData,
            assetsPerShare: externalSwapQuoteParams.botanixStakingAssetsPerShare,
        });
    }
    return undefined;
};
exports.getExternalSwapQuoteByPath = getExternalSwapQuoteByPath;

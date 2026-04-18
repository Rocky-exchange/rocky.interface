"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableExternalSwapPaths = exports.AVAILABLE_BOTANIX_WITHDRAW_PAIRS = exports.AVAILABLE_BOTANIX_DEPOSIT_PAIRS = void 0;
const chains_1 = require("../../configs/chains");
const tokens_1 = require("../../configs/tokens");
const trade_1 = require("../../types/trade");
const BBTC_ADDRESS = tokens_1.NATIVE_TOKEN_ADDRESS;
const PBTC_ADDRESS = (0, tokens_1.getTokenBySymbol)(chains_1.BOTANIX, "PBTC").address;
const STBTC_ADDRESS = (0, tokens_1.getTokenBySymbol)(chains_1.BOTANIX, "STBTC").address;
exports.AVAILABLE_BOTANIX_DEPOSIT_PAIRS = [
    {
        from: BBTC_ADDRESS,
        to: STBTC_ADDRESS,
    },
    {
        from: PBTC_ADDRESS,
        to: STBTC_ADDRESS,
    },
];
exports.AVAILABLE_BOTANIX_WITHDRAW_PAIRS = [
    {
        from: STBTC_ADDRESS,
        to: PBTC_ADDRESS,
    },
];
const getBotanixStakingExternalSwapPaths = ({ fromTokenAddress }) => {
    return [...exports.AVAILABLE_BOTANIX_DEPOSIT_PAIRS, ...exports.AVAILABLE_BOTANIX_WITHDRAW_PAIRS]
        .filter((pair) => pair.from === fromTokenAddress)
        .map((pair) => ({
        aggregator: trade_1.ExternalSwapAggregator.BotanixStaking,
        inTokenAddress: pair.from,
        outTokenAddress: pair.to,
    }));
};
const getAvailableExternalSwapPaths = ({ chainId, fromTokenAddress, }) => {
    if (chainId === chains_1.BOTANIX) {
        return getBotanixStakingExternalSwapPaths({ fromTokenAddress });
    }
    return [];
};
exports.getAvailableExternalSwapPaths = getAvailableExternalSwapPaths;

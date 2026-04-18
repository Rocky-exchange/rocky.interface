import { MarketInfo } from "../types/markets";
import { PositionInfoLoaded } from "../types/positions";
import { UserReferralInfo } from "../types/referrals";
import { Token, TokenData } from "../types/tokens";
export declare function getPositionKey(account: string, marketAddress: string, collateralAddress: string, isLong: boolean): string;
export declare function parsePositionKey(positionKey: string): {
    account: string;
    marketAddress: string;
    collateralAddress: string;
    isLong: boolean;
};
export declare function getEntryPrice(p: {
    sizeInUsd: bigint;
    sizeInTokens: bigint;
    indexToken: Token;
}): bigint | undefined;
export declare function getPositionPnlUsd(p: {
    marketInfo: MarketInfo;
    sizeInUsd: bigint;
    sizeInTokens: bigint;
    markPrice: bigint;
    isLong: boolean;
}): bigint;
export declare function getPositionValueUsd(p: {
    indexToken: Token;
    sizeInTokens: bigint;
    markPrice: bigint;
}): bigint;
export declare function getPositionPendingFeesUsd(p: {
    pendingFundingFeesUsd: bigint;
    pendingBorrowingFeesUsd: bigint;
}): bigint;
export declare function getPositionNetValue(p: {
    totalPendingImpactDeltaUsd: bigint;
    priceImpactDiffUsd: bigint;
    collateralUsd: bigint;
    pendingFundingFeesUsd: bigint;
    pendingBorrowingFeesUsd: bigint;
    pnl: bigint;
    closingFeeUsd: bigint;
    uiFeeUsd: bigint;
}): bigint;
export declare function getPositionPnlAfterFees({ pnl, pendingBorrowingFeesUsd, pendingFundingFeesUsd, closingFeeUsd, uiFeeUsd, totalPendingImpactDeltaUsd, priceImpactDiffUsd, }: {
    pnl: bigint;
    pendingBorrowingFeesUsd: bigint;
    pendingFundingFeesUsd: bigint;
    closingFeeUsd: bigint;
    uiFeeUsd: bigint;
    totalPendingImpactDeltaUsd: bigint;
    priceImpactDiffUsd: bigint;
}): bigint;
export declare function getLeverage(p: {
    sizeInUsd: bigint;
    collateralUsd: bigint;
    pnl: bigint | undefined;
    pendingFundingFeesUsd: bigint;
    pendingBorrowingFeesUsd: bigint;
}): bigint | undefined;
export declare function getLiquidationPrice(p: {
    sizeInUsd: bigint;
    sizeInTokens: bigint;
    collateralAmount: bigint;
    collateralUsd: bigint;
    collateralToken: TokenData;
    marketInfo: MarketInfo;
    pendingFundingFeesUsd: bigint;
    pendingBorrowingFeesUsd: bigint;
    pendingImpactAmount: bigint;
    minCollateralUsd: bigint;
    isLong: boolean;
    useMaxPriceImpact?: boolean;
    userReferralInfo: UserReferralInfo | undefined;
}): bigint | undefined;
export declare function getNetPriceImpactDeltaUsdForDecrease({ marketInfo, sizeInUsd, pendingImpactAmount, priceImpactDeltaUsd, sizeDeltaUsd, }: {
    marketInfo: MarketInfo;
    sizeInUsd: bigint;
    pendingImpactAmount: bigint;
    sizeDeltaUsd: bigint;
    priceImpactDeltaUsd: bigint;
}): {
    totalImpactDeltaUsd: bigint;
    proportionalPendingImpactDeltaUsd: bigint;
    priceImpactDiffUsd: bigint;
};
export declare function getPriceImpactDiffUsd({ totalImpactDeltaUsd, marketInfo, sizeDeltaUsd, }: {
    totalImpactDeltaUsd: bigint;
    marketInfo: MarketInfo;
    sizeDeltaUsd: bigint;
}): bigint;
export declare function getMinCollateralFactorForPosition(position: PositionInfoLoaded, openInterestDelta: bigint): bigint;

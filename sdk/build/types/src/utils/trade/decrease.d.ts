import { MarketInfo } from "../../types/markets";
import { PositionInfo, PositionInfoLoaded } from "../../types/positions";
import { UserReferralInfo } from "../../types/referrals";
import { TokenData } from "../../types/tokens";
import { DecreasePositionAmounts, NextPositionValues } from "../../types/trade";
export declare function getDecreasePositionAmounts(p: {
    marketInfo: MarketInfo;
    collateralToken: TokenData;
    isLong: boolean;
    position: PositionInfoLoaded | undefined;
    closeSizeUsd: bigint;
    keepLeverage: boolean;
    triggerPrice?: bigint;
    fixedAcceptablePriceImpactBps?: bigint;
    acceptablePriceImpactBuffer?: number;
    userReferralInfo: UserReferralInfo | undefined;
    minCollateralUsd: bigint;
    minPositionSizeUsd: bigint;
    uiFeeFactor: bigint;
    isLimit?: boolean;
    limitPrice?: bigint;
    triggerOrderType?: DecreasePositionAmounts["triggerOrderType"];
    isSetAcceptablePriceImpactEnabled: boolean;
    receiveToken?: TokenData;
}): DecreasePositionAmounts;
export declare function getIsFullClose(p: {
    position: PositionInfoLoaded;
    sizeDeltaUsd: bigint;
    indexPrice: bigint;
    remainingCollateralUsd: bigint;
    minCollateralUsd: bigint;
    minPositionSizeUsd: bigint;
}): boolean;
export declare function getMinCollateralUsdForLeverage(position: PositionInfoLoaded, openInterestDelta: bigint): bigint;
export declare function payForCollateralCost(p: {
    initialCostUsd: bigint;
    collateralToken: TokenData;
    collateralPrice: bigint;
    outputAmount: bigint;
    remainingCollateralAmount: bigint;
}): {
    outputAmount: bigint;
    remainingCollateralAmount: bigint;
    paidOutputAmount: bigint;
    paidRemainingCollateralAmount: bigint;
};
export declare function estimateCollateralCost(baseUsd: bigint, collateralToken: TokenData, collateralPrice: bigint): {
    amount: bigint;
    usd: bigint;
};
export declare function getTotalFeesUsdForDecrease({ positionFeeUsd, borrowingFeeUsd, fundingFeeUsd, swapProfitFeeUsd, swapUiFeeUsd, uiFeeUsd, pnlUsd, totalPendingImpactDeltaUsd, }: {
    positionFeeUsd: bigint;
    borrowingFeeUsd: bigint;
    fundingFeeUsd: bigint;
    swapProfitFeeUsd: bigint;
    swapUiFeeUsd: bigint;
    uiFeeUsd: bigint;
    pnlUsd: bigint;
    totalPendingImpactDeltaUsd: bigint;
}): bigint;
export declare function getNextPositionValuesForDecreaseTrade(p: {
    existingPosition?: PositionInfo;
    marketInfo: MarketInfo;
    collateralToken: TokenData;
    sizeDeltaUsd: bigint;
    sizeDeltaInTokens: bigint;
    realizedPnl: bigint;
    estimatedPnl: bigint;
    collateralDeltaUsd: bigint;
    collateralDeltaAmount: bigint;
    payedRemainingCollateralUsd: bigint;
    payedRemainingCollateralAmount: bigint;
    proportionalPendingImpactDeltaUsd: bigint;
    showPnlInLeverage: boolean;
    isLong: boolean;
    minCollateralUsd: bigint;
    userReferralInfo: UserReferralInfo | undefined;
}): NextPositionValues;

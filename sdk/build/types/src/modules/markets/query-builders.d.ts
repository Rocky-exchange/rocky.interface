import { ContractsChainId } from "../../configs/chains";
import { MarketsData } from "../../types/markets";
import { TokensData } from "../../types/tokens";
import type { ContractCallsConfig } from "../../utils/multicall";
export declare function buildClaimableFundingDataRequest({ marketsAddresses, marketsData, chainId, account, }: {
    marketsAddresses: string[] | undefined;
    marketsData: MarketsData | undefined;
    account: string;
    chainId: ContractsChainId;
}): Record<string, ContractCallsConfig<any>>;
export declare function buildMarketsValuesRequest(chainId: number, { marketsAddresses, marketsData, tokensData, dataStoreAddress, syntheticsReaderAddress, }: {
    marketsAddresses: string[] | undefined;
    marketsData: MarketsData | undefined;
    tokensData: TokensData | undefined;
    dataStoreAddress: string;
    syntheticsReaderAddress: string;
}): Promise<import("../../utils/multicall").MulticallRequestConfig<{
    [key: `${string}-reader`]: {
        calls: Record<"marketInfo" | "marketTokenPriceMax" | "marketTokenPriceMin", {
            methodName: string;
            params: any[];
        }>;
    };
    [key: `${string}-dataStore`]: {
        calls: Record<"positionImpactPoolAmount" | "longPoolAmount" | "shortPoolAmount" | "swapImpactPoolAmountLong" | "swapImpactPoolAmountShort" | "longInterestUsingLongToken" | "longInterestUsingShortToken" | "shortInterestUsingLongToken" | "shortInterestUsingShortToken" | "longInterestInTokensUsingLongToken" | "longInterestInTokensUsingShortToken" | "shortInterestInTokensUsingLongToken" | "shortInterestInTokensUsingShortToken", {
            methodName: string;
            params: any[];
        }>;
    };
}>>;
export declare function buildMarketsConfigsRequest(chainId: number, { marketsData, marketsAddresses, dataStoreAddress, }: {
    marketsData: MarketsData | undefined;
    marketsAddresses: string[] | undefined;
    dataStoreAddress: string;
}): Promise<import("../../utils/multicall").MulticallRequestConfig<{
    [key: `${string}-dataStore`]: {
        calls: Record<"maxFundingFactorPerSecond" | "isDisabled" | "maxLongPoolAmount" | "maxShortPoolAmount" | "maxLongPoolUsdForDeposit" | "maxShortPoolUsdForDeposit" | "reserveFactorLong" | "reserveFactorShort" | "openInterestReserveFactorLong" | "openInterestReserveFactorShort" | "maxOpenInterestLong" | "maxOpenInterestShort" | "minPositionImpactPoolAmount" | "positionImpactPoolDistributionRate" | "borrowingFactorLong" | "borrowingFactorShort" | "borrowingExponentFactorLong" | "borrowingExponentFactorShort" | "fundingFactor" | "fundingExponentFactor" | "fundingIncreaseFactorPerSecond" | "fundingDecreaseFactorPerSecond" | "thresholdForStableFunding" | "thresholdForDecreaseFunding" | "minFundingFactorPerSecond" | "maxPnlFactorForTradersLong" | "maxPnlFactorForTradersShort" | "positionFeeFactorForBalanceWasImproved" | "positionFeeFactorForBalanceWasNotImproved" | "positionImpactFactorPositive" | "positionImpactFactorNegative" | "maxPositionImpactFactorPositive" | "maxPositionImpactFactorNegative" | "maxPositionImpactFactorForLiquidations" | "maxLendableImpactFactor" | "maxLendableImpactFactorForWithdrawals" | "maxLendableImpactUsd" | "lentPositionImpactPoolAmount" | "minCollateralFactor" | "minCollateralFactorForLiquidation" | "minCollateralFactorForOpenInterestLong" | "minCollateralFactorForOpenInterestShort" | "positionImpactExponentFactor" | "swapFeeFactorForBalanceWasImproved" | "swapFeeFactorForBalanceWasNotImproved" | "atomicSwapFeeFactor" | "swapImpactFactorPositive" | "swapImpactFactorNegative" | "swapImpactExponentFactor" | "virtualMarketId" | "virtualLongTokenId" | "virtualShortTokenId", {
            methodName: string;
            params: any[];
        }>;
    };
}>>;

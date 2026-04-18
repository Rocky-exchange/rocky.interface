import { useMemo } from "react";

import { useMarkets } from "domain/synthetics/markets/useMarkets";
import { useTokenRecentPricesRequest, useTokensDataRequest } from "domain/synthetics/tokens";
import type { ContractsChainId } from "sdk/configs/chains";
import { getTokensMap } from "sdk/configs/tokens";

import type { TreasuryData } from "./types";
import { getPendleTreasuryAddresses, getTreasuryAddresses, getVenusTreasuryAddresses } from "./treasuryConfig";
import { useTreasuryGlv } from "./useTreasuryGlv";
import { useTreasuryGm } from "./useTreasuryGm";
import { useTreasuryPendle } from "./useTreasuryPendle";
import { useTreasuryTokens } from "./useTreasuryTokens";
import { useTreasuryUniswapV3 } from "./useTreasuryUniswapV3";
import { useTreasuryVenus } from "./useTreasuryVenus";

export type { TreasuryData } from "./types";

const addresses = getTreasuryAddresses();
const venusAddresses = getVenusTreasuryAddresses();
const pendleAddresses = getPendleTreasuryAddresses();

export function useTreasury(chainId: ContractsChainId): TreasuryData {
  const tokenMap = useMemo(() => getTokensMap(chainId), [chainId]);

  const { tokensData } = useTokensDataRequest(chainId);
  const { pricesData } = useTokenRecentPricesRequest(chainId);
  const { marketsData, marketsAddresses } = useMarkets(chainId);

  const tokenResult = useTreasuryTokens({
    chainId,
    addresses,
    tokenMap,
    pricesData,
  });

  const gmResult = useTreasuryGm({
    chainId,
    addresses,
    tokensData,
    marketsData,
    marketsAddresses,
  });

  const glvResult = useTreasuryGlv({
    chainId,
    addresses,
    tokensData,
    marketsData,
  });

  const uniswapV3Result = useTreasuryUniswapV3({
    chainId,
    addresses,
    tokenMap,
    pricesData,
  });

  const venusResult = useTreasuryVenus({
    chainId,
    addresses: venusAddresses,
    tokenMap,
    pricesData,
    tokensData,
    marketsData,
  });

  const pendleResult = useTreasuryPendle({
    chainId,
    addresses: pendleAddresses,
    tokenMap,
    pricesData,
  });

  return useMemo(() => {
    if (!tokenResult || !gmResult || !glvResult || !uniswapV3Result) {
      return undefined;
    }

    const assets = [
      ...tokenResult.assets,
      ...gmResult.assets,
      ...glvResult.assets,
      ...uniswapV3Result.assets,
      ...(venusResult?.assets ?? []),
      ...(pendleResult?.assets ?? []),
    ];

    const totalUsd =
      tokenResult.totalUsd +
      gmResult.totalUsd +
      glvResult.totalUsd +
      uniswapV3Result.totalUsd +
      (venusResult?.totalUsd ?? 0n) +
      (pendleResult?.totalUsd ?? 0n);

    return {
      assets,
      totalUsd,
    };
  }, [glvResult, gmResult, pendleResult, tokenResult, uniswapV3Result, venusResult]);
}

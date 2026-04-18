import { useMemo } from "react";
import useSWRSubscription, { SWRSubscription } from "swr/subscription";
import { Address } from "viem";
import { useAccount } from "wagmi";

import { ContractsChainId, SettlementChainId, SourceChainId, getChainName } from "config/chains";
import { MULTICHAIN_TOKEN_MAPPING } from "config/multichain";
import { ARBITRUM, ARBITRUM_SEPOLIA } from "sdk/configs/chains";
import { isX10000ModeActive } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { fetchMultichainTokenBalances } from "domain/multichain/fetchMultichainTokenBalances";
import type { TokenChainData } from "domain/multichain/types";
import { convertToUsd, getMidPrice, useTokenRecentPricesRequest, useTokensDataRequest } from "domain/synthetics/tokens";
import { TokensData } from "domain/tokens";
import { useChainId } from "lib/chains";
import { FREQUENT_UPDATE_INTERVAL } from "lib/timeConstants";
import { getToken } from "sdk/configs/tokens";

export function useAvailableToTradeAssetSymbolsSettlementChain(): string[] {
  const { chainId, srcChainId } = useChainId();
  const { tokensData } = useTokensDataRequest(chainId, srcChainId);

  return useMemo(() => {
    const tokenSymbols: Record<string, bigint> = {};

    for (const token of Object.values(tokensData ?? {})) {
      const amount = (token.walletBalance ?? 0n) + (token.gmxAccountBalance ?? 0n);
      const usd = convertToUsd(amount, token.decimals, getMidPrice(token.prices))!;

      tokenSymbols[token.symbol] = usd;
    }

    return Object.entries(tokenSymbols)
      .sort((a, b) => (a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1))
      .map(([symbol]) => symbol);
  }, [tokensData]);
}

export function useAvailableToTradeAssetSymbolsMultichain(): string[] {
  const { chainId, srcChainId } = useChainId();
  const { tokensData } = useTokensDataRequest(chainId, srcChainId);

  return useMemo(() => {
    const tokenSymbols: Record<string, bigint> = {};

    for (const token of Object.values(tokensData ?? {})) {
      if (token.gmxAccountBalance !== undefined && token.gmxAccountBalance > 0n) {
        const usd = convertToUsd(token.gmxAccountBalance, token.decimals, getMidPrice(token.prices))!;
        tokenSymbols[token.symbol] = usd;
      }
    }

    return Object.entries(tokenSymbols)
      .sort((a, b) => (a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1))
      .map(([symbol]) => symbol);
  }, [tokensData]);
}

export function useAvailableToTradeAssetSettlementChain(): {
  totalUsd: bigint | undefined;
  apiAccountUsd: bigint | undefined;
  apiTotalAccountUsd: bigint | undefined;
  apiFrozenAccountUsd: bigint | undefined;
  walletUsd: bigint | undefined;

  isGmxAccountLoading: boolean;
  isWalletLoading: boolean;
} {
  const { chainId, srcChainId } = useChainId();
  // In x10000 mode, force srcChainId to be set so that account balances are used
  // This ensures we get balances from /balances API instead of wallet balances
  const effectiveSrcChainId = isX10000ModeActive() ? (srcChainId ?? chainId) : srcChainId;
  const { tokensData, isGmxAccountBalancesLoaded, isWalletBalancesLoaded } = useTokensDataRequest(chainId, effectiveSrcChainId);

  let apiAccountUsd = 0n;

  for (const token of Object.values(tokensData || {})) {
    if (token.gmxAccountBalance === undefined) {
      continue;
    }
    apiAccountUsd += convertToUsd(token.gmxAccountBalance, token.decimals, getMidPrice(token.prices))!;
  }

  let apiTotalAccountUsd = 0n;

  for (const token of Object.values(tokensData || {})) {
    if (token.totalBalance === undefined) {
      continue;
    }
    apiTotalAccountUsd += convertToUsd(token.totalBalance, token.decimals, getMidPrice(token.prices))!;
  }

  let apiFrozenAccountUsd = 0n;

  for (const token of Object.values(tokensData || {})) {
    if (token.frozenBalance === undefined) {
      continue;
    }
    apiFrozenAccountUsd += convertToUsd(token.frozenBalance, token.decimals, getMidPrice(token.prices))!;
  }

  let walletUsd = 0n;

  for (const tokenData of Object.values(tokensData || {})) {
    if (tokenData.walletBalance === undefined) {
      continue;
    }
    walletUsd += convertToUsd(tokenData.walletBalance, tokenData.decimals, getMidPrice(tokenData.prices))!;
  }

  const totalUsd = apiAccountUsd + walletUsd;

  return {
    // Only return undefined if balances are still loading, not if they are zero
    totalUsd: isGmxAccountBalancesLoaded && isWalletBalancesLoaded ? totalUsd : undefined,
    apiAccountUsd: isGmxAccountBalancesLoaded ? apiAccountUsd : undefined,
    apiTotalAccountUsd: isGmxAccountBalancesLoaded ? apiTotalAccountUsd : undefined,
    apiFrozenAccountUsd: isGmxAccountBalancesLoaded ? apiFrozenAccountUsd : undefined,
    walletUsd: isWalletBalancesLoaded ? walletUsd : undefined,

    isGmxAccountLoading: !isGmxAccountBalancesLoaded,
    isWalletLoading: !isWalletBalancesLoaded,
  };
}

function getTotalGmxAccountUsdFromTokensData(tokensData: TokensData) {
  let totalUsd = 0n;
  for (const token of Object.values(tokensData)) {
    if (token.gmxAccountBalance === undefined || token.gmxAccountBalance === 0n) {
      continue;
    }

    totalUsd += convertToUsd(token.gmxAccountBalance, token.decimals, getMidPrice(token.prices))!;
  }
  return totalUsd;
}

export function useAvailableToTradeAssetMultichainRequest(
  chainId: ContractsChainId,
  srcChainId: SourceChainId | undefined
): {
  gmxAccountUsd: bigint | undefined;
} {
  const { tokensData, isGmxAccountBalancesLoaded } = useTokensDataRequest(chainId, srcChainId);

  if (!tokensData || !isGmxAccountBalancesLoaded) {
    return { gmxAccountUsd: undefined };
  }

  const gmxAccountUsd = getTotalGmxAccountUsdFromTokensData(tokensData);

  return { gmxAccountUsd };
}

export function useAvailableToTradeAssetMultichain(): {
  gmxAccountUsd: bigint | undefined;
} {
  const { chainId, srcChainId } = useChainId();
  return useAvailableToTradeAssetMultichainRequest(chainId, srcChainId);
}

const subscribeMultichainTokenBalances: SWRSubscription<
  [name: string, chainId: ContractsChainId, account: Address],
  {
    tokenBalances: Record<number, Record<string, bigint>>;
    isLoading: boolean;
  }
> = (key, options) => {
  const [, settlementChainId, account] = key as [string, SettlementChainId, string];

  let tokenBalances: Record<number, Record<string, bigint>> | undefined;
  let isLoaded = false;
  const interval = window.setInterval(() => {
    fetchMultichainTokenBalances(settlementChainId, account, (chainId, tokensChainData) => {
      tokenBalances = { ...tokenBalances, [chainId]: tokensChainData };
      options.next(null, { tokenBalances, isLoading: isLoaded ? false : true });
    }).then((finalTokenBalances) => {
      if (!isLoaded) {
        isLoaded = true;
        options.next(null, { tokenBalances: finalTokenBalances, isLoading: false });
      }
    });
  }, FREQUENT_UPDATE_INTERVAL);

  return () => {
    window.clearInterval(interval);
  };
};

export function useMultichainTokensRequest(): {
  tokenChainDataArray: TokenChainData[];
  isPriceDataLoading: boolean;
  isBalanceDataLoading: boolean;
} {
  const { chainId } = useChainId();
  const { address: account } = useAccount();

  const { pricesData, isPriceDataLoading } = useTokenRecentPricesRequest(chainId);

  const { data: balanceData } = useSWRSubscription(
    account ? ["multichain-tokens", chainId, account] : null,
    subscribeMultichainTokenBalances
  );
  const tokenBalances = balanceData?.tokenBalances;
  const isBalanceDataLoading = balanceData?.isLoading === undefined ? true : balanceData.isLoading;

  const tokenChainDataArray: TokenChainData[] = useMemo(() => {
    const tokenChainDataArray: TokenChainData[] = [];

    if (!tokenBalances) {
      return tokenChainDataArray;
    }

    for (const sourceChainIdString in tokenBalances) {
      const sourceChainId = parseInt(sourceChainIdString) as SourceChainId;
      const tokensChainBalanceData = tokenBalances[sourceChainId];

      for (const sourceChainTokenAddress in tokensChainBalanceData) {
        let mapping =
          MULTICHAIN_TOKEN_MAPPING[chainId as SettlementChainId]?.[sourceChainId]?.[sourceChainTokenAddress];

        // In x10000 mode, handle same-chain deposits (e.g., ARBITRUM -> ARBITRUM)
        // when mapping is missing due to same-chain being skipped in MULTICHAIN_TOKEN_MAPPING
        if (!mapping && isX10000ModeActive() && (chainId as number) === (sourceChainId as number)) {
          // Try to get token info directly from SDK
          const token = getToken(chainId, sourceChainTokenAddress);
          if (token) {
            // Create a mapping for same-chain deposit
            mapping = {
              settlementChainTokenAddress: token.address,
              sourceChainTokenAddress: token.address,
              sourceChainTokenDecimals: token.decimals,
            };
          }
        }

        if (!mapping) {
          continue;
        }

        const balance = tokensChainBalanceData[sourceChainTokenAddress];

        if (balance === undefined || balance === 0n) {
          continue;
        }

        const settlementChainTokenAddress = mapping.settlementChainTokenAddress;

        const token = getToken(chainId, settlementChainTokenAddress);

        const tokenChainData: TokenChainData = {
          ...token,
          sourceChainId: sourceChainId,
          sourceChainDecimals: mapping.sourceChainTokenDecimals,
          sourceChainPrices: undefined,
          sourceChainBalance: balance,
        };

        if (pricesData && settlementChainTokenAddress in pricesData) {
          tokenChainData.sourceChainPrices = pricesData[settlementChainTokenAddress];
        }

        tokenChainDataArray.push(tokenChainData);
      }
    }

    return tokenChainDataArray;
  }, [tokenBalances, chainId, pricesData]);

  return {
    tokenChainDataArray: tokenChainDataArray,
    isPriceDataLoading,
    isBalanceDataLoading,
  };
}

export function useGmxAccountWithdrawNetworks() {
  const { chainId } = useChainId();

  const sourceChains = Object.keys(MULTICHAIN_TOKEN_MAPPING[chainId] || {}).map(Number);

  const networks = useMemo(() => {
    // Only show ARBITRUM and ARBITRUM_SEPOLIA chains
    const allowedChains = [ARBITRUM, ARBITRUM_SEPOLIA];
    return sourceChains
      .filter((sourceChainId) => allowedChains.includes(sourceChainId))
      .map((sourceChainId) => {
        return {
          id: sourceChainId,
          name: getChainName(sourceChainId),
        };
      });
  }, [sourceChains]);

  return networks;
}

import { zeroAddress } from "viem";

import { SettlementChainId, SourceChainId, getChainName } from "config/chains";
import { MULTICALLS_MAP, MULTICHAIN_TOKEN_MAPPING, TOKEN_GROUPS } from "config/multichain";
import { isX10000ModeActive } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { executeMulticall } from "lib/multicall/executeMulticall";
import type { MulticallRequestConfig } from "lib/multicall/types";
import { getTokenBySymbol } from "sdk/configs/tokens";

export async function fetchMultichainTokenBalances(
  currentSettlementChainId: SettlementChainId,
  account: string,
  progressCallback?: (chainId: number, tokensChainData: Record<string, bigint>) => void
): Promise<Record<number, Record<string, bigint>>> {
  const requests: Promise<{
    chainId: number;
    tokensChainData: Record<string, bigint>;
  }>[] = [];

  const sourceChainTokenIdMap = MULTICHAIN_TOKEN_MAPPING[currentSettlementChainId] || {};

  const result: Record<number, Record<string, bigint>> = {};

  // In x10000 mode, ensure same-chain USDT is included for balance query
  if (isX10000ModeActive()) {
    const usdtToken = getTokenBySymbol(currentSettlementChainId, "USDT");
    if (usdtToken && !sourceChainTokenIdMap[currentSettlementChainId as SourceChainId]) {
      // Add same-chain mapping if it doesn't exist
      sourceChainTokenIdMap[currentSettlementChainId as SourceChainId] = {
        [usdtToken.address]: {
          settlementChainTokenAddress: usdtToken.address,
          sourceChainTokenAddress: usdtToken.address,
          sourceChainTokenDecimals: usdtToken.decimals,
        },
      };
    }
  }

  for (const sourceChainIdString in sourceChainTokenIdMap) {
    const sourceChainId = parseInt(sourceChainIdString) as SourceChainId;
    const tokenAddresses = Object.keys(sourceChainTokenIdMap[sourceChainId] ?? {});

    const requestConfig: MulticallRequestConfig<
      Record<
        string,
        {
          calls: Record<"balanceOf", { methodName: "balanceOf" | "getEthBalance"; params: [string] | [] }>;
        }
      >
    > = {};

    for (const tokenAddress of tokenAddresses) {
      if (tokenAddress === zeroAddress) {
        requestConfig[tokenAddress] = {
          contractAddress: MULTICALLS_MAP[sourceChainId as SourceChainId],
          abiId: "Multicall",
          calls: {
            balanceOf: {
              methodName: "getEthBalance",
              params: [account],
            },
          },
        };
        continue;
      }

      requestConfig[tokenAddress] = {
        contractAddress: tokenAddress,
        abiId: "ERC20",
        calls: {
          balanceOf: {
            methodName: "balanceOf",
            params: [account],
          },
        },
      };
    }

    const request = executeMulticall(
      sourceChainId,
      requestConfig,
      "urgent",
      `fetchMultichainTokens-${getChainName(sourceChainId)}`
    ).then((res) => {
      const tokensChainData: Record<string, bigint> = {};
      for (const tokenAddress of tokenAddresses) {
        if (tokenAddress === zeroAddress) {
          const balance = res.data[tokenAddress].balanceOf.returnValues[0] ?? 0n;
          tokensChainData[tokenAddress] = balance;
          continue;
        }

        const balance = res.data[tokenAddress].balanceOf.returnValues[0] ?? 0n;
        tokensChainData[tokenAddress] = balance;
      }

      result[sourceChainId] = tokensChainData;
      progressCallback?.(sourceChainId, tokensChainData);
      return {
        chainId: sourceChainId,
        tokensChainData,
      };
    });

    requests.push(request);
  }

  await Promise.allSettled(requests);

  return result;
}

import {
  GAS_PRICE_BUFFER_MAP,
  GAS_PRICE_PREMIUM_MAP,
  MAX_FEE_PER_GAS_MAP,
  MAX_PRIORITY_FEE_PER_GAS_MAP,
} from "config/chains";
import { BASIS_POINTS_DIVISOR_BIGINT } from "config/factors";
import { extendError } from "lib/errors";
import { GetFeeDataBlockError } from "lib/metrics";
import { emitMetricCounter } from "lib/metrics/emitMetricEvent";
import { bigMath } from "sdk/utils/bigmath";

export type GasPriceData =
  | {
      gasPrice: bigint;
    }
  // Avalanche
  | {
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    };

type ProviderLike = {
  getFeeData?: () => Promise<{
    gasPrice?: bigint | null;
    maxFeePerGas?: bigint | null;
    maxPriorityFeePerGas?: bigint | null;
  }>;
};

export async function getGasPrice(provider: ProviderLike, chainId: number): Promise<GasPriceData> {
  if (!provider.getFeeData) {
    throw new Error("EVM gas price lookup is disabled in the Canton runtime");
  }

  try {
    let maxFeePerGas = MAX_FEE_PER_GAS_MAP[chainId];
    const premium: bigint = GAS_PRICE_PREMIUM_MAP[chainId] ?? 0n;

    const feeData = await retryGetFeeData(provider);

    const gasPrice = feeData.gasPrice;

    if (maxFeePerGas !== undefined) {
      if (gasPrice !== undefined && gasPrice !== null) {
        maxFeePerGas = bigMath.max(gasPrice, maxFeePerGas);
      }

      // the wallet provider might not return maxPriorityFeePerGas in feeData
      // in which case we should fallback to the usual getGasPrice flow handled below
      if (feeData && feeData.maxPriorityFeePerGas !== undefined && feeData.maxPriorityFeePerGas !== null) {
        const maxPriorityFeePerGas = bigMath.max(
          feeData.maxPriorityFeePerGas,
          MAX_PRIORITY_FEE_PER_GAS_MAP[chainId] ?? 0n
        );

        return {
          maxFeePerGas,
          maxPriorityFeePerGas: maxPriorityFeePerGas + premium,
        };
      }
    }

    if (gasPrice === undefined || gasPrice === null) {
      throw new Error("Can't fetch gas price");
    }

    const bufferBps: bigint = GAS_PRICE_BUFFER_MAP[chainId] ?? 0n;
    const buffer = bigMath.mulDiv(gasPrice, bufferBps, BASIS_POINTS_DIVISOR_BIGINT);

    return {
      gasPrice: gasPrice + buffer + premium,
    };
  } catch (error) {
    throw extendError(error, {
      errorContext: "gasPrice",
    });
  }
}

async function retryGetFeeData(provider: ProviderLike) {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await provider.getFeeData!();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isInvalidBlockError = lastError.message.includes("invalid value for value.hash");

      if (isInvalidBlockError) {
        emitMetricCounter<GetFeeDataBlockError>({ event: "error.getFeeData.value.hash" });
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("Can't fetch gas price");
}

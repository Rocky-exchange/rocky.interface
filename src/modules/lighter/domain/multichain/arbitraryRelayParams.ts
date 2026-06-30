import type { ContractsChainId } from "config/chains";
import type {
  ExpressTransactionBuilder,
  GasPaymentParams,
  GlobalExpressParams,
  RawRelayParamsPayload,
  RelayFeePayload,
} from "domain/synthetics/express";
import type { ExternalCallsPayload } from "sdk/utils/orderTransactions";

export function getRawBaseRelayerParams(_params: {
  chainId: ContractsChainId;
  account: string;
  globalExpressParams: GlobalExpressParams;
}): Partial<{
  rawBaseRelayParamsPayload: RawRelayParamsPayload;
  baseRelayFeeSwapParams: {
    feeParams: RelayFeePayload;
    externalCalls: ExternalCallsPayload;
    feeExternalSwapGasLimit: bigint;
    gasPaymentParams: GasPaymentParams;
  };
}> {
  return {};
}

export async function estimateArbitraryRelayFee(_params: {
  chainId: ContractsChainId;
  provider: unknown;
  rawRelayParamsPayload: RawRelayParamsPayload;
  expressTransactionBuilder: ExpressTransactionBuilder;
  gasPaymentParams: GasPaymentParams;
  subaccount: unknown;
}): Promise<bigint | undefined> {
  return undefined;
}

export function getArbitraryRelayParamsAndPayload(_params: {
  chainId: ContractsChainId;
  account: string;
  isTradingAccount: boolean;
  relayerFeeAmount: bigint;
  globalExpressParams: GlobalExpressParams;
  subaccount: unknown;
}): Partial<{
  relayFeeParams: {
    feeParams: RelayFeePayload;
    externalCalls: ExternalCallsPayload;
    feeExternalSwapGasLimit: bigint;
    gasPaymentParams: GasPaymentParams;
  };
  relayParamsPayload: RawRelayParamsPayload;
}> {
  return {};
}

export function useArbitraryRelayParamsAndPayload(_params: {
  enabled: boolean;
  account: string | undefined;
  isTradingAccount: boolean;
  relayerFeeAmount?: bigint;
  expressTransactionBuilder?: ExpressTransactionBuilder;
}) {
  return {
    data: undefined,
    error: undefined,
    isLoading: false,
  };
}

export function useArbitraryError(error: Error | undefined): Error | undefined {
  return error;
}

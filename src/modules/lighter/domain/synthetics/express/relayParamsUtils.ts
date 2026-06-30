import type { ContractsChainId, SourceChainId } from "config/chains";
import type { SignatureDomain } from "lib/wallets/signing";
import type { ExternalCallsPayload } from "sdk/utils/orderTransactions";

import type { GasPaymentParams, RawRelayParamsPayload, RelayFeePayload, RelayParamsPayload } from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
const EMPTY_EXTERNAL_CALLS = {
  sendTokens: [],
  sendAmounts: [],
  externalCallTargets: [],
  externalCallDataList: [],
  refundTokens: [],
  refundReceivers: [],
} as unknown as ExternalCallsPayload;

export function getExpressContractAddress(
  _chainId: ContractsChainId,
  _opts: {
    isSubaccount?: boolean;
    isMultichain?: boolean;
    scope?: "glv" | "gm" | "transfer" | "claims" | "order" | "subaccount";
  }
): `0x${string}` {
  return ZERO_ADDRESS;
}

export function getRelayRouterDomain(
  chainId: SourceChainId | ContractsChainId,
  relayRouterAddress: string
): SignatureDomain {
  return {
    name: "CantonDisabledRelayRouter",
    version: "1",
    chainId,
    verifyingContract: relayRouterAddress as `0x${string}`,
  };
}

export function getRelayerFeeParams({
  relayerFeeAmount,
  totalRelayerFeeTokenAmount,
  relayerFeeToken,
  gasPaymentToken,
  gasPaymentTokenAsCollateralAmount,
  transactionExternalCalls,
}: {
  chainId: ContractsChainId;
  account: string;
  relayerFeeAmount: bigint;
  totalRelayerFeeTokenAmount: bigint;
  relayerFeeToken: { address: string };
  gasPaymentToken: { address: string };
  gasPaymentTokenAsCollateralAmount: bigint;
  findFeeSwapPath: unknown;
  feeExternalSwapQuote: unknown;
  transactionExternalCalls: ExternalCallsPayload | undefined;
}):
  | {
      feeParams: RelayFeePayload;
      externalCalls: ExternalCallsPayload;
      feeExternalSwapGasLimit: bigint;
      gasPaymentParams: GasPaymentParams;
    }
  | undefined {
  return {
    feeParams: {
      feeToken: relayerFeeToken.address,
      feeAmount: totalRelayerFeeTokenAmount,
      feeSwapPath: [],
    },
    externalCalls: transactionExternalCalls ?? EMPTY_EXTERNAL_CALLS,
    feeExternalSwapGasLimit: 0n,
    gasPaymentParams: {
      gasPaymentToken: gasPaymentToken as GasPaymentParams["gasPaymentToken"],
      relayFeeToken: relayerFeeToken as GasPaymentParams["relayFeeToken"],
      gasPaymentTokenAddress: gasPaymentToken.address,
      relayerFeeTokenAddress: relayerFeeToken.address,
      relayerFeeAmount,
      totalRelayerFeeTokenAmount,
      gasPaymentTokenAmount: totalRelayerFeeTokenAmount,
      gasPaymentTokenAsCollateralAmount,
    },
  };
}

export function getRawRelayerParams({
  chainId,
  feeParams,
  externalCalls,
  tokenPermits,
}: {
  chainId: ContractsChainId;
  gasPaymentTokenAddress: string;
  relayerFeeTokenAddress: string;
  feeParams: RelayFeePayload;
  externalCalls: ExternalCallsPayload;
  tokenPermits: RawRelayParamsPayload["tokenPermits"];
  marketsInfoData: unknown;
}): RawRelayParamsPayload {
  return {
    oracleParams: {
      tokens: [],
      providers: [],
      data: [],
    },
    tokenPermits,
    externalCalls,
    fee: feeParams,
    desChainId: BigInt(chainId),
    userNonce: BigInt(Math.floor(Date.now() / 1000)),
  };
}

export function hashRelayParams(_relayParams: RelayParamsPayload) {
  return ZERO_HASH;
}

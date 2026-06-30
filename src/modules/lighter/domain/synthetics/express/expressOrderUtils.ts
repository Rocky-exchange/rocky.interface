import type { AnyChainId, ContractsChainId, SourceChainId } from "sdk/configs/chains";

import type {
  ExpressTxnParams,
  GasPaymentValidations,
  GlobalExpressParams,
  RawRelayParamsPayload,
  RelayParamsPayload,
} from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function disabledError() {
  return new Error("Express/Gelato orders are disabled in the Canton runtime");
}

export async function estimateBatchExpressParams(_params: {
  chainId: ContractsChainId;
  isTradingAccount: boolean;
  signer: unknown;
  provider: unknown;
  batchParams: unknown;
  globalExpressParams: GlobalExpressParams | undefined;
  estimationMethod?: unknown;
  requireValidations: boolean;
  subaccount?: unknown;
}): Promise<ExpressTxnParams | undefined> {
  return undefined;
}

export async function estimateExpressParams(_params: any): Promise<ExpressTxnParams | undefined> {
  return undefined;
}

export function getIsValidExpressParams({
  gasPaymentValidations,
  isSponsoredCall,
}: {
  chainId: ContractsChainId;
  gasPaymentValidations: GasPaymentValidations;
  isSponsoredCall: boolean;
}) {
  return Boolean(isSponsoredCall) || gasPaymentValidations.isValid;
}

export function getGasPaymentValidations(_params: any): GasPaymentValidations {
  return {
    isOutGasTokenBalance: false,
    needGasPaymentTokenApproval: false,
    isValid: false,
  };
}

export async function buildAndSignExpressBatchOrderTxn(_params: {
  chainId: ContractsChainId;
  relayParamsPayload: RawRelayParamsPayload;
  signer: unknown;
  batchParams: unknown;
  subaccount?: unknown;
  relayerFeeTokenAddress: string;
  relayerFeeAmount: bigint;
  isTradingAccount: boolean;
}) {
  throw disabledError();
}

export async function getBatchSignatureParams(_params: {
  chainId: ContractsChainId;
  signer: unknown;
  batchParams: unknown;
  relayParams: RelayParamsPayload | RelayParamsPayload;
  subaccount?: unknown;
  isTradingAccount: boolean;
}) {
  throw disabledError();
}

export async function getMultichainInfoFromSigner(
  _signer: unknown,
  _chainId: ContractsChainId
): Promise<SourceChainId | undefined> {
  return undefined;
}

export function getOrderRelayRouterAddress(
  _chainId: ContractsChainId,
  _isSubaccount: boolean,
  _isMultichain: boolean
) {
  return ZERO_ADDRESS;
}

export async function buildAndSignBridgeOutTxn(_params: {
  signer: unknown;
  chainId: ContractsChainId;
  relayParamsPayload: RawRelayParamsPayload;
  bridgeOutParams: unknown;
  relayerFeeTokenAddress: string;
  relayerFeeAmount: bigint;
}) {
  throw disabledError();
}

export async function buildAndSignSetTraderReferralCodeTxn(_params: {
  signer: unknown;
  chainId: ContractsChainId;
  relayParamsPayload: RelayParamsPayload;
  referralCode: string;
  relayerFeeTokenAddress: string;
  relayerFeeAmount: bigint;
}) {
  throw disabledError();
}

export async function signSetTraderReferralCode(_params: {
  signer: unknown;
  chainId: ContractsChainId;
  relayParams: RelayParamsPayload;
  referralCode: string;
  srcChainId?: SourceChainId;
}) {
  throw disabledError();
}

export async function validateSignature(_params: {
  signatureParams: unknown;
  signer: unknown;
  chainId: AnyChainId;
}) {
  return {
    isValid: false,
    recoveredAddress: undefined,
    error: disabledError(),
  };
}

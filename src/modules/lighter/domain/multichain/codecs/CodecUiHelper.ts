import type { RelayParamsPayload } from "domain/synthetics/express";
import type { ContractsChainId, SettlementChainId } from "sdk/configs/chains";

export enum MultichainActionType {
  None = 0,
  Deposit = 1,
  GlvDeposit = 2,
  BridgeOut = 3,
  SetTraderReferralCode = 4,
}

type CommonActionData = {
  relayParams: RelayParamsPayload;
  signature: string;
};

type SetTraderReferralCodeActionData = CommonActionData & {
  referralCode: string;
};

type SetTraderReferralCodeAction = {
  actionType: MultichainActionType.SetTraderReferralCode;
  actionData: SetTraderReferralCodeActionData;
};

export type MultichainAction = SetTraderReferralCodeAction;

export class CodecUiHelper {
  public static encodeDepositMessage(_account: string, _data?: string): string {
    return "0x";
  }

  public static encodeComposeMsg(_composeFromAddress: string, _msg: string) {
    return "0x";
  }

  public static composeDepositMessage(_dstChainId: SettlementChainId, _account: string, _data?: string) {
    return "0x";
  }

  public static getLzEndpoint(_chainId: ContractsChainId): `0x${string}` {
    return "0x0000000000000000000000000000000000000000";
  }

  public static encodeMultichainActionData(_action: MultichainAction): string {
    return "0x";
  }
}

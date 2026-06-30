import type { AnyChainId } from "config/chains";

import type { MultichainAction } from "./codecs/CodecUiHelper";

export type MultichainSendParams = {
  dstEid: number;
  to: string;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: string;
  composeMsg: string;
  oftCmd: string;
};

export function getMultichainTransferSendParams({
  amountLD,
}: {
  dstChainId: AnyChainId;
  account: string;
  srcChainId?: AnyChainId;
  amountLD: bigint;
  composeGas?: bigint;
  isDeposit: boolean;
  action?: MultichainAction;
}): MultichainSendParams {
  return {
    dstEid: 0,
    to: "0x",
    amountLD,
    minAmountLD: 0n,
    extraOptions: "0x",
    composeMsg: "0x",
    oftCmd: "0x",
  };
}

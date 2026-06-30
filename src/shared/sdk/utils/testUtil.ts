import { createTestClient, http, publicActions, walletActions } from "sdk/utils/evmCompat";

import { ARBITRUM, getViemChain } from "sdk/configs/chains";
import { TradingSdkConfig } from "sdk/types/sdk";

import { TradingSdk } from "../index";

const client = createTestClient({
  chain: getViemChain(ARBITRUM),
  mode: "hardhat",
  transport: http(),
})
  .extend(publicActions)
  .extend(walletActions);

export const disabledSdkConfig: TradingSdkConfig = {
  chainId: ARBITRUM,
  account: "0x9f7198eb1b9Ccc0Eb7A07eD228d8FbC12963ea33",
  oracleUrl: "https://oracle.test.primit.io",
  rpcUrl: "",
  walletClient: client,
  subsquidUrl: "https://subsquid.test.primit.io/api/graphql",
};

export const disabledSdk = new TradingSdk(disabledSdkConfig);

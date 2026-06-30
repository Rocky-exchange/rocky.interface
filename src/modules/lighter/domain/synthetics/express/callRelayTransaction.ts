import type { ContractsChainId } from "config/chains";

export async function callRelayTransaction(_params: {
  chainId: ContractsChainId;
  calldata: string;
  gelatoRelayFeeToken: string;
  gelatoRelayFeeAmount: bigint;
  provider: unknown;
  relayRouterAddress: string;
}) {
  throw new Error("EVM relay transactions are disabled in the Canton runtime");
}

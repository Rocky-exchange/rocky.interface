import type { ContractsChainId } from "sdk/configs/chains";

type Params = {
  account: string;
  rewardsParams: {
    marketAddresses: string[];
    tokenAddresses: string[];
  };
  setPendingTxns: (txns: any) => void;
};

export async function claimAffiliateRewardsTxn(_chainId: ContractsChainId, _signer: unknown, _p: Params) {
  throw new Error("EVM affiliate reward claims are disabled in the Canton runtime");
}

import { ContractName, getContract } from "sdk/configs/contracts";

import { ContractsChainId } from "./chains";

type ContractRunner = unknown;
type Address = `0x${string}`;

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export { getContract } from "sdk/configs/contracts";

export const XGMT_EXCLUDED_ACCOUNTS = [
  "0x330eef6b9b1ea6edd620c825c9919dc8b611d5d5",
  "0xd9b1c23411adbb984b1c4be515fafc47a12898b2",
  "0xa633158288520807f91ccc98aa58e0ea43acb400",
  "0xffd0a93b4362052a336a7b22494f1b77018dd34b",
];

function makeDisabledContract(name: ContractName) {
  return (chainId: ContractsChainId, _provider?: ContractRunner) => {
    const address = getContract(chainId, name);

    return {
      address,
      target: address,
      runner: undefined,
      interface: undefined,
    } as any;
  };
}

export const getDataStoreContract = makeDisabledContract("DataStore");
export const getMulticallContract = makeDisabledContract("Multicall");
export const getExchangeRouterContract = makeDisabledContract("ExchangeRouter");
export const getGlvRouterContract = makeDisabledContract("GlvRouter");

export const getZeroAddressContract = (_provider?: ContractRunner) => ({
  address: ZERO_ADDRESS,
  target: ZERO_ADDRESS,
  runner: undefined,
  interface: undefined,
}) as any;

export function tryGetContract(chainId: ContractsChainId, name: ContractName): Address | undefined {
  try {
    return getContract(chainId, name);
  } catch (e) {
    return undefined;
  }
}

import DataStoreAbi from "sdk/abis/DataStore";
import ExchangeRouterAbi from "sdk/abis/ExchangeRouter";
import MulticallAbi from "sdk/abis/Multicall";
import GlvRouterAbi from "sdk/abis/GlvRouter";

function createFactory<T>(abi: unknown) {
  return {
    abi,
    connect: (_address: string, _runner?: unknown): T => {
      throw new Error("EVM typechain contract factories are disabled in the Canton runtime");
    },
  };
}

export const DataStore__factory = createFactory(DataStoreAbi);
export const ExchangeRouter__factory = createFactory(ExchangeRouterAbi);
export const Multicall3__factory = createFactory(MulticallAbi);
export const GlvRouter__factory = createFactory(GlvRouterAbi);

export type DisabledSubaccountRelayRouter = {
  connect?: (...args: unknown[]) => unknown;
  subaccountApprovalNonces: (address: string) => Promise<bigint>;
};

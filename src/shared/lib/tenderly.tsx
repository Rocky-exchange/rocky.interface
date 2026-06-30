type TenderlyConfig = {
  accountSlug: string;
  projectSlug: string;
  accessKey: string;
  enabled: boolean;
};

export type TenderlyGasPriceData =
  | {
      gasPrice: bigint;
    }
  | {
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
    };

export async function simulateCallDataWithTenderly(_params: {
  chainId: number;
  tenderlyConfig: TenderlyConfig;
  provider: unknown;
  to: string;
  data: string;
  from: string;
  value: bigint | number | undefined;
  blockNumber: number | undefined;
  gasPriceData: TenderlyGasPriceData | undefined;
  gasLimit: bigint | number | undefined;
  comment: string | undefined;
}) {
  throw new Error("Tenderly simulations are disabled in the Canton runtime");
}

export const simulateTxWithTenderly = async (
  _chainId: number,
  _contract: unknown,
  _account: string,
  _method: string,
  _params: unknown,
  _opts: {
    gasLimit?: bigint;
    value?: bigint;
    comment: string;
  }
) => {
  throw new Error("Tenderly simulations are disabled in the Canton runtime");
};

export const tenderlyLsKeys = {
  accountSlug: "tenderlyAccountSlug",
  projectSlug: "tenderlyProjectSlug",
  accessKey: "tenderlyAccessKey",
  enabled: "tenderlySimulationEnabled",
};

export function getTenderlyAccountParams() {
  return {
    accountSlug: JSON.parse(localStorage.getItem(JSON.stringify(tenderlyLsKeys.accountSlug)) ?? '""'),
    projectSlug: JSON.parse(localStorage.getItem(JSON.stringify(tenderlyLsKeys.projectSlug)) ?? '""'),
  };
}

export const getTenderlyConfig = (): TenderlyConfig | null => null;

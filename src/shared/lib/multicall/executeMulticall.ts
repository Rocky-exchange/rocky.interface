import type { MulticallRequestConfig, MulticallResult } from "./types";

/**
 * Canton runtime compatibility shim for dormant EVM SDK helpers.
 */
export async function executeMulticall<TConfig extends MulticallRequestConfig<any>>(
  chainId: number,
  request: TConfig,
  priority: "urgent" | "background" = "urgent",
  name?: string,
  disableBatching?: boolean
): Promise<MulticallResult<TConfig>> {
  void chainId;
  void request;
  void priority;
  void name;
  void disableBatching;

  return {
    success: true,
    errors: {},
    data: {},
  } as MulticallResult<TConfig>;
}

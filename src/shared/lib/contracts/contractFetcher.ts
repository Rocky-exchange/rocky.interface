import type { AbiId } from "sdk/abis";

/**
 * @deprecated On-chain contract fetching is disabled in the Canton runtime.
 */
export const contractFetcher =
  <T>(_signer: unknown, _abiId: AbiId, _additionalArgs?: unknown[]) =>
  async (_args: unknown): Promise<T | undefined> => {
    return undefined;
  };

import type { SettlementChainId } from "config/chains";

export async function fetchMultichainTokenBalances(
  _currentSettlementChainId: SettlementChainId,
  _account: string,
  _progressCallback?: (chainId: number, tokensChainData: Record<string, bigint>) => void
): Promise<Record<number, Record<string, bigint>>> {
  return {};
}

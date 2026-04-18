import { useChainId } from "lib/chains";

import { useAvailableToTradeAssetSettlementChain } from "components/GmxAccountModal/hooks";

export function useGmxAccountShowDepositButton() {
  const { srcChainId } = useChainId();
  const { apiAccountUsd, isGmxAccountLoading } = useAvailableToTradeAssetSettlementChain();
  const shouldShowDepositButton = !isGmxAccountLoading && apiAccountUsd === 0n && srcChainId !== undefined;

  return { shouldShowDepositButton };
}

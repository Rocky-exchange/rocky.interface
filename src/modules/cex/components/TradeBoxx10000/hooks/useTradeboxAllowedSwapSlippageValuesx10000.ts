import { useEffect } from "react";

import { DEFAULT_ALLOWED_SWAP_SLIPPAGE_BPS } from "config/factors";
import {
  selectTradeboxDefaultAllowedSwapSlippageBps,
  selectTradeboxSelectedAllowedSwapSlippageBps,
  selectTradeboxSetDefaultAllowedSwapSlippageBps,
  selectTradeboxSetSelectedAllowedSwapSlippageBps,
  selectTradeboxTotalSwapImpactBps,
  selectTradeboxTradeFlags,
} from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { bigMath } from "sdk/utils/bigmath";

import { useTradeboxChangesx10000 as useTradeboxChanges } from "./useTradeboxChangesx10000";

export function useTradeboxAllowedSwapSlippageValuesx10000() {
  const defaultAllowedSwapSlippageBps = useSelector(selectTradeboxDefaultAllowedSwapSlippageBps);
  const selectedAllowedSwapSlippageBps = useSelector(selectTradeboxSelectedAllowedSwapSlippageBps);
  const swapImpactBps = useSelector(selectTradeboxTotalSwapImpactBps);

  const tradeFlags = useSelector(selectTradeboxTradeFlags);

  const { isLimit } = tradeFlags;

  const setDefaultAllowedSwapSlippageBps = useSelector(selectTradeboxSetDefaultAllowedSwapSlippageBps);
  const setSelectedAllowedSwapSlippageBps = useSelector(selectTradeboxSetSelectedAllowedSwapSlippageBps);

  const tradeboxChanges = useTradeboxChanges();

  useEffect(() => {
    if (
      tradeboxChanges.fromTokenAddress ||
      tradeboxChanges.toTokenAddress ||
      tradeboxChanges.isLimit ||
      tradeboxChanges.market
    ) {
      setDefaultAllowedSwapSlippageBps(undefined);
      setSelectedAllowedSwapSlippageBps(undefined);
    }
  }, [
    setDefaultAllowedSwapSlippageBps,
    setSelectedAllowedSwapSlippageBps,
    tradeboxChanges.fromTokenAddress,
    tradeboxChanges.isLimit,
    tradeboxChanges.market,
    tradeboxChanges.toTokenAddress,
  ]);

  /**
   * Set initial value
   */
  useEffect(() => {
    if (isLimit && defaultAllowedSwapSlippageBps === undefined && selectedAllowedSwapSlippageBps === undefined) {
      const totalSwapImpactBps = swapImpactBps >= 0n ? 0n : bigMath.abs(swapImpactBps);
      let defaultSwapImpactBuffer = DEFAULT_ALLOWED_SWAP_SLIPPAGE_BPS + totalSwapImpactBps;

      setSelectedAllowedSwapSlippageBps(bigMath.abs(defaultSwapImpactBuffer));
      setDefaultAllowedSwapSlippageBps(bigMath.abs(defaultSwapImpactBuffer));
    }
  }, [
    defaultAllowedSwapSlippageBps,
    isLimit,
    swapImpactBps,
    selectedAllowedSwapSlippageBps,
    setDefaultAllowedSwapSlippageBps,
    setSelectedAllowedSwapSlippageBps,
  ]);
}

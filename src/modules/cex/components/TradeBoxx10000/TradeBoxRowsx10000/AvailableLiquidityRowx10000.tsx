import { t } from "@lingui/macro";

import {
  selectTradeboxIncreasePositionAmounts,
  selectTradeboxSwapAmounts,
  selectTradeboxToToken,
  selectTradeboxTradeFlags,
} from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000";
import { selectTradeboxLiquidityInfo } from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000/selectTradeboxLiquidityInfo";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { formatTokenAmount, formatUsd } from "lib/numbers";

import { SyntheticsInfoRow } from "components/SyntheticsInfoRow";
import Tooltip from "components/Tooltip/Tooltip";

export function AvailableLiquidityRowx10000() {
  const tradeFlags = useSelector(selectTradeboxTradeFlags);
  const swapAmounts = useSelector(selectTradeboxSwapAmounts);
  const increaseAmounts = useSelector(selectTradeboxIncreasePositionAmounts);
  const toToken = useSelector(selectTradeboxToToken);
  const { isLimit, isSwap, isIncrease, isTwap } = tradeFlags;

  const { isLiquidityRisk, availableLiquidityUsd, availableLiquidityAmount } = useSelector(selectTradeboxLiquidityInfo);

  if (!isLimit && !isTwap) {
    return null;
  }

  let tooltipContent = "";

  if (isSwap && swapAmounts) {
    tooltipContent = isLiquidityRisk
      ? t`There may not be sufficient liquidity to execute your order when the min. receive is met.`
      : t`The order will be executed if there is sufficient liquidity and the execution price guarantees that you will receive the minimum receive amount.`;
  }

  if (isIncrease && increaseAmounts) {
    tooltipContent = isLiquidityRisk
      ? t`There may not be sufficient liquidity to execute your order when the price conditions are met.`
      : t`The order will only execute if the price conditions are met and there is sufficient liquidity.`;
  }

  return (
    <SyntheticsInfoRow label={t`Available Liquidity`}>
      <Tooltip
        position="bottom-end"
        handleClassName={isLiquidityRisk ? "negative numbers" : "numbers"}
        handle={
          isSwap
            ? formatTokenAmount(availableLiquidityAmount, toToken?.decimals, toToken?.symbol, {
                isStable: toToken?.isStable,
              })
            : formatUsd(availableLiquidityUsd)
        }
        renderContent={() => tooltipContent}
      />
    </SyntheticsInfoRow>
  );
}

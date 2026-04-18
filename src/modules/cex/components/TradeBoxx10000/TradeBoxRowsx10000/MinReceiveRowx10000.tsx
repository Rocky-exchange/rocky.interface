import { Trans } from "@lingui/macro";

import {
  selectTradeboxSwapAmounts,
  selectTradeboxToToken,
  selectTradeboxTradeFlags,
} from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { applySlippageToMinOut } from "domain/synthetics/trade";
import { formatBalanceAmount } from "lib/numbers";

import { SyntheticsInfoRow } from "components/SyntheticsInfoRow";

export function MinReceiveRowx10000({ allowedSlippage }: { allowedSlippage: number }) {
  const { isMarket, isSwap } = useSelector(selectTradeboxTradeFlags);
  const swapAmounts = useSelector(selectTradeboxSwapAmounts);

  const toToken = useSelector(selectTradeboxToToken);

  if (!isSwap || swapAmounts?.minOutputAmount === undefined || !toToken) {
    return null;
  }

  return (
    <SyntheticsInfoRow label={<Trans>Min. Receive</Trans>} valueClassName="numbers">
      {isMarket
        ? formatBalanceAmount(
            applySlippageToMinOut(allowedSlippage, swapAmounts.minOutputAmount),
            toToken.decimals,
            toToken.symbol,
            { isStable: toToken.isStable }
          )
        : formatBalanceAmount(swapAmounts.minOutputAmount, toToken.decimals, toToken.symbol, {
            isStable: toToken.isStable,
          })}
    </SyntheticsInfoRow>
  );
}

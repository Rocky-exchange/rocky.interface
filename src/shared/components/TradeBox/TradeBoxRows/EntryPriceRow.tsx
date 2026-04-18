import { t } from "@lingui/macro";

import {
  selectTradeboxMarkPrice,
  selectTradeboxNextPositionValues,
  selectTradeboxSelectedPosition,
  selectTradeboxToToken,
} from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { formatUsd } from "lib/numbers";

import { SyntheticsInfoRow } from "components/SyntheticsInfoRow";
import { ValueTransition } from "components/ValueTransition/ValueTransition";

export function EntryPriceRow() {
  const selectedPosition = useSelector(selectTradeboxSelectedPosition);
  const nextPositionValues = useSelector(selectTradeboxNextPositionValues);
  const markPrice = useSelector(selectTradeboxMarkPrice);
  const toToken = useSelector(selectTradeboxToToken);

  if (!selectedPosition) {
    return null;
  }

  return (
    <SyntheticsInfoRow
      label={t`Entry Price`}
      value={
        nextPositionValues?.nextEntryPrice || selectedPosition?.entryPrice ? (
          <ValueTransition
            from={formatUsd(selectedPosition?.entryPrice, {
              displayDecimals: 5,
              visualMultiplier: toToken?.visualMultiplier,
            })}
            to={formatUsd(nextPositionValues?.nextEntryPrice, {
              displayDecimals: 5,
              visualMultiplier: toToken?.visualMultiplier,
            })}
          />
        ) : (
          formatUsd(markPrice, {
            displayDecimals: 5,
            visualMultiplier: toToken?.visualMultiplier,
          })
        )
      }
      valueClassName="numbers"
    />
  );
}

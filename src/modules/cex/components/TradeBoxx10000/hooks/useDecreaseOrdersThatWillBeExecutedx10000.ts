import { useMemo } from "react";

import { makeSelectOrdersByPositionKey } from "context/SyntheticsStateContext/selectors/orderSelectors";
import {
  selectTradeboxMarkPrice,
  selectTradeboxSelectedPosition,
  selectTradeboxSelectedPositionKey,
} from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { isTriggerDecreaseOrderType, isTwapOrder } from "domain/synthetics/orders";
import { TriggerThresholdType } from "domain/synthetics/trade";
import { EMPTY_ARRAY } from "lib/objects";

export function useDecreaseOrdersThatWillBeExecutedx10000() {
  const markPrice = useSelector(selectTradeboxMarkPrice);
  const existingPosition = useSelector(selectTradeboxSelectedPosition);
  const positionKey = useSelector(selectTradeboxSelectedPositionKey);
  const positionOrders = useSelector(makeSelectOrdersByPositionKey(positionKey));

  const existingTriggerOrders = useMemo(
    () => positionOrders.filter((order) => isTriggerDecreaseOrderType(order.orderType) && !isTwapOrder(order)),
    [positionOrders]
  );

  return useMemo(() => {
    if (!existingPosition || markPrice === undefined) {
      return EMPTY_ARRAY;
    }

    return existingTriggerOrders.filter((order) => {
      return order.triggerThresholdType === TriggerThresholdType.Above
        ? markPrice > order.triggerPrice
        : markPrice < order.triggerPrice;
    });
  }, [existingPosition, existingTriggerOrders, markPrice]);
}

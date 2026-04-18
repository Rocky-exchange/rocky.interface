import { useCallback, useMemo } from "react";
import { useHistory } from "react-router-dom";

import { selectTradeboxState } from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { TradeType } from "domain/synthetics/trade";
import { useLocalizedMap } from "lib/i18n";

import Tabs from "components/Tabs/Tabs";

import { tradeTypeClassNamesx10000, tradeTypeLabelsx10000 } from "./tradeboxConstantsx10000";

// Filter out Swap tab for x10000 route - only show Long and Short
const OPTIONS = Object.values(TradeType).filter((type) => type !== TradeType.Swap);

export function TradeBoxHeaderTabsx10000({ isInCurtain }: { isInCurtain?: boolean }) {
  const localizedTradeTypeLabels = useLocalizedMap(tradeTypeLabelsx10000);
  const history = useHistory();
  const { setTradeType: onSelectTradeType, tradeType } = useSelector(selectTradeboxState);

  const onTradeTypeChange = useCallback(
    (type: TradeType) => {
      onSelectTradeType(type);
      if (tradeType !== type) {
        history.push(`/trade/${type.toLowerCase()}`);
      }
    },
    [history, onSelectTradeType, tradeType]
  );

  const tabsOptions = useMemo(() => {
    // Filter out Swap tab for x10000 route - only show Long and Short
    return Object.values(TradeType)
      .filter((type) => type !== TradeType.Swap)
      .map((type) => ({
        value: type,
        label: localizedTradeTypeLabels[type],
        className: tradeTypeClassNamesx10000[type],
      }));
  }, [localizedTradeTypeLabels]);

    return (
      <Tabs
        options={tabsOptions}
        selectedValue={tradeType}
        onChange={onTradeTypeChange}
        qa="trade-direction"
        size="l"
        regularOptionClassname={isInCurtain ? "grow !rounded-t-0" : "grow"}
        className="bg-slate-900"
        useUnifiedStyle
      />
    );
}

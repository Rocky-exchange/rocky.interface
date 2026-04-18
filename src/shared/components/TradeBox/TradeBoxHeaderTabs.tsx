import { useCallback, useMemo } from "react";
import { useHistory } from "react-router-dom";

import { selectTradeboxState } from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { TradeType } from "domain/synthetics/trade";
import { useLocalizedMap } from "lib/i18n";

import Tabs from "components/Tabs/Tabs";

import { tradeTypeClassNames, tradeTypeLabels } from "./tradeboxConstants";

export function TradeBoxHeaderTabs({ isInCurtain }: { isInCurtain?: boolean }) {
  const localizedTradeTypeLabels = useLocalizedMap(tradeTypeLabels);
  const history = useHistory();
  const { setTradeType: onSelectTradeType, tradeType } = useSelector(selectTradeboxState);

  const onTradeTypeChange = useCallback(
    (type: TradeType) => {
      onSelectTradeType(type);
      // Trade route disabled: keep state update but don't navigate to /trade.
      // If/when /trade is re-enabled, restore navigation here.
    },
    [history, onSelectTradeType, tradeType]
  );

  const tabsOptions = useMemo(() => {
    return Object.values(TradeType).map((type) => ({
      value: type,
      label: localizedTradeTypeLabels[type],
      className: tradeTypeClassNames[type],
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

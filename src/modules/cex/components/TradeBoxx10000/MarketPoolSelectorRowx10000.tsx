import { t } from "@lingui/macro";

import { selectMarketsInfoData } from "context/SyntheticsStateContext/selectors/globalSelectors";
import {
  selectTradeboxRelatedMarketsStats,
  selectTradeboxState,
  selectTradeboxTradeType,
} from "@/modules/cex/context/SyntheticsStateContext/selectors/tradeboxSelectorsx10000";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { getMarketPoolName } from "domain/synthetics/markets";
import { getByKey } from "lib/objects";

import { SyntheticsInfoRow } from "components/SyntheticsInfoRow";

import { PoolSelector2 } from "components/PoolSelector2/PoolSelector2";
import { TradeboxPoolWarnings } from "components/TradeboxPoolWarnings/TradeboxPoolWarnings";

export function MarketPoolSelectorRowx10000() {
  const { relatedMarketStats, relatedMarketsPositionStats } = useSelector(selectTradeboxRelatedMarketsStats);
  const { marketAddress, setMarketAddress } = useSelector(selectTradeboxState);
  const tradeType = useSelector(selectTradeboxTradeType);
  const marketsInfoData = useSelector(selectMarketsInfoData);

  const selectedMarket = marketAddress ? getByKey(marketsInfoData, marketAddress) : undefined;
  const poolName = selectedMarket ? getMarketPoolName(selectedMarket) : undefined;

  return (
    <>
      <SyntheticsInfoRow
        label={t`Pool`}
        value={
          <>
            <PoolSelector2
              selectedPoolName={poolName}
              options={relatedMarketStats}
              tradeType={tradeType}
              positionStats={relatedMarketsPositionStats}
              onSelect={setMarketAddress}
            />
          </>
        }
      />

      <TradeboxPoolWarnings />
    </>
  );
}

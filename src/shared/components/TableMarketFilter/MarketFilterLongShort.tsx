import { t } from "@lingui/macro";
import values from "lodash/values";
import { useCallback, useMemo } from "react";
import type { Address } from "viem";

import { useMarketsInfoData } from "context/SyntheticsStateContext/hooks/globalsHooks";
import {
  selectChainId,
  selectOrdersInfoData,
  selectSrcChainId,
} from "context/SyntheticsStateContext/selectors/globalSelectors";
import { selectPositionsInfoDataSortedByMarket } from "context/SyntheticsStateContext/selectors/positionsSelectors";
import { createSelector, useSelector } from "context/SyntheticsStateContext/utils";
import { useMarketTokensData } from "domain/synthetics/markets/useMarketTokensData";
import { getMarketIndexName, getGlvOrMarketAddress, getMarketPoolName } from "domain/synthetics/markets/utils";
import { isOrderForPosition } from "domain/synthetics/orders";
import useSortedPoolsWithIndexToken from "domain/synthetics/trade/useSortedPoolsWithIndexToken";
import { mustNeverExist } from "lib/types";
import { getNormalizedTokenSymbol, getToken } from "sdk/configs/tokens";
import { shouldUseApiOrders } from "@/modules/cex/lib/api";
import { useX10000MarketsWithTickers } from "@/modules/cex/lib/api/custom/useX10000Markets";

import { MarketWithDirectionLabel } from "components/MarketWithDirectionLabel/MarketWithDirectionLabel";
import { TableOptionsFilter } from "components/TableOptionsFilter/TableOptionsFilter";
import type { Group, Item } from "components/TableOptionsFilter/types";
import TokenIcon from "components/TokenIcon/TokenIcon";

export type MarketFilterLongShortDirection = "long" | "short" | "any";
export type MarketFilterLongShortItemData = {
  marketAddress: Address | "any";
  direction: MarketFilterLongShortDirection;
  collateralAddress?: Address;
};

export type MarketFilterLongShortProps = {
  value: MarketFilterLongShortItemData[];
  onChange: (value: MarketFilterLongShortItemData[]) => void;
  withPositions?: "all" | "withOrders";
  asButton?: boolean;
};

const selectPositionsWithOrders = createSelector((q) => {
  const positions = q(selectPositionsInfoDataSortedByMarket);
  const ordersInfoData = q(selectOrdersInfoData);

  const orders = values(ordersInfoData);

  return positions.filter((position) => {
    return orders.some((order) => isOrderForPosition(order, position.key));
  });
});

export function MarketFilterLongShort({ value, onChange, withPositions, asButton }: MarketFilterLongShortProps) {
  const chainId = useSelector(selectChainId);
  const srcChainId = useSelector(selectSrcChainId);
  const marketsInfoData = useMarketsInfoData();
  const allPositions = useSelector(selectPositionsInfoDataSortedByMarket);
  const filteredPositions = useSelector(selectPositionsWithOrders);
  const { marketTokensData: depositMarketTokensData } = useMarketTokensData(chainId, srcChainId, {
    isDeposit: true,
    withGlv: false,
  });
  const { marketsInfo: allMarkets } = useSortedPoolsWithIndexToken(marketsInfoData, depositMarketTokensData);

  // X10000 mode: Use API markets to match Header
  const isX10000Mode = shouldUseApiOrders();
  const { markets: x10000Markets } = useX10000MarketsWithTickers(chainId);

  const marketsOptions = useMemo<Group<MarketFilterLongShortItemData>[]>(() => {
    let strippedOpenPositions: Item<MarketFilterLongShortItemData>[] | undefined = undefined;
    if (withPositions !== undefined) {
      const positions = withPositions === "all" ? allPositions : filteredPositions;
      strippedOpenPositions = positions.map((position) => ({
        text: (position.isLong ? "long" : "short") + " " + position.market.name + " " + position.collateralToken.symbol,
        data: {
          marketAddress: position.market.marketTokenAddress as Address,
          direction: position.isLong ? "long" : "short",
          collateralAddress: position.collateralTokenAddress as Address,
        },
      }));
    }

    // In x10000 mode, use API markets to match Header
    // Use synthetic address format to match order's marketAddress (x10000-BTC-USD)
    let strippedMarkets: Item<MarketFilterLongShortItemData>[];
    if (isX10000Mode && x10000Markets && x10000Markets.length > 0) {
      strippedMarkets = x10000Markets
        .map((market) => {
          // Extract base asset and create synthetic market address
          // This must match the format used in orderAdapter.ts getSyntheticMarketAddress()
          const baseAsset = market.base_asset?.toUpperCase() ||
            market.symbol.toUpperCase().replace(/USDT$/, "").replace(/-USD$/, "");
          const syntheticMarketAddress = `x10000-${baseAsset}-USD`;

          return {
            text: "any " + market.symbol,
            data: {
              marketAddress: syntheticMarketAddress as Address,
              direction: "any" as MarketFilterLongShortDirection,
            },
          };
        });
    } else {
      // Non-x10000 mode: use existing logic
      strippedMarkets = allMarkets.map((market) => {
        return {
          text: "any " + market.name,
          data: {
            marketAddress: getGlvOrMarketAddress(market) as Address,
            direction: "any",
          },
        };
      });
    }

    const anyMarketDirectedGroup: Group<MarketFilterLongShortItemData> = {
      groupName: t`Direction`,
      items: [
        {
          text: t`Longs`,
          data: {
            marketAddress: "any",
            direction: "long",
          },
        },
        {
          text: t`Shorts`,
          data: {
            marketAddress: "any",
            direction: "short",
          },
        },
      ],
    };

    if (withPositions) {
      return [
        {
          groupName: withPositions === "all" ? t`Open positions` : t`Open positions with orders`,
          items: strippedOpenPositions!,
        },
        anyMarketDirectedGroup,
        {
          groupName: t`Markets`,
          items: strippedMarkets,
        },
      ];
    }

    return [
      anyMarketDirectedGroup,
      {
        groupName: t`Markets`,
        items: strippedMarkets,
      },
    ];
  }, [allMarkets, allPositions, filteredPositions, withPositions, isX10000Mode, x10000Markets, chainId]);

  const ItemComponent = useCallback(
    (props: { item: MarketFilterLongShortItemData }) => {
      if (props.item.marketAddress === "any") {
        if (props.item.direction === "long") {
          return t`Longs`;
        } else if (props.item.direction === "short") {
          return t`Shorts`;
        } else if (props.item.direction === "swap") {
          return t`Swaps`;
        }
        mustNeverExist(props.item.direction as never);
      }

      // In x10000 mode, try to get market info from x10000Markets first
      if (isX10000Mode && x10000Markets && x10000Markets.length > 0) {
        // Extract base asset from synthetic address (x10000-BTC-USD -> BTC)
        const syntheticMatch = props.item.marketAddress.match(/^x10000-([A-Z]+)-USD$/i);
        const baseAssetFromAddress = syntheticMatch ? syntheticMatch[1].toUpperCase() : null;

        // Find market by base asset
        const x10000Market = baseAssetFromAddress
          ? x10000Markets.find((m) => {
              const marketBase = m.base_asset?.toUpperCase() ||
                m.symbol.toUpperCase().replace(/USDT$/, "").replace(/-USD$/, "");
              return marketBase === baseAssetFromAddress;
            })
          : undefined;

        if (x10000Market) {
          // Display X10000Market info (matching Header format)
          // Format: "BTC/USD [BTC-USDC]" (same as X10000MarketRow)
          const baseAsset = x10000Market.base_asset || x10000Market.symbol.replace(/[-/]?USD[T]?$/i, "");
          const quoteAsset = x10000Market.quote_asset || "USD";
          const displaySymbol = `${baseAsset}/${quoteAsset}`;
          const poolName = `[${baseAsset}-${quoteAsset}]`;

          let longOrShortText = "";
          if (props.item.direction === "long") {
            longOrShortText = t`Long`;
          } else if (props.item.direction === "short") {
            longOrShortText = t`Short`;
          }

          if (props.item.direction === "long" || props.item.direction === "short") {
            return (
              <>
                <MarketWithDirectionLabel
                  isLong={props.item.direction === "long"}
                  indexName={displaySymbol}
                  tokenSymbol={baseAsset}
                />
                <div className="inline-flex items-center">
                  <span className="subtext">{poolName}</span>
                </div>
              </>
            );
          }

          return (
            <>
              <TokenIcon symbol={baseAsset} displaySize={16} className="mr-5" />
              <div className="inline-flex items-center">
                {longOrShortText && <span className="mr-3">{longOrShortText}</span>}
                <span>{displaySymbol}</span>
                <span className="subtext">{poolName}</span>
              </div>
            </>
          );
        }
      }

      // Fallback to existing logic for non-x10000 mode or if market not found
      if (!marketsInfoData) {
        return <></>;
      }

      let longOrShortText = "";
      if (props.item.direction === "long") {
        longOrShortText = t`Long`;
      } else if (props.item.direction === "short") {
        longOrShortText = t`Short`;
      }

      const market = marketsInfoData[props.item.marketAddress];
      if (!market) {
        return <></>;
      }

      const indexName = getMarketIndexName(market);
      const poolName = getMarketPoolName(market);

      const iconName = market?.isSpotOnly
        ? getNormalizedTokenSymbol(market.longToken.symbol) + getNormalizedTokenSymbol(market.shortToken.symbol)
        : market.indexToken.symbol;

      const collateralToken = props.item.collateralAddress
        ? getToken(chainId, props.item.collateralAddress)
        : undefined;
      const collateralSymbol = collateralToken?.symbol;

      if (props.item.direction === "long" || props.item.direction === "short") {
        return (
          <>
            <MarketWithDirectionLabel
              isLong={props.item.direction === "long"}
              indexName={indexName}
              tokenSymbol={iconName}
            />
            <div className="inline-flex items-center">
              <span className="subtext">[{poolName}]</span>
            </div>
            {collateralSymbol && <span className="text-typography-secondary"> ({collateralSymbol})</span>}
          </>
        );
      }

      return (
        <>
          <TokenIcon symbol={iconName} displaySize={16} className="mr-5" />
          <div className="inline-flex items-center">
            {longOrShortText && <span className="mr-3">{longOrShortText}</span>}
            <span>{indexName}</span>
            <span className="subtext">[{poolName}]</span>
          </div>
        </>
      );
    },
    [chainId, marketsInfoData, isX10000Mode, x10000Markets]
  );

  return (
    <TableOptionsFilter<MarketFilterLongShortItemData>
      multiple
      label={t`Trading Pair`}
      placeholder={t`Search Trading Pair`}
      onChange={onChange}
      options={marketsOptions}
      ItemComponent={ItemComponent}
      value={value}
      asButton={asButton}
      popupPlacement="bottom-start"
    />
  );
}

import { Trans, t } from "@lingui/macro";
import cx from "classnames";
import partition from "lodash/partition";
import React, { useCallback, useMemo, useState } from "react";
import type { Address } from "viem";

import { USD_DECIMALS } from "config/factors";
import type { SortDirection } from "context/SorterContext/types";
import { selectChainId, selectTokensData } from "context/SyntheticsStateContext/selectors/globalSelectors";
import { selectIndexTokenStatsMap } from "context/SyntheticsStateContext/selectors/statsSelectors";
import {
  TokenOption,
  selectTradeboxChooseSuitableMarket,
  selectTradeboxGetMaxLongShortLiquidityPool,
  selectTradeboxMarketInfo,
  selectTradeboxTradeFlags,
  selectTradeboxTradeType,
} from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import {
  TokenFavoritesTabOption,
  useTokensFavorites,
} from "context/TokensFavoritesContext/TokensFavoritesContextProvider";
import { PreferredTradeTypePickStrategy } from "domain/synthetics/markets/chooseSuitableMarket";
import { getMarketBaseName, getMarketPoolName } from "domain/synthetics/markets/utils";
import { IndexTokensStats } from "domain/synthetics/stats/marketsInfoDataToIndexTokensStats";
import { PriceDelta, PriceDeltaMap, TokenData, TokensData } from "domain/synthetics/tokens";
import { TradeType } from "domain/synthetics/trade";
import { MissedCoinsPlace } from "domain/synthetics/userFeedback";
import { useMissedCoinsSearch } from "domain/synthetics/userFeedback/useMissedCoinsSearch";
import { stripBlacklistedWords, type Token } from "domain/tokens";
import { getMidPrice } from "domain/tokens/utils";
import { expandDecimals, formatAmountHuman, formatUsdPrice } from "lib/numbers";
import { EMPTY_ARRAY } from "lib/objects";
import { searchBy } from "lib/searchBy";
import { useBreakpoints } from "lib/useBreakpoints";
import { useChainId } from "lib/chains";
import {
  convertTokenAddress,
  getCategoryTokenAddresses,
  getTokenVisualMultiplier,
  isChartAvailableForToken,
  getTokenBySymbol,
} from "sdk/configs/tokens";

import Button from "components/Button/Button";
import { EmptyTableContent } from "components/EmptyTableContent/EmptyTableContent";
import FavoriteStar from "components/FavoriteStar/FavoriteStar";
import { FavoriteTabs } from "components/FavoriteTabs/FavoriteTabs";
import SearchInput from "components/SearchInput/SearchInput";
import { Sorter, useSorterHandlers } from "components/Sorter/Sorter";
import { ButtonRowScrollFadeContainer } from "components/TableScrollFade/TableScrollFade";
import TokenIcon from "components/TokenIcon/TokenIcon";

import ChevronDownIcon from "img/ic_chevron_down.svg?react";
import LongIcon from "img/long.svg?react";
import ShortIcon from "img/short.svg?react";

import { SelectorBase, SelectorBaseMobileHeaderContent, useSelectorClose } from "../SelectorBase/SelectorBase";
import { X10000MarketsDropdown } from "../X10000MarketsList";
import { useX10000State, isX10000ModeActive } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { useX10000SelectedMarket } from "@/modules/cex/lib/api/custom/useX10000Markets";
import { getMarkets } from "@/modules/cex/lib/api/client";
import useSWR from "swr";
import type { Market } from "@/modules/cex/lib/api/types";

type Props = {
  selectedToken: Token | undefined;
  oneRowLabels?: boolean;
};

export default function ChartTokenSelector(props: Props) {
  const { selectedToken, oneRowLabels } = props;

  const marketInfo = useSelector(selectTradeboxMarketInfo);
  const { isSwap } = useSelector(selectTradeboxTradeFlags);
  const poolName = marketInfo && !isSwap ? getMarketPoolName(marketInfo) : null;

  const { isMobile } = useBreakpoints();

  // Check if we're in 10000x mode
  const isX10000Mode = isX10000ModeActive();
  const { selectedSymbol, setSelectedSymbol } = useX10000State();
  const { chainId } = useChainId();
  const x10000Market = useX10000SelectedMarket(isX10000Mode ? chainId : undefined, isX10000Mode ? selectedSymbol : null);

  const x10000BaseSymbol = useMemo(() => {
    if (!isX10000Mode) return "BTC";
    return x10000Market?.base_asset || selectedSymbol?.replace(/[-/]?USD[T]?$/i, "") || "BTC";
  }, [isX10000Mode, x10000Market, selectedSymbol]);

  const x10000PoolName = `${x10000BaseSymbol}-USDT`;

  return (
    <SelectorBase
      popoverPlacement="bottom-start"
      handleClassName={cx({
        "mr-24": oneRowLabels === false,
        "py-0 md:h-40": isSwap,
      })}
      desktopPanelClassName={cx("max-w-[100vw] shadow-md", { "w-[520px]": isSwap, "w-[880px]": !isSwap })}
      chevronClassName="hidden"
      // Enable dropdown in X10000 mode so user can switch between BTC/ETH/SOL
      disabled={false}
      label={
        <Button variant="secondary">
          {isX10000Mode ? (
            <span
              className={cx("inline-flex gap-12 whitespace-nowrap pl-0 text-[13px]", {
                "items-start": !oneRowLabels,
                "items-center": oneRowLabels,
              })}
            >
              <div className="flex items-center gap-8">
                <TokenIcon symbol={x10000BaseSymbol} displaySize={isMobile ? 32 : 20} />
                <div className="flex gap-2 md:items-center md:gap-8">
                  <span
                    className={cx("flex justify-start leading-base", {
                      "flex-col items-baseline gap-2": !oneRowLabels,
                      "flex-row items-center": oneRowLabels,
                    })}
                  >
                    <span className="text-start text-[13px] font-medium text-typography-primary">
                      {x10000BaseSymbol}/USD
                    </span>
                    <span
                      className={cx("text-12 font-normal text-typography-secondary", {
                        "ml-4": oneRowLabels,
                      })}
                    >
                      <span>[{x10000PoolName}]</span>
                    </span>
                  </span>

                  <ChevronDownIcon className="inline-block size-16" />
                </div>
              </div>
            </span>
          ) : selectedToken ? (
            // Regular mode label - shows token from Synthetics state
            <span
              className={cx("inline-flex gap-12 whitespace-nowrap pl-0 text-[13px]", {
                "items-start": !oneRowLabels,
                "items-center": oneRowLabels,
              })}
            >
              {isSwap && oneRowLabels ? (
                <div className="rounded-4 bg-blue-300 bg-opacity-[20%] px-7 py-4 text-blue-300">
                  <Trans>Swap</Trans>
                </div>
              ) : null}

              <div className="flex items-center gap-8">
                <TokenIcon symbol={selectedToken.symbol} displaySize={isMobile ? 32 : 20} />
                <div className="flex gap-2 md:items-center md:gap-8">
                  <span
                    className={cx("flex justify-start leading-base", {
                      "flex-col items-baseline gap-2": !oneRowLabels,
                      "flex-row items-center": oneRowLabels,
                    })}
                  >
                    <span className="text-start text-[13px] font-medium text-typography-primary">
                      {!isSwap && <>{getTokenVisualMultiplier(selectedToken)}</>}
                      {selectedToken.symbol}/USD
                    </span>
                    {poolName && (
                      <span
                        className={cx("text-12 font-normal text-typography-secondary", {
                          "ml-4": oneRowLabels,
                        })}
                      >
                        <span>[{poolName}]</span>
                      </span>
                    )}

                    {isSwap && !oneRowLabels ? (
                      <div className="text-blue-300">
                        <Trans>Swap</Trans>
                      </div>
                    ) : null}
                  </span>

                  <ChevronDownIcon className="inline-block size-16" />
                </div>
              </div>
            </span>
          ) : null}
        </Button>
      }
      modalLabel={t`Market`}
      mobileModalContentPadding={false}
    >
      {isX10000Mode ? <X10000MarketsDropdown onMarketSelect={setSelectedSymbol} /> : <MarketsList />}
    </SelectorBase>
  );
}

type SortField =
  | "lastPrice"
  | "24hChange"
  | "24hVolume"
  | "longLiquidity"
  | "shortLiquidity"
  | "combinedAvailableLiquidity"
  | "combinedOpenInterest"
  | "unspecified";

function MarketsList() {
  const chainId = useSelector(selectChainId);
  const tradeType = useSelector(selectTradeboxTradeType);
  const chooseSuitableMarket = useSelector(selectTradeboxChooseSuitableMarket);
  const tokensData = useSelector(selectTokensData);

  // Fetch markets from API
  const { data: marketsData } = useSWR<{ markets: Market[]; total: number }>(
    chainId ? [`api-markets`, chainId] : null,
    () => getMarkets(chainId)
  );

  // Convert API markets to Token format
  const { availableChartTokens: options } = useMemo(() => {
    if (!marketsData?.markets || !chainId) {
      return {
        availableChartTokens: undefined,
      };
    }

    const tokens: Token[] = [];

    for (const market of marketsData.markets) {
      try {
        // Extract base asset symbol (e.g., "BTC" from "BTCUSDT")
        const baseSymbol = market.base_asset;

        // Try to get token by symbol
        try {
          const token = getTokenBySymbol(chainId, baseSymbol);
          if (token && isChartAvailableForToken(chainId, token.symbol)) {
            tokens.push(token);
          }
        } catch (_err) {
          // If token not found, create a synthetic token from market data
          const syntheticToken: Token = {
            name: `${baseSymbol} Perpetual`,
            symbol: baseSymbol,
            address: `0x${baseSymbol.toLowerCase().padEnd(40, "0")}`, // Generate a synthetic address
            decimals: 18,
            isSynthetic: true,
          };
          tokens.push(syntheticToken);
        }
      } catch (err) {
        // Skip invalid markets
        // eslint-disable-next-line no-console
        if (err instanceof Error) {
          // eslint-disable-next-line no-console
          console.warn(`Failed to process market ${market.symbol}:`, err);
        }
      }
    }

    return {
      availableChartTokens: tokens,
    };
  }, [marketsData, chainId]);

  const { tab, favoriteTokens, toggleFavoriteToken } = useTokensFavorites("chart-token-selector");

  // Create a map from market symbol to market data for quick lookup
  const marketsMap = useMemo(() => {
    if (!marketsData?.markets) return new Map<string, Market>();
    return new Map(marketsData.markets.map((m) => [m.base_asset, m]));
  }, [marketsData]);

  // Create PriceDelta map from API data
  const dayPriceDeltaMap = useMemo<PriceDeltaMap>(() => {
    if (!marketsData?.markets || !options) return {};

    const deltaMap: PriceDeltaMap = {};
    for (const token of options) {
      const market = marketsMap.get(token.symbol);
      if (market) {
        const priceChangePercent = Number.parseFloat(market.price_change_percent_24h) || 0;
        const lastPrice = Number.parseFloat(market.last_price) || 0;
        const priceChange = Number.parseFloat(market.price_change_24h) || 0;
        const high24h = Number.parseFloat(market.high_24h) || 0;
        const low24h = Number.parseFloat(market.low_24h) || 0;

        // Calculate open price from last_price and price_change
        const openPrice = lastPrice - priceChange;

        deltaMap[token.address] = {
          close: lastPrice,
          open: openPrice,
          high: high24h,
          low: low24h,
          deltaPrice: priceChange,
          deltaPercentage: priceChangePercent,
          deltaPercentageStr: priceChangePercent > 0
            ? `+${priceChangePercent.toFixed(2)}%`
            : `${priceChangePercent.toFixed(2)}%`,
          tokenSymbol: token.symbol,
        };
      }
    }
    return deltaMap;
  }, [marketsData, options, marketsMap]);

  // Create volume map from API data
  const dayVolumes = useMemo<Record<Address, bigint>>(() => {
    if (!marketsData?.markets || !options) return {};

    const volumeMap: Record<Address, bigint> = {};
    for (const token of options) {
      const market = marketsMap.get(token.symbol);
      if (market) {
        const volume24hUsd = Number.parseFloat(market.volume_24h_usd) || 0;
        // Convert to bigint with USD_DECIMALS (30)
        // expandDecimals only works with integers, so we need to convert float to integer first
        const volumeInteger = Math.floor(volume24hUsd * 1e18); // Preserve 18 decimal places
        volumeMap[token.address] = expandDecimals(volumeInteger, USD_DECIMALS - 18);
      }
    }
    return volumeMap;
  }, [marketsData, options, marketsMap]);

  // Create token data map from API prices
  const apiTokensData = useMemo(() => {
    if (!marketsData?.markets || !options) return {};

    const data: Record<Address, TokenData> = {};
    for (const token of options) {
      const market = marketsMap.get(token.symbol);
      if (market) {
        const lastPrice = Number.parseFloat(market.last_price) || 0;
        // Convert price to bigint with USD_DECIMALS (30)
        // expandDecimals only works with integers, so we need to convert float to integer first
        const priceInteger = Math.floor(lastPrice * 1e18); // Preserve 18 decimal places
        const priceBigInt = expandDecimals(priceInteger, USD_DECIMALS - 18);

        data[token.address] = {
          ...token,
          prices: {
            minPrice: priceBigInt,
            maxPrice: priceBigInt,
          },
          balance: 0n,
          totalSupply: 0n,
        } as TokenData;
      }
    }
    return data;
  }, [marketsData, options, marketsMap]);

  const indexTokenStatsMap = useSelector(selectIndexTokenStatsMap).indexMap;

  const { isMobile, isSmallMobile } = useBreakpoints();

  const close = useSelectorClose();

  const { isSwap } = useSelector(selectTradeboxTradeFlags);
  const { orderBy, direction, getSorterProps } = useSorterHandlers<SortField>(
    `chart-token-selector-${isSwap ? "spot" : "perp"}`
  );

  const [searchKeyword, setSearchKeyword] = useState("");

  const sortedTokens = useFilterSortTokens({
    chainId,
    options,
    searchKeyword,
    tab,
    favoriteTokens,
    direction,
    orderBy,
    tokensData,
    dayPriceDeltaMap,
    dayVolumes,
    indexTokenStatsMap,
    isSwap,
  });

  const sortedDetails = useMemo(() => {
    if (!sortedTokens) {
      return EMPTY_ARRAY;
    }

    return sortedTokens.map((token) => {
      const wrappedAddress = convertTokenAddress(chainId, token.address, "wrapped");
      // Use API data if available, otherwise fall back to existing data
      const tokenData = apiTokensData[token.address] || tokensData?.[wrappedAddress];
      const dayPriceDelta = dayPriceDeltaMap?.[token.address] || dayPriceDeltaMap?.[wrappedAddress];
      const dayVolume = dayVolumes?.[token.address] || dayVolumes?.[wrappedAddress];

      return {
        token,
        tokenData,
        dayPriceDelta,
        dayVolume,
        openInterestLong: indexTokenStatsMap?.[wrappedAddress]?.totalOpenInterestLong,
        openInterestShort: indexTokenStatsMap?.[wrappedAddress]?.totalOpenInterestShort,
        maxLeverage: indexTokenStatsMap?.[wrappedAddress]?.maxUiAllowedLeverage,
      };
    });
  }, [sortedTokens, chainId, tokensData, apiTokensData, dayPriceDeltaMap, dayVolumes, indexTokenStatsMap]);

  useMissedCoinsSearch({
    searchText: searchKeyword,
    isEmpty: !sortedTokens?.length && tab === "all",
    isLoaded: Boolean(options?.length),
    place: MissedCoinsPlace.marketDropdown,
  });

  const handleMarketSelect = useCallback(
    (tokenAddress: string, preferredTradeType?: PreferredTradeTypePickStrategy | undefined) => {
      setSearchKeyword("");
      close();

      chooseSuitableMarket(tokenAddress, preferredTradeType, tradeType);
    },
    [chooseSuitableMarket, close, tradeType]
  );

  const rowVerticalPadding = cx("px-12 py-10", {
    "group-last-of-type/row:pb-8": !isMobile,
  });
  const rowHorizontalPadding = cx("pr-8");
  const thClassName = cx(
    "sticky top-0 z-10 whitespace-nowrap bg-slate-900 text-left text-[11px] font-medium uppercase text-typography-secondary",
    "first-of-type:text-left",
    "first-of-type:!pl-44",
    rowVerticalPadding,
    rowHorizontalPadding
  );

  const tdClassName = cx(
    "text-body-small",
    isMobile ? "align-top" : "align-middle",
    rowVerticalPadding,
    rowHorizontalPadding
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && sortedTokens && sortedTokens.length > 0) {
        const token = sortedTokens[0];
        handleMarketSelect(token.address);
      }
    },
    [sortedTokens, handleMarketSelect]
  );

  const placeholder = useMemo(() => {
    if (isSwap) {
      return t`Search Token`;
    }

    return t`Search Market`;
  }, [isSwap]);

  const availableLiquidityLabel = isMobile ? (isSmallMobile ? t`LIQ.` : t`AVAIL. LIQ.`) : t`AVAILABLE LIQ.`;

  return (
    <>
      <SelectorBaseMobileHeaderContent>
        <div className="flex flex-col gap-12">
          <SearchInput
            className="w-full *:!text-body-medium"
            value={searchKeyword}
            setValue={setSearchKeyword}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />

          <ButtonRowScrollFadeContainer>
            <FavoriteTabs favoritesKey="chart-token-selector" />
          </ButtonRowScrollFadeContainer>
        </div>
        <div className="mt-12 h-[0.5px] w-[2000px] -translate-x-1/2 bg-slate-600" />
      </SelectorBaseMobileHeaderContent>

      {!isMobile && (
        <>
          <div className="flex flex-col justify-between gap-12 border-b-1/2 border-slate-600 p-12">
            <SearchInput
              className="w-full"
              value={searchKeyword}
              setValue={setSearchKeyword}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
            />
            <ButtonRowScrollFadeContainer>
              <FavoriteTabs favoritesKey="chart-token-selector" />
            </ButtonRowScrollFadeContainer>
          </div>
        </>
      )}

      <div
        className={cx({
          "max-h-[444px] overflow-x-auto": !isMobile,
        })}
      >
        <table className="text-body-small w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={cx(thClassName, isMobile ? "min-w-[18ch]" : "min-w-[28ch]")} colSpan={2}>
                <Trans>Market</Trans>
              </th>
              {isSwap ? (
                <>
                  <th className={thClassName}>
                    <Sorter {...getSorterProps("lastPrice")}>
                      {isSmallMobile ? <Trans>PRICE</Trans> : <Trans>LAST PRICE</Trans>}
                    </Sorter>
                  </th>
                  {!isMobile && (
                    <th className={thClassName}>
                      <Sorter {...getSorterProps("24hChange")}>
                        <Trans>24H%</Trans>
                      </Sorter>
                    </th>
                  )}
                </>
              ) : (
                <>
                  <th className={thClassName}>
                    <Sorter {...getSorterProps("lastPrice")}>
                      {isSmallMobile ? <Trans>PRICE</Trans> : <Trans>LAST PRICE</Trans>}
                    </Sorter>
                  </th>
                  {!isMobile && (
                    <th className={thClassName}>
                      <Sorter {...getSorterProps("24hChange")}>
                        <Trans>24H%</Trans>
                      </Sorter>
                    </th>
                  )}
                  <th className={thClassName}>
                    <Sorter {...getSorterProps("24hVolume")}>
                      {isSmallMobile ? <Trans>VOL.</Trans> : <Trans>24H VOL.</Trans>}
                    </Sorter>
                  </th>
                  {!isMobile && (
                    <>
                      <th className={thClassName} colSpan={2}>
                        <Sorter {...getSorterProps("combinedOpenInterest")}>
                          <Trans>OPEN INTEREST</Trans>
                        </Sorter>
                      </th>
                      <th className={thClassName} colSpan={2}>
                        <Sorter {...getSorterProps("combinedAvailableLiquidity")}>{availableLiquidityLabel}</Sorter>
                      </th>
                    </>
                  )}
                </>
              )}
            </tr>
          </thead>

          <tbody>
            {sortedDetails?.map(
              ({ token, tokenData, dayPriceDelta, dayVolume, openInterestLong, openInterestShort, maxLeverage }) => (
                <MarketListItem
                  key={token.address}
                  token={token}
                  tokenData={tokenData}
                  dayPriceDelta={dayPriceDelta}
                  dayVolume={dayVolume}
                  openInterestLong={openInterestLong}
                  openInterestShort={openInterestShort}
                  maxLeverage={maxLeverage}
                  isSwap={isSwap}
                  isMobile={isMobile}
                  isFavorite={favoriteTokens?.includes(token.address)}
                  onFavorite={toggleFavoriteToken}
                  rowVerticalPadding={rowVerticalPadding}
                  rowHorizontalPadding={rowHorizontalPadding}
                  tdClassName={tdClassName}
                  onMarketSelect={handleMarketSelect}
                />
              )
            )}
          </tbody>
        </table>
        {options && options.length > 0 && !sortedTokens?.length && (
          <EmptyTableContent isLoading={false} isEmpty={true} emptyText={<Trans>No markets matched</Trans>} />
        )}
      </div>
    </>
  );
}

function useFilterSortTokens({
  chainId,
  options,
  searchKeyword,
  tab,
  favoriteTokens,
  direction,
  orderBy,
  tokensData,
  dayPriceDeltaMap,
  dayVolumes,
  indexTokenStatsMap,
  isSwap,
}: {
  chainId: number;
  options: Token[] | undefined;
  searchKeyword: string;
  tab: TokenFavoritesTabOption;
  favoriteTokens: string[];
  direction: SortDirection;
  orderBy: SortField;
  tokensData: TokensData | undefined;
  dayPriceDeltaMap: PriceDeltaMap | undefined;
  dayVolumes: Record<Address, bigint> | undefined;
  indexTokenStatsMap: Partial<IndexTokensStats> | undefined;
  isSwap: boolean;
}) {
  const filteredTokens: Token[] | undefined = useMemo(() => {
    const textMatched =
      searchKeyword.trim() && options
        ? searchBy(
            options,
            [
              (item) => stripBlacklistedWords(item.name),
              (item) => (isSwap ? item.symbol : `${getTokenVisualMultiplier(item)}${item.symbol}`),
            ],
            searchKeyword
          )
        : options;

    if (tab === "all") {
      return textMatched;
    }

    if (tab === "favorites") {
      return textMatched?.filter((item) => favoriteTokens?.includes(item.address));
    }

    const categoryTokenAddresses = getCategoryTokenAddresses(chainId, tab);
    const tabMatched = textMatched?.filter((item) => categoryTokenAddresses.includes(item.address));

    return tabMatched;
  }, [chainId, favoriteTokens, isSwap, options, searchKeyword, tab]);

  const getMaxLongShortLiquidityPool = useSelector(selectTradeboxGetMaxLongShortLiquidityPool);

  const sortedTokens = useMemo(() => {
    const [favorites, nonFavorites] = partition(filteredTokens, (token) => favoriteTokens.includes(token.address));

    const sorter = tokenSortingComparatorBuilder({
      chainId,
      orderBy,
      direction,
      tokensData,
      dayPriceDeltaMap,
      dayVolumes,
      indexTokenStatsMap,
      getMaxLongShortLiquidityPool,
    });

    const sortedFavorites = favorites.slice().sort(sorter);

    const sortedNonFavorites = nonFavorites.slice().sort(sorter);

    return [...sortedFavorites, ...sortedNonFavorites];
  }, [
    filteredTokens,
    chainId,
    orderBy,
    direction,
    tokensData,
    dayPriceDeltaMap,
    dayVolumes,
    indexTokenStatsMap,
    getMaxLongShortLiquidityPool,
    favoriteTokens,
  ]);

  return sortedTokens;
}

const MarketLabel = ({ token }: { token: Token }) => {
  return (
    <span className="text-typography-secondary">
      <span className="text-typography-primary">{getMarketBaseName({ indexToken: token, isSpotOnly: false })}</span>
      /USD
    </span>
  );
};

function MarketListItem({
  token,
  tokenData,
  dayPriceDelta,
  dayVolume,
  openInterestLong,
  openInterestShort,
  maxLeverage,
  isSwap,
  isMobile,
  isFavorite,
  onFavorite,
  rowVerticalPadding,
  rowHorizontalPadding,
  tdClassName,
  onMarketSelect,
}: {
  token: Token;
  tokenData: TokenData | undefined;
  dayPriceDelta: PriceDelta | undefined;
  dayVolume: bigint | undefined;
  openInterestLong: bigint | undefined;
  openInterestShort: bigint | undefined;
  maxLeverage: number | undefined;
  isSwap: boolean;
  isMobile: boolean;
  isFavorite?: boolean;
  onFavorite: (address: string) => void;
  rowVerticalPadding: string;
  rowHorizontalPadding: string;
  tdClassName: string;
  onMarketSelect: (address: string, preferredTradeType?: PreferredTradeTypePickStrategy | undefined) => void;
}) {
  const getMaxLongShortLiquidityPool = useSelector(selectTradeboxGetMaxLongShortLiquidityPool);

  const { maxLongLiquidityPool, maxShortLiquidityPool } = getMaxLongShortLiquidityPool(token);

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent<HTMLTableCellElement>) => {
      e.stopPropagation();
      onFavorite(token.address);
    },
    [onFavorite, token.address]
  );

  const handleSelectLargePosition = useCallback(
    (e: React.MouseEvent<HTMLTableCellElement | HTMLTableRowElement>) => {
      e.stopPropagation();
      onMarketSelect(token.address, "largestPosition");
    },
    [onMarketSelect, token.address]
  );

  const handleSelectLong = useCallback(
    (e: React.MouseEvent<HTMLTableCellElement>) => {
      e.stopPropagation();
      onMarketSelect(token.address, TradeType.Long);
    },
    [onMarketSelect, token.address]
  );

  const handleSelectShort = useCallback(
    (e: React.MouseEvent<HTMLTableCellElement>) => {
      e.stopPropagation();
      onMarketSelect(token.address, TradeType.Short);
    },
    [onMarketSelect, token.address]
  );

  const dayPriceDeltaComponent = useMemo(() => {
    return (
      <div
        className={cx("numbers", {
          positive: dayPriceDelta?.deltaPercentage && dayPriceDelta?.deltaPercentage > 0,
          negative: dayPriceDelta?.deltaPercentage && dayPriceDelta?.deltaPercentage < 0,
        })}
      >
        {dayPriceDelta?.deltaPercentageStr || "-"}
      </div>
    );
  }, [dayPriceDelta]);

  if (isSwap) {
    return (
      <tr key={token.symbol} className="group/row cursor-pointer hover:bg-fill-surfaceHover">
        <td
          className={cx("pl-14 pr-6 text-center text-typography-secondary", rowVerticalPadding)}
          onClick={handleFavoriteClick}
        >
          <FavoriteStar isFavorite={isFavorite} className="!size-12" />
        </td>
        <td
          className={cx("text-body-medium w-full", rowVerticalPadding, rowHorizontalPadding)}
          onClick={handleSelectLargePosition}
        >
          <span className="flex items-center gap-4">
            <TokenIcon className="ChartToken-list-icon -my-5 mr-6" symbol={token.symbol} displaySize={16} />
            <span>{token.name}</span>
            <span className="font-medium text-typography-secondary">{token.symbol}</span>
          </span>
        </td>
        <td className={tdClassName}>
          <div className="flex flex-col gap-4">
            <span className="numbers">
              {tokenData
                ? formatUsdPrice(getMidPrice(tokenData.prices), { visualMultiplier: tokenData.visualMultiplier })
                : "-"}
            </span>
            {isMobile && <span>{dayPriceDeltaComponent}</span>}
          </div>
        </td>
        {!isMobile && <td className={tdClassName}>{dayPriceDeltaComponent}</td>}
      </tr>
    );
  }

  return (
    <tr
      key={token.symbol}
      className="group/row cursor-pointer hover:bg-fill-surfaceHover"
      onClick={handleSelectLargePosition}
    >
      <td
        className={cx("px-12 text-center text-typography-secondary", rowVerticalPadding)}
        onClick={handleFavoriteClick}
      >
        <FavoriteStar isFavorite={isFavorite} className="!size-12" />
      </td>
      <td className={cx("pl-4 text-[13px]", rowVerticalPadding, isMobile ? "pr-2" : "pr-8")}>
        <div className={cx("flex", isMobile ? "items-start" : "items-center")}>
          <TokenIcon className="ChartToken-list-icon mr-6" symbol={token.symbol} displaySize={16} />
          <span className={cx("flex flex-wrap items-center gap-6")}>
            <span className="font-medium leading-1">
              <MarketLabel token={token} />
            </span>
            <span className="rounded-full bg-slate-700 px-6 py-[1.5px] text-12 font-medium leading-[1.25] text-typography-secondary numbers">
              {maxLeverage ? `${maxLeverage}x` : "-"}
            </span>
          </span>
        </div>
      </td>

      <td className={tdClassName}>
        <div className="flex flex-col gap-4">
          <span className="numbers">
            {tokenData
              ? formatUsdPrice(getMidPrice(tokenData.prices), { visualMultiplier: tokenData.visualMultiplier })
              : "-"}
          </span>
          {isMobile && <span>{dayPriceDeltaComponent}</span>}
        </div>
      </td>
      {!isMobile && <td className={tdClassName}>{dayPriceDeltaComponent}</td>}
      <td className={cx(tdClassName, "numbers")}>
        {dayVolume ? formatAmountHuman(dayVolume, USD_DECIMALS, true) : "-"}
      </td>
      {!isMobile && (
        <>
          <td className={cx(tdClassName, "pr-4 numbers")}>
            <span className="inline-flex items-center gap-6">
              <LongIcon width={12} className="relative top-1 mb-2 opacity-70" />
              {formatAmountHuman(openInterestLong ?? 0n, USD_DECIMALS, true)}
            </span>
          </td>
          <td className={cx(tdClassName, "pl-4 numbers")}>
            <span className="inline-flex items-center gap-6">
              <ShortIcon width={12} className="relative top-1 mb-2 opacity-70" />
              {formatAmountHuman(openInterestShort ?? 0n, USD_DECIMALS, true)}
            </span>
          </td>
        </>
      )}

      {!isMobile ? (
        <>
          <td className={cx(tdClassName, "group pr-4 numbers hover:bg-slate-800")} onClick={handleSelectLong}>
            <div className="inline-flex items-center justify-end gap-6">
              <LongIcon width={12} className="relative top-1 mb-2 opacity-70" />
              {formatAmountHuman(maxLongLiquidityPool?.maxLongLiquidity, USD_DECIMALS, true)}
            </div>
          </td>
          <td className={cx(tdClassName, "group pl-4 numbers hover:bg-slate-800")} onClick={handleSelectShort}>
            <div className="inline-flex items-center justify-end gap-6">
              <ShortIcon width={12} className="relative top-1 mb-2 opacity-70" />
              {formatAmountHuman(maxShortLiquidityPool?.maxShortLiquidity, USD_DECIMALS, true)}
            </div>
          </td>
        </>
      ) : null}
    </tr>
  );
}

function tokenSortingComparatorBuilder({
  chainId,
  orderBy,
  direction,
  tokensData,
  dayPriceDeltaMap,
  dayVolumes,
  indexTokenStatsMap,
  getMaxLongShortLiquidityPool,
}: {
  chainId: number;
  orderBy: SortField;
  direction: SortDirection;
  tokensData: TokensData | undefined;
  dayPriceDeltaMap: PriceDeltaMap | undefined;
  dayVolumes: Record<Address, bigint> | undefined;
  indexTokenStatsMap: Partial<IndexTokensStats> | undefined;
  getMaxLongShortLiquidityPool: (token: Token) => {
    maxLongLiquidityPool: TokenOption;
    maxShortLiquidityPool: TokenOption;
  };
}) {
  const directionMultiplier = direction === "asc" ? 1 : -1;

  return (a: Token, b: Token) => {
    const aAddress = convertTokenAddress(chainId, a.address, "wrapped");
    const bAddress = convertTokenAddress(chainId, b.address, "wrapped");

    if (orderBy === "unspecified" || direction === "unspecified") {
      // Tokens are already sorted by pool size
      return 0;
    }

    if (orderBy === "24hVolume") {
      const aVolume = dayVolumes?.[aAddress] || 0n;
      const bVolume = dayVolumes?.[bAddress] || 0n;
      return aVolume > bVolume ? directionMultiplier : -directionMultiplier;
    }

    if (orderBy === "lastPrice") {
      const aVisualMultiplier = BigInt(a.visualMultiplier ?? 1);
      const bVisualMultiplier = BigInt(b.visualMultiplier ?? 1);

      let aMidPrice = tokensData?.[aAddress]?.prices ? getMidPrice(tokensData[aAddress].prices) : 0n;
      aMidPrice *= aVisualMultiplier;
      let bMidPrice = tokensData?.[bAddress]?.prices ? getMidPrice(tokensData[bAddress].prices) : 0n;
      bMidPrice *= bVisualMultiplier;

      return aMidPrice > bMidPrice ? directionMultiplier : -directionMultiplier;
    }

    if (orderBy === "24hChange") {
      // Price delta map uses native addresses
      const aChange = dayPriceDeltaMap?.[a.address]?.deltaPercentage || 0;
      const bChange = dayPriceDeltaMap?.[b.address]?.deltaPercentage || 0;
      return aChange > bChange ? directionMultiplier : -directionMultiplier;
    }

    if (orderBy === "combinedAvailableLiquidity") {
      const { maxLongLiquidityPool: aLongLiq, maxShortLiquidityPool: aShortLiq } = getMaxLongShortLiquidityPool(a);
      const { maxLongLiquidityPool: bLongLiq, maxShortLiquidityPool: bShortLiq } = getMaxLongShortLiquidityPool(b);

      const aTotalLiq = aLongLiq.maxLongLiquidity + aShortLiq.maxShortLiquidity;
      const bTotalLiq = bLongLiq.maxLongLiquidity + bShortLiq.maxShortLiquidity;
      return aTotalLiq > bTotalLiq ? directionMultiplier : -directionMultiplier;
    }

    if (orderBy === "combinedOpenInterest") {
      const aOI =
        (indexTokenStatsMap?.[aAddress]?.totalOpenInterestLong || 0n) +
        (indexTokenStatsMap?.[aAddress]?.totalOpenInterestShort || 0n);
      const bOI =
        (indexTokenStatsMap?.[bAddress]?.totalOpenInterestLong || 0n) +
        (indexTokenStatsMap?.[bAddress]?.totalOpenInterestShort || 0n);
      return aOI > bOI ? directionMultiplier : -directionMultiplier;
    }

    return 0;
  };
}

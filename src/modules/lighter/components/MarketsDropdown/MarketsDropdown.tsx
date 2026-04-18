import { Trans, t } from "@lingui/macro";
import cx from "classnames";
import { useCallback, useMemo, useState } from "react";

import type { X10000Market } from "@/modules/cex/lib/api/custom/useX10000Markets";
import { useX10000MarketsWithTickers } from "@/modules/cex/lib/api/custom/useX10000Markets";
import { useTokensFavorites } from "context/TokensFavoritesContext/TokensFavoritesContextProvider";
import { useChainId } from "lib/chains";
import { searchBy } from "lib/searchBy";
import { useBreakpoints } from "lib/useBreakpoints";

import { EmptyTableContent } from "components/EmptyTableContent/EmptyTableContent";
import FavoriteStar from "components/FavoriteStar/FavoriteStar";
import SearchInput from "components/SearchInput/SearchInput";
import { SelectorBaseMobileHeaderContent, useSelectorClose } from "components/SelectorBase/SelectorBase";
import { Sorter, useSorterHandlers } from "components/Sorter/Sorter";
import { ButtonRowScrollFadeContainer } from "components/TableScrollFade/TableScrollFade";
import TokenIcon from "components/TokenIcon/TokenIcon";

import { MarketTypeTabs } from "./MarketTypeTabs";

import "./MarketsDropdown.scss";

type SortField = "lastPrice" | "24hChange" | "24hVolume" | "leverage" | "unspecified";

interface MarketsDropdownProps {
  onMarketSelect?: (symbol: string) => void;
  displayMode?: "default" | "popover";
}

export function MarketsDropdown({ onMarketSelect, displayMode = "default" }: MarketsDropdownProps) {
  const { chainId } = useChainId();
  const { markets, isLoading } = useX10000MarketsWithTickers(chainId);
  const { isMobile, isSmallMobile } = useBreakpoints();
  const close = useSelectorClose();

  const { tab, setTab, favoriteTokens, toggleFavoriteToken } = useTokensFavorites("x10000-market-selector");
  const { orderBy, direction, getSorterProps } = useSorterHandlers<SortField>("x10000-markets-dropdown");

  const [searchKeyword, setSearchKeyword] = useState("");

  const filteredMarkets = useFilterSortMarkets({
    markets,
    searchKeyword,
    tab,
    favoriteTokens,
    orderBy,
    direction,
  });

  const handleMarketSelect = useCallback(
    (symbol: string) => {
      setSearchKeyword("");
      close();
      onMarketSelect?.(symbol);
    },
    [close, onMarketSelect]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && filteredMarkets.length > 0) {
        handleMarketSelect(filteredMarkets[0].symbol);
      }
    },
    [filteredMarkets, handleMarketSelect]
  );

  const thClassName = "MarketsDropdown-tableHeadCell";
  const tdClassName = cx("MarketsDropdown-tableCell", {
    "MarketsDropdown-tableCell-mobile": isMobile,
  });

  return (
    <div
      className={cx(
        "flex flex-col overflow-hidden rounded-[12px] border border-[#24242b] bg-[#101117] shadow-[0_24px_48px_rgba(0,0,0,0.45)]",
        displayMode === "popover" && "w-[min(1368px,calc(100vw-24px))] max-h-[680px]",
        { "MarketsDropdown-popover": displayMode === "popover" }
      )}
    >
      <SelectorBaseMobileHeaderContent>
        <div className="MarketsDropdown-mobileHeader">
          <SearchInput
            className="MarketsDropdown-searchInput"
            value={searchKeyword}
            setValue={setSearchKeyword}
            onKeyDown={handleKeyDown}
            placeholder={t`Search Market`}
            noBorder
          />
          <div className="MarketsDropdown-tabsScroll">
            <ButtonRowScrollFadeContainer>
              <MarketTypeTabs markets={markets} selectedTab={tab} onTabChange={setTab} showFavorites={true} />
            </ButtonRowScrollFadeContainer>
          </div>
        </div>
      </SelectorBaseMobileHeaderContent>

      {!isMobile && (
        <div className="MarketsDropdown-header">
          <SearchInput
            className="MarketsDropdown-searchInput"
            value={searchKeyword}
            setValue={setSearchKeyword}
            onKeyDown={handleKeyDown}
            placeholder={t`Search Market`}
            noBorder
          />
          <div className="MarketsDropdown-tabsScroll">
            <ButtonRowScrollFadeContainer>
              <MarketTypeTabs markets={markets} selectedTab={tab} onTabChange={setTab} showFavorites={true} />
            </ButtonRowScrollFadeContainer>
          </div>
        </div>
      )}

      <div className={cx("MarketsDropdown-tableWrap", { "max-h-[444px] overflow-x-auto": !isMobile })}>
        <table className="MarketsDropdown-table">
          <thead>
            <tr>
              <th className={cx(thClassName, isMobile ? "min-w-[18ch]" : "min-w-[28ch]")} colSpan={2}>
                <Trans>Market</Trans>
              </th>
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
                <th className={thClassName}>
                  <Sorter {...getSorterProps("leverage")}>
                    <Trans>LEVERAGE</Trans>
                  </Sorter>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {!isLoading &&
              filteredMarkets.map((market) => (
                <MarketsRow
                  key={market.symbol}
                  market={market}
                  isMobile={isMobile}
                  isFavorite={favoriteTokens?.includes(market.symbol)}
                  onFavorite={() => toggleFavoriteToken(market.symbol)}
                  onSelect={() => handleMarketSelect(market.symbol)}
                  tdClassName={tdClassName}
                />
              ))}
          </tbody>
        </table>
        {isLoading && (
          <div className="flex h-[200px] items-center justify-center text-typography-secondary">
            <Trans>Loading markets...</Trans>
          </div>
        )}
        {!isLoading && markets.length > 0 && !filteredMarkets.length && (
          <EmptyTableContent isLoading={false} isEmpty={true} emptyText={<Trans>No markets matched</Trans>} />
        )}
      </div>
    </div>
  );
}

function useFilterSortMarkets({
  markets,
  searchKeyword,
  tab,
  favoriteTokens,
  orderBy,
  direction,
}: {
  markets: X10000Market[];
  searchKeyword: string;
  tab: string;
  favoriteTokens: string[];
  orderBy: SortField;
  direction: string;
}) {
  const filtered = useMemo(() => {
    let result = markets;

    if (searchKeyword.trim()) {
      result = searchBy(result, [(m) => m.symbol, (m) => m.base_asset, (m) => m.quote_asset], searchKeyword);
    }

    if (tab === "favorites") {
      result = result.filter((m) => favoriteTokens.includes(m.symbol));
    } else if (tab !== "all") {
      result = result.filter((m) => m.type === tab);
    }

    return result;
  }, [markets, searchKeyword, tab, favoriteTokens]);

  const sorted = useMemo(() => {
    if (orderBy === "unspecified" || direction === "unspecified") {
      return filtered;
    }

    const directionMultiplier = direction === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (orderBy === "lastPrice") {
        const priceA = parseFloat(a.lastPrice || "0");
        const priceB = parseFloat(b.lastPrice || "0");
        return priceA > priceB ? directionMultiplier : -directionMultiplier;
      }
      if (orderBy === "24hChange") {
        const changeA = a.priceChangePercent || 0;
        const changeB = b.priceChangePercent || 0;
        return changeA > changeB ? directionMultiplier : -directionMultiplier;
      }
      if (orderBy === "24hVolume") {
        const volA = parseFloat(a.volume24h || "0");
        const volB = parseFloat(b.volume24h || "0");
        return volA > volB ? directionMultiplier : -directionMultiplier;
      }
      if (orderBy === "leverage") {
        return a.leverage > b.leverage ? directionMultiplier : -directionMultiplier;
      }
      return 0;
    });
  }, [filtered, orderBy, direction]);

  return useMemo(() => {
    const favorites = sorted.filter((m) => favoriteTokens.includes(m.symbol));
    const nonFavorites = sorted.filter((m) => !favoriteTokens.includes(m.symbol));
    return [...favorites, ...nonFavorites];
  }, [sorted, favoriteTokens]);
}

interface MarketsRowProps {
  market: X10000Market;
  isMobile: boolean;
  isFavorite?: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  tdClassName: string;
}

function MarketsRow({
  market,
  isMobile,
  isFavorite,
  onFavorite,
  onSelect,
  tdClassName,
}: MarketsRowProps) {
  const priceChange = market.priceChangePercent || 0;
  const isPositive = priceChange >= 0;

  const formattedPrice = market.lastPrice ? formatPrice(market.lastPrice, market.price_decimals) : "-";
  const formattedVolume = market.volume24h ? formatVolume(market.volume24h) : "-";

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFavorite();
    },
    [onFavorite]
  );

  const priceChangeComponent = (
    <div className={cx("numbers", { positive: isPositive, negative: !isPositive })}>
      {isPositive ? "+" : ""}
      {priceChange.toFixed(2)}%
    </div>
  );

  return (
    <tr className="MarketsDropdown-row" onClick={onSelect}>
      <td
        className="MarketsDropdown-starCell"
        onClick={handleFavoriteClick}
      >
        <FavoriteStar isFavorite={isFavorite} className="!size-12" />
      </td>
      <td className={cx("MarketsDropdown-marketCell", isMobile && "MarketsDropdown-marketCell-mobile")}>
        <div className={cx("MarketsDropdown-marketInner", isMobile ? "items-start" : "items-center")}>
          <TokenIcon className="ChartToken-list-icon mr-6" symbol={market.base_asset} displaySize={16} />
          <span className="MarketsDropdown-marketMeta">
            <span className="MarketsDropdown-marketSymbol">
              <span className="text-typography-primary">{market.base_asset}</span>
              <span className="text-typography-secondary">/{market.quote_asset}</span>
            </span>
            <span className="MarketsDropdown-marketLeverage numbers">
              {market.leverage}x
            </span>
          </span>
        </div>
      </td>
      <td className={tdClassName}>
        <div className="flex flex-col gap-4">
          <span className="numbers">${formattedPrice}</span>
          {isMobile && <span>{priceChangeComponent}</span>}
        </div>
      </td>
      {!isMobile && <td className={tdClassName}>{priceChangeComponent}</td>}
      <td className={cx(tdClassName, "numbers")}>${formattedVolume}</td>
      {!isMobile && <td className={cx(tdClassName, "numbers")}>{market.leverage}x</td>}
    </tr>
  );
}

function formatPrice(price: string, decimals?: number): string {
  const num = parseFloat(price);
  if (isNaN(num) || num === 0) return "-";

  let effectiveDecimals = decimals ?? 2;
  if (num < 0.01) {
    const str = num.toFixed(10);
    const match = str.match(/^0\.0*[1-9]/);
    if (match) {
      effectiveDecimals = Math.max(decimals ?? 2, Math.min(match[0].length + 3, 10));
    } else {
      effectiveDecimals = Math.max(decimals ?? 2, 8);
    }
  } else if (num < 1) {
    effectiveDecimals = Math.max(decimals ?? 2, 4);
  }

  const safeDecimals = Math.max(0, Math.min(20, effectiveDecimals));

  if (num >= 1000) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return num.toFixed(safeDecimals);
}

function formatVolume(volume: string): string {
  const num = parseFloat(volume);
  if (isNaN(num)) return "-";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(2);
}

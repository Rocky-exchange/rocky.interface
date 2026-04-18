/**
 * X10000 Markets Dropdown
 *
 * This component replaces the MarketsList in ChartTokenSelector
 * when in 10000x mode. It fetches markets from the backend API.
 */

import { Trans, t } from "@lingui/macro";
import cx from "classnames";
import { useCallback, useMemo, useState } from "react";

import { useChainId } from "lib/chains";
import { useX10000MarketsWithTickers, type X10000Market } from "@/modules/cex/lib/api/custom/useX10000Markets";
import { searchBy } from "lib/searchBy";
import { useBreakpoints } from "lib/useBreakpoints";

import { EmptyTableContent } from "components/EmptyTableContent/EmptyTableContent";
import FavoriteStar from "components/FavoriteStar/FavoriteStar";
import SearchInput from "components/SearchInput/SearchInput";
import { Sorter, useSorterHandlers } from "components/Sorter/Sorter";
import { ButtonRowScrollFadeContainer } from "components/TableScrollFade/TableScrollFade";
import { SelectorBaseMobileHeaderContent, useSelectorClose } from "components/SelectorBase/SelectorBase";
import { useTokensFavorites } from "context/TokensFavoritesContext/TokensFavoritesContextProvider";
import TokenIcon from "components/TokenIcon/TokenIcon";
import { MarketTypeTabs } from "./MarketTypeTabs";

import "./X10000MarketsList.scss";

type SortField = "lastPrice" | "24hChange" | "24hVolume" | "leverage" | "unspecified";

interface X10000MarketsDropdownProps {
  onMarketSelect?: (symbol: string) => void;
}

export function X10000MarketsDropdown({ onMarketSelect }: X10000MarketsDropdownProps) {
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

  const rowVerticalPadding = cx("px-12 py-10", {
    "group-last-of-type/row:pb-8": !isMobile,
  });
  const rowHorizontalPadding = "pr-8";
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

  return (
    <>
      <SelectorBaseMobileHeaderContent>
        <div className="flex flex-col gap-12">
          <SearchInput
            className="w-full *:!text-body-medium"
            value={searchKeyword}
            setValue={setSearchKeyword}
            onKeyDown={handleKeyDown}
            placeholder={t`Search Market`}
          />
          <ButtonRowScrollFadeContainer>
            <MarketTypeTabs
              markets={markets}
              selectedTab={tab}
              onTabChange={setTab}
              showFavorites={true}
            />
          </ButtonRowScrollFadeContainer>
        </div>
        <div className="mt-12 h-[0.5px] w-[2000px] -translate-x-1/2 bg-slate-600" />
      </SelectorBaseMobileHeaderContent>

      {!isMobile && (
        <div className="flex flex-col justify-between gap-12 border-b-1/2 border-slate-600 p-12">
          <SearchInput
            className="w-full"
            value={searchKeyword}
            setValue={setSearchKeyword}
            onKeyDown={handleKeyDown}
            placeholder={t`Search Market`}
          />
          <ButtonRowScrollFadeContainer>
            <MarketTypeTabs
              markets={markets}
              selectedTab={tab}
              onTabChange={setTab}
              showFavorites={true}
            />
          </ButtonRowScrollFadeContainer>
        </div>
      )}

      <div className={cx({ "max-h-[444px] overflow-x-auto": !isMobile })}>
        <table className="text-body-small w-full border-separate border-spacing-0">
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
                <X10000MarketRow
                  key={market.symbol}
                  market={market}
                  isMobile={isMobile}
                  isFavorite={favoriteTokens?.includes(market.symbol)}
                  onFavorite={() => toggleFavoriteToken(market.symbol)}
                  onSelect={() => handleMarketSelect(market.symbol)}
                  rowVerticalPadding={rowVerticalPadding}
                  rowHorizontalPadding={rowHorizontalPadding}
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
    </>
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

    // Filter by search
    if (searchKeyword.trim()) {
      result = searchBy(
        result,
        [(m) => m.symbol, (m) => m.base_asset, (m) => m.quote_asset],
        searchKeyword
      );
    }

    // Filter by tab
    if (tab === "favorites") {
      result = result.filter((m) => favoriteTokens.includes(m.symbol));
    } else if (tab !== "all") {
      // Filter by market type (layer1, meme, defi, ai, rwa, layer2)
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

  // Put favorites first
  return useMemo(() => {
    const favorites = sorted.filter((m) => favoriteTokens.includes(m.symbol));
    const nonFavorites = sorted.filter((m) => !favoriteTokens.includes(m.symbol));
    return [...favorites, ...nonFavorites];
  }, [sorted, favoriteTokens]);
}

interface X10000MarketRowProps {
  market: X10000Market;
  isMobile: boolean;
  isFavorite?: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  rowVerticalPadding: string;
  rowHorizontalPadding: string;
  tdClassName: string;
}

function X10000MarketRow({
  market,
  isMobile,
  isFavorite,
  onFavorite,
  onSelect,
  rowVerticalPadding,
  rowHorizontalPadding,
  tdClassName,
}: X10000MarketRowProps) {
  const priceChange = market.priceChangePercent || 0;
  const isPositive = priceChange >= 0;

  const formattedPrice = market.lastPrice
    ? formatPrice(market.lastPrice, market.price_decimals)
    : "-";

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
      {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
    </div>
  );

  return (
    <tr className="group/row cursor-pointer hover:bg-fill-surfaceHover" onClick={onSelect}>
      <td
        className={cx("px-12 text-center text-typography-secondary", rowVerticalPadding)}
        onClick={handleFavoriteClick}
      >
        <FavoriteStar isFavorite={isFavorite} className="!size-12" />
      </td>
      <td className={cx("pl-4 text-[13px]", rowVerticalPadding, isMobile ? "pr-2" : "pr-8")}>
        <div className={cx("flex", isMobile ? "items-start" : "items-center")}>
          <TokenIcon className="ChartToken-list-icon mr-6" symbol={market.base_asset} displaySize={16} />
          <span className={cx("flex flex-wrap items-center gap-6")}>
            <span className="font-medium leading-1">
              <span className="text-typography-primary">{market.base_asset}</span>
              <span className="text-typography-secondary">/{market.quote_asset}</span>
            </span>
            <span className="rounded-full bg-slate-700 px-6 py-[1.5px] text-12 font-medium leading-[1.25] text-typography-secondary numbers">
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

  // For very small prices, use more decimal places to show meaningful values
  let effectiveDecimals = decimals ?? 2;
  if (num < 0.01) {
    // Find first significant digit and show 4 more
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

  // Ensure decimals is a valid number between 0-20 (toLocaleString limit)
  const safeDecimals = Math.max(0, Math.min(20, effectiveDecimals));

  // For large numbers use locale formatting, for small use toFixed for precision
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
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(2) + "K";
  return num.toFixed(2);
}

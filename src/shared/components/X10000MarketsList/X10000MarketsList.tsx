/**
 * X10000 Markets List
 *
 * Displays markets fetched from the ZTDX backend API.
 * Used in the 10000x page to show available trading pairs.
 */

import { t, Trans } from "@lingui/macro";
import { useMemo, useState } from "react";

import { useChainId } from "lib/chains";
import { useX10000MarketsWithTickers, type X10000Market } from "@/modules/cex/lib/api/custom/useX10000Markets";
import { formatAmount } from "lib/numbers";
import { searchBy } from "lib/searchBy";

import { BottomTablePagination } from "components/Pagination/BottomTablePagination";
import usePagination, { DEFAULT_PAGE_SIZE } from "components/Referrals/usePagination";
import SearchInput from "components/SearchInput/SearchInput";
import { MarketListSkeleton } from "components/Skeleton/Skeleton";
import { Sorter, useSorterHandlers } from "components/Sorter/Sorter";
import { TableTd, TableTh, TableTheadTr, TableTr } from "components/Table/Table";
import { TableScrollFadeContainer } from "components/TableScrollFade/TableScrollFade";

import "./X10000MarketsList.scss";

export function X10000MarketsList() {
  const { chainId } = useChainId();
  const { markets, isLoading } = useX10000MarketsWithTickers(chainId);

  return (
    <X10000MarketsListDesktop
      chainId={chainId}
      markets={markets}
      isLoading={isLoading}
    />
  );
}

interface X10000MarketsListDesktopProps {
  chainId: number;
  markets: X10000Market[];
  isLoading: boolean;
}

function X10000MarketsListDesktop({ chainId, markets, isLoading }: X10000MarketsListDesktopProps) {
  const { orderBy, direction, getSorterProps } = useSorterHandlers<
    "price" | "volume" | "change" | "leverage" | "unspecified"
  >("x10000-markets-list");
  const [searchText, setSearchText] = useState("");

  const filteredMarkets = useFilterSortMarkets({ searchText, markets, orderBy, direction });

  const { currentPage, currentData, pageCount, setCurrentPage } = usePagination(
    `${chainId} ${direction} ${orderBy} ${searchText}`,
    filteredMarkets,
    DEFAULT_PAGE_SIZE
  );

  return (
    <div className="my-15 rounded-4 bg-slate-900 text-left">
      <div className="flex flex-col gap-16 p-20 text-16">
        <span className="text-h2">
          <Trans>Markets (10000x)</Trans>
        </span>

        <div className="max-w-[260px]">
          <SearchInput
            size="s"
            value={searchText}
            setValue={setSearchText}
            className="*:!text-body-medium"
            placeholder={t`Search Market`}
            autoFocus={false}
          />
        </div>
      </div>
      <TableScrollFadeContainer>
        <table className="w-[max(100%,900px)]">
          <thead>
            <TableTheadTr>
              <TableTh>
                <Trans>MARKET</Trans>
              </TableTh>
              <TableTh>
                <Sorter {...getSorterProps("price")}>
                  <Trans>PRICE</Trans>
                </Sorter>
              </TableTh>
              <TableTh>
                <Sorter {...getSorterProps("change")}>
                  <Trans>24H CHANGE</Trans>
                </Sorter>
              </TableTh>
              <TableTh>
                <Sorter {...getSorterProps("volume")}>
                  <Trans>24H VOLUME</Trans>
                </Sorter>
              </TableTh>
              <TableTh>
                <Sorter {...getSorterProps("leverage")}>
                  <Trans>MAX LEVERAGE</Trans>
                </Sorter>
              </TableTh>
              <TableTh>
                <Trans>STATUS</Trans>
              </TableTh>
            </TableTheadTr>
          </thead>
          <tbody>
            {!isLoading &&
              currentData.length > 0 &&
              currentData.map((market) => (
                <X10000MarketsListItem key={market.symbol} market={market} />
              ))}

            {!isLoading && markets.length > 0 && !currentData.length && (
              <TableTr className="h-[64.5px]">
                <TableTd colSpan={6} className="text-body-medium align-top text-typography-secondary">
                  <Trans>No markets found.</Trans>
                </TableTd>
              </TableTr>
            )}

            {!isLoading && currentData.length < DEFAULT_PAGE_SIZE && (
              <MarketListSkeleton
                invisible
                count={currentData.length === 0 ? DEFAULT_PAGE_SIZE - 1 : DEFAULT_PAGE_SIZE - currentData.length}
              />
            )}
            {isLoading && <MarketListSkeleton />}
          </tbody>
        </table>
      </TableScrollFadeContainer>
      <BottomTablePagination page={currentPage} pageCount={pageCount} onPageChange={setCurrentPage} />
    </div>
  );
}

function useFilterSortMarkets({
  markets,
  searchText,
  orderBy,
  direction,
}: {
  markets: X10000Market[];
  searchText: string;
  orderBy: string;
  direction: string;
}) {
  const filteredMarkets = useMemo(() => {
    if (!searchText.trim()) {
      return markets;
    }

    return searchBy(
      markets,
      [
        (item) => item.symbol,
        (item) => item.base_asset,
        (item) => item.quote_asset,
      ],
      searchText
    );
  }, [markets, searchText]);

  const sortedMarkets = useMemo(() => {
    if (orderBy === "unspecified" || direction === "unspecified") {
      return filteredMarkets;
    }

    return filteredMarkets.slice().sort((a, b) => {
      const directionMultiplier = direction === "asc" ? 1 : -1;

      if (orderBy === "price") {
        const priceA = parseFloat(a.lastPrice || "0");
        const priceB = parseFloat(b.lastPrice || "0");
        return priceA > priceB ? directionMultiplier : -directionMultiplier;
      }

      if (orderBy === "volume") {
        const volA = parseFloat(a.volume24h || "0");
        const volB = parseFloat(b.volume24h || "0");
        return volA > volB ? directionMultiplier : -directionMultiplier;
      }

      if (orderBy === "change") {
        const changeA = a.priceChangePercent || 0;
        const changeB = b.priceChangePercent || 0;
        return changeA > changeB ? directionMultiplier : -directionMultiplier;
      }

      if (orderBy === "leverage") {
        return a.leverage > b.leverage ? directionMultiplier : -directionMultiplier;
      }

      return 0;
    });
  }, [filteredMarkets, orderBy, direction]);

  return sortedMarkets;
}

function X10000MarketsListItem({ market }: { market: X10000Market }) {
  const priceChange = market.priceChangePercent || 0;
  const isPositive = priceChange >= 0;

  // Format price based on decimals
  const formattedPrice = market.lastPrice
    ? formatPrice(market.lastPrice, market.price_decimals)
    : "-";

  // Format volume
  const formattedVolume = market.volume24h
    ? formatVolume(market.volume24h)
    : "-";

  return (
    <TableTr>
      <TableTd>
        <div className="flex items-center gap-8">
          <div className="X10000MarketsList-symbol">
            <span className="text-body-large font-medium">{market.base_asset}</span>
            <span className="text-typography-secondary">/{market.quote_asset}</span>
          </div>
          <span className="X10000MarketsList-leverage-badge">{market.leverage}x</span>
        </div>
      </TableTd>
      <TableTd className="numbers">${formattedPrice}</TableTd>
      <TableTd className={`numbers ${isPositive ? "positive" : "negative"}`}>
        {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
      </TableTd>
      <TableTd className="numbers">${formattedVolume}</TableTd>
      <TableTd className="numbers">{market.leverage}x</TableTd>
      <TableTd>
        <span className={`X10000MarketsList-status X10000MarketsList-status--${market.status}`}>
          {market.status === "active" ? "Active" : market.status}
        </span>
      </TableTd>
    </TableTr>
  );
}

// Helper functions
function formatPrice(price: string, decimals: number): string {
  const num = parseFloat(price);
  if (isNaN(num) || num === 0) return "-";

  // For very small prices, auto-detect appropriate decimals
  let effectiveDecimals = decimals;
  if (num < 0.01) {
    // Find first significant digit and show 4 more
    const str = num.toFixed(10);
    const match = str.match(/^0\.0*[1-9]/);
    if (match) {
      effectiveDecimals = Math.max(decimals, Math.min(match[0].length + 3, 10));
    } else {
      effectiveDecimals = Math.max(decimals, 8);
    }
  } else if (num < 1) {
    effectiveDecimals = Math.max(decimals, 4);
  }

  // For large numbers use locale formatting, for small numbers use toFixed
  if (num >= 1000) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return num.toFixed(effectiveDecimals);
}

function formatVolume(volume: string): string {
  const num = parseFloat(volume);
  if (isNaN(num)) return "-";

  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + "B";
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + "K";
  }
  return num.toFixed(2);
}

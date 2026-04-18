import { useMemo } from "react";

import { selectChartHeaderInfo } from "context/SyntheticsStateContext/selectors/chartSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { useApiTicker, useZtdxFundingRate, useZtdxMarkets } from "modules/cex/lib/api/hooks";
import { useChainId } from "lib/chains";
import { useX10000State } from "modules/cex/store/X10000StateContext";

const USD_DECIMALS = 30;

export type LighterMarketInfo = {
  symbol: string;
  leverage: number;
  markPrice: number | null;
  indexPrice: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  openInterestUsd: number | null;
  funding1hPct: number | null;
  nextFundingTs: number | null;
};

function bigIntToNumber(v: bigint | undefined | null, decimals: number): number | null {
  if (v === undefined || v === null) return null;
  try {
    const divisor = 10n ** BigInt(decimals);
    const whole = Number(v / divisor);
    const frac = Number(v % divisor) / Number(divisor);
    return whole + frac;
  } catch (_error) {
    return null;
  }
}

function safeNumber(s: string | number | undefined | null): number | null {
  if (s == null) return null;
  const n = typeof s === "number" ? s : Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeTimestamp(ts: number | null): number | null {
  if (ts == null) return null;
  return ts < 1e12 ? ts * 1000 : ts;
}

export function useMarketInfoAdapter(): LighterMarketInfo {
  const { chainId } = useChainId();
  const { selectedSymbol } = useX10000State();
  // 从 selectedSymbol (如 "BTC-USD") 提取 base symbol (如 "BTC") 用于 UI
  const symbol = selectedSymbol?.split("-")[0] ?? "BTC";
  const chartToken: any = null;
  const headerInfo = useSelector(selectChartHeaderInfo);
  const { ticker } = useApiTicker(chainId, selectedSymbol ?? undefined);
  const { data: marketsData } = useZtdxMarkets(chainId);
  // 使用 funding-rates/{symbol} 的 funding_rate_per_hour 作为统一费率源
  // 确保 SymbolBar "1hr Funding" 与 FundingPanel "Real-Time Funding Rate" 展示一致
  const { data: fundingRateData } = useZtdxFundingRate(chainId, selectedSymbol ?? undefined);

  const marketLeverage = useMemo(() => {
    if (!selectedSymbol || !marketsData?.markets?.length) return null;

    const normalizedSymbol = `${selectedSymbol.split("-")[0]}USDT`.toUpperCase();
    const market = marketsData.markets.find((item) => item.symbol.toUpperCase() === normalizedSymbol);

    return market?.leverage ?? null;
  }, [marketsData, selectedSymbol]);

  return useMemo(() => {
    const priceDecimals = chartToken?.decimals != null ? 30 - chartToken.decimals : 30;
    const markPrice = bigIntToNumber(chartToken?.prices?.maxPrice, priceDecimals);
    const indexPrice = bigIntToNumber(chartToken?.prices?.minPrice, priceDecimals);

    const openInterestUsd =
      headerInfo?.openInterestLong != null && headerInfo?.openInterestShort != null
        ? bigIntToNumber(headerInfo.openInterestLong + headerInfo.openInterestShort, USD_DECIMALS)
        : safeNumber(ticker?.open_interest);

    // funding-rates/{symbol}.funding_rate_per_hour 优先,ticker/header 作为兜底
    const perHour = safeNumber(fundingRateData?.funding_rate_per_hour);
    const fundingRateLongBig = headerInfo?.fundingRateLong;
    const fundingFromHeader = fundingRateLongBig != null ? (Number(fundingRateLongBig) / 1e30) * 100 : null;
    const funding1hPct =
      perHour != null
        ? perHour * 100
        : fundingFromHeader ??
          (safeNumber(ticker?.funding_rate) != null ? safeNumber(ticker?.funding_rate)! * 100 : null);

    const change24hPct = safeNumber(ticker?.price_change_percent_24h);
    const volume24hUsd = safeNumber(ticker?.volume_24h);
    const nextFundingTs = normalizeTimestamp(safeNumber(ticker?.next_funding_time));

    return {
      symbol: symbol ?? "BTC",
      leverage: marketLeverage ?? 10,
      markPrice: markPrice ?? safeNumber(ticker?.last_price),
      indexPrice: indexPrice ?? safeNumber(ticker?.last_price),
      change24hPct,
      volume24hUsd,
      openInterestUsd,
      funding1hPct,
      nextFundingTs,
    };
  }, [chartToken, headerInfo, symbol, ticker, fundingRateData, marketLeverage]);
}

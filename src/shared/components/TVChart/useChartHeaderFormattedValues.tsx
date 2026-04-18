import cx from "classnames";
import { useMemo } from "react";
import type { Address } from "viem";

import { USD_DECIMALS } from "config/factors";
import { selectChartToken } from "context/SyntheticsStateContext/selectors/chartSelectors";
import { selectChartHeaderInfo } from "context/SyntheticsStateContext/selectors/chartSelectors";
import { selectChainId } from "context/SyntheticsStateContext/selectors/globalSelectors";
import { selectSelectedMarketPriceDecimals } from "context/SyntheticsStateContext/selectors/statsSelectors";
import {
  selectTradeboxMarketInfo,
  selectTradeboxTradeFlags,
} from "context/SyntheticsStateContext/selectors/tradeboxSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { useIsX10000Mode, useX10000State } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { use24hPriceDeltaMap } from "domain/synthetics/tokens";
import { use24hVolumes } from "domain/synthetics/tokens/use24Volumes";
import {
  formatAmountHuman,
  formatPercentageDisplay,
  formatRatePercentage,
  formatUsdPrice,
  numberWithCommas,
} from "lib/numbers";
import { useX10000Ticker } from "@/modules/cex/lib/api/custom/useX10000Markets";
import { getToken } from "sdk/configs/tokens";
import { bigMath } from "sdk/utils/bigmath";

import TooltipWithPortal from "components/Tooltip/TooltipWithPortal";

import LongIcon from "img/long.svg?react";
import ShortIcon from "img/short.svg?react";

import { AvailableLiquidityTooltip } from "./components/AvailableLiquidityTooltip";

function formatUsdCompactFromString(value?: string): string {
  const n = Number.parseFloat(value ?? "");
  if (!Number.isFinite(n)) return "...";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatPercentDisplayFromString(value?: string): string {
  if (!value) return "-";
  const trimmed = value.trim();
  const numeric = trimmed.endsWith("%") ? trimmed.slice(0, -1) : trimmed;
  const n = Number.parseFloat(numeric);
  if (!Number.isFinite(n)) return trimmed.endsWith("%") ? trimmed : `${trimmed}%`;
  return `${n.toFixed(2)}%`;
}

function trimTrailingZeros(numStr: string): string {
  if (numStr.includes(".")) {
    return numStr.replace(/\.?0+$/, "");
  }
  return numStr;
}

function formatSignedPercentWithSpaceFromNumber(value: number): string {
  const sign = value < 0 ? "-" : "+";
  const abs = Math.abs(value);
  const body = trimTrailingZeros(abs.toFixed(4));
  return `${sign} ${body}%`;
}

function normalizeSignedPercentWithSpace(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const hasPercent = trimmed.endsWith("%");
  const raw = hasPercent ? trimmed.slice(0, -1).trim() : trimmed;
  const first = raw[0];

  if (first === "+" || first === "-") {
    const sign = first;
    const rest = raw.slice(1).trim();
    return `${sign} ${rest}%`;
  }

  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return hasPercent ? trimmed : `${trimmed}%`;
  return formatSignedPercentWithSpaceFromNumber(n);
}

function deriveFundingRatePair(ticker: any): { long?: string; short?: string } {
  if (!ticker) return {};
  const directLong = normalizeSignedPercentWithSpace(ticker.funding_rate_long_1h);
  const directShort = normalizeSignedPercentWithSpace(ticker.funding_rate_short_1h);
  if (directLong || directShort) return { long: directLong, short: directShort };

  const perHourRaw = ticker.funding_rate_per_hour ?? ticker.funding_rate;
  if (!perHourRaw) return {};
  const s = String(perHourRaw).trim();
  const numeric = s.endsWith("%") ? s.slice(0, -1).trim() : s;
  const perHour = Number.parseFloat(numeric);
  if (!Number.isFinite(perHour)) return {};
  return {
    long: formatSignedPercentWithSpaceFromNumber(-perHour),
    short: formatSignedPercentWithSpaceFromNumber(perHour),
  };
}

export function useChartHeaderFormattedValues() {
  const chainId = useSelector(selectChainId);
  const info = useSelector(selectChartHeaderInfo);
  const { isSwap } = useSelector(selectTradeboxTradeFlags);
  const { chartToken } = useSelector(selectChartToken);
  const chartTokenAddress = chartToken?.address as Address;
  const oraclePriceDecimals = useSelector(selectSelectedMarketPriceDecimals);
  const marketInfo = useSelector(selectTradeboxMarketInfo);

  const selectedTokenOption = chartTokenAddress ? getToken(chainId, chartTokenAddress) : undefined;
  const visualMultiplier = isSwap ? 1 : selectedTokenOption?.visualMultiplier ?? 1;

  // ============================================
  // X10000 mode: use backend WebSocket ticker stream
  // ============================================
  const isX10000Mode = useIsX10000Mode();
  const { selectedSymbol: x10000SelectedSymbol } = useX10000State();
  const { data: x10000Ticker } = useX10000Ticker(isX10000Mode ? chainId : undefined, x10000SelectedSymbol ?? undefined);

  const x10000AvgPrice = useMemo(() => {
    if (!isX10000Mode) return null;
    const tickerAny = x10000Ticker as any;
    const price = tickerAny?.last_price ?? tickerAny?.mark_price ?? tickerAny?.index_price;
    const n = Number.parseFloat(price ?? "");
    if (!Number.isFinite(n)) return "...";

    // For very small prices, use more decimal places to show meaningful values
    let effectiveDecimals: number;
    if (n < 0.01) {
      // Find first significant digit and show 4 more
      const str = n.toFixed(10);
      const match = str.match(/^0\.0*[1-9]/);
      if (match) {
        effectiveDecimals = Math.min(match[0].length + 3, 10);
      } else {
        effectiveDecimals = 8;
      }
    } else if (n < 1) {
      effectiveDecimals = Math.max(oraclePriceDecimals, 4);
    } else {
      effectiveDecimals = Math.min(oraclePriceDecimals, 6);
    }

    return numberWithCommas(n.toFixed(effectiveDecimals), { showDollar: true });
  }, [isX10000Mode, x10000Ticker, oraclePriceDecimals]);

  const x10000DayPriceDelta = useMemo(() => {
    if (!isX10000Mode) return null;
    const pctStr = x10000Ticker?.price_change_percent_24h;
    const pctNum = Number.parseFloat((pctStr ?? "").replace("%", ""));
    return (
      <div
        className={cx("numbers", {
          positive: Number.isFinite(pctNum) && pctNum > 0,
          negative: Number.isFinite(pctNum) && pctNum < 0,
        })}
      >
        {pctStr ? formatPercentDisplayFromString(pctStr) : "-"}
      </div>
    );
  }, [isX10000Mode, x10000Ticker]);

  const x10000DailyVolume = useMemo(() => {
    if (!isX10000Mode) return null;
    const tickerAny = x10000Ticker as any;
    const v = tickerAny?.volume_24h_usd ?? tickerAny?.volume_24h;
    // volume_24h_usd is preferred, both are strings
    return <span className="numbers">{formatUsdCompactFromString(v)}</span>;
  }, [isX10000Mode, x10000Ticker]);

  const [x10000LongOIValue, x10000LongOIPercentage] = useMemo(() => {
    if (!isX10000Mode) return [null, null] as const;

    // Try detailed fields first
    const tickerAny = x10000Ticker as any;
    let long = tickerAny?.open_interest_long;
    let longPct = tickerAny?.open_interest_long_percent;

    // Fallback: if detailed fields are missing, derive from total OI
    if (!long && x10000Ticker?.open_interest) {
      console.log(' Using fallback OI logic:', {
        ticker: x10000Ticker,
        openInterest: x10000Ticker.open_interest,
        parsed: parseFloat(x10000Ticker.open_interest),
      });
           const totalOI = parseFloat(x10000Ticker.open_interest);
      if (Number.isFinite(totalOI) && totalOI > 0) {
        // Assume 50/50 split if no breakdown available
        long = String(totalOI / 2);
        longPct = "50";
      }
    }

    return [
      <>
        <LongIcon width={12} className="relative top-1 opacity-70" />
        <span key="x10000-long-oi" className="whitespace-nowrap numbers">
          {formatUsdCompactFromString(long)}
        </span>
      </>,
      longPct ? `${longPct}%` : null,
    ] as const;
  }, [isX10000Mode, x10000Ticker]);

  const [x10000ShortOIValue, x10000ShortOIPercentage] = useMemo(() => {
    if (!isX10000Mode) return [null, null] as const;

    // Try detailed fields first
    const tickerAny = x10000Ticker as any;
    let short = tickerAny?.open_interest_short;
    let shortPct = tickerAny?.open_interest_short_percent;

    // Fallback: if detailed fields are missing, derive from total OI
    if (!short && x10000Ticker?.open_interest) {
      const totalOI = parseFloat(x10000Ticker.open_interest);
      if (Number.isFinite(totalOI) && totalOI > 0) {
        // Assume 50/50 split if no breakdown available
        short = String(totalOI / 2);
        shortPct = "50";
      }
    }

    return [
      <>
        <ShortIcon width={12} className="relative opacity-70" />
        <span key="x10000-short-oi" className="whitespace-nowrap numbers">
          {formatUsdCompactFromString(short)}
        </span>
      </>,
      shortPct ? `${shortPct}%` : null,
    ] as const;
  }, [isX10000Mode, x10000Ticker]);

  const x10000LiquidityLong = useMemo(() => {
    if (!isX10000Mode) return null;
    return (
      <span className="flex items-center justify-center gap-4 numbers">
        <LongIcon width={12} className="relative top-1 opacity-70" />
        {formatUsdCompactFromString((x10000Ticker as any)?.available_liquidity_long)}
      </span>
    );
  }, [isX10000Mode, x10000Ticker]);

  const x10000LiquidityShort = useMemo(() => {
    if (!isX10000Mode) return null;
    return (
      <span className="flex items-center justify-center gap-4 numbers">
        <ShortIcon width={12} className="relative opacity-70" />
        {formatUsdCompactFromString((x10000Ticker as any)?.available_liquidity_short)}
      </span>
    );
  }, [isX10000Mode, x10000Ticker]);

  const x10000NetRateLong = useMemo(() => {
    if (!isX10000Mode) return null;
    const rate = deriveFundingRatePair(x10000Ticker).long;
    return (
      <span className={cx("flex flex-row items-center gap-4 numbers")}>
        <LongIcon width={12} className="relative top-1" />
        {rate ? rate : "..."}
      </span>
    );
  }, [isX10000Mode, x10000Ticker]);

  const x10000NetRateShort = useMemo(() => {
    if (!isX10000Mode) return null;
    const rate = deriveFundingRatePair(x10000Ticker).short;
    return (
      <span className={cx("flex flex-row items-center gap-4 numbers")}>
        <ShortIcon width={12} />
        {rate ? rate : "..."}
      </span>
    );
  }, [isX10000Mode, x10000Ticker]);

  const priceTokenAddress = useMemo(() => {
    if (selectedTokenOption?.isWrapped) {
      return selectedTokenOption.address;
    }

    return selectedTokenOption?.address;
  }, [selectedTokenOption]);

  const dailyVolumes = use24hVolumes();
  const dailyVolumesValue = marketInfo?.marketTokenAddress
    ? dailyVolumes?.byMarketToken?.[marketInfo?.marketTokenAddress]
    : undefined;
  const dayPriceDeltaMap = use24hPriceDeltaMap(chainId, [priceTokenAddress as Address]);
  const dayPriceDeltaData = chartTokenAddress ? dayPriceDeltaMap?.[chartTokenAddress] : undefined;

  const avgPriceValue = bigMath.avg(chartToken?.prices?.maxPrice, chartToken?.prices?.minPrice);

  const high24 = useMemo(() => {
    if (isX10000Mode) {
      const n = Number.parseFloat(x10000Ticker?.high_24h ?? "");
      if (!Number.isFinite(n)) return "-";

      // For very small prices, use more decimal places
      let effectiveDecimals: number;
      if (n < 0.01) {
        const str = n.toFixed(10);
        const match = str.match(/^0\.0*[1-9]/);
        effectiveDecimals = match ? Math.min(match[0].length + 3, 10) : 8;
      } else if (n < 1) {
        effectiveDecimals = Math.max(oraclePriceDecimals, 4);
      } else {
        effectiveDecimals = Math.min(oraclePriceDecimals, 6);
      }
      return numberWithCommas(n.toFixed(effectiveDecimals), { showDollar: true });
    }
    if (!dayPriceDeltaData?.high) {
      return "-";
    }

    let value = dayPriceDeltaData.high;
    if (!isSwap) {
      value = value * visualMultiplier;
    }

    return numberWithCommas(value.toFixed(oraclePriceDecimals), { showDollar: true });
  }, [isX10000Mode, x10000Ticker, dayPriceDeltaData, oraclePriceDecimals, visualMultiplier, isSwap]);

  const low24 = useMemo(() => {
    if (isX10000Mode) {
      const n = Number.parseFloat(x10000Ticker?.low_24h ?? "");
      if (!Number.isFinite(n)) return "-";

      // For very small prices, use more decimal places
      let effectiveDecimals: number;
      if (n < 0.01) {
        const str = n.toFixed(10);
        const match = str.match(/^0\.0*[1-9]/);
        effectiveDecimals = match ? Math.min(match[0].length + 3, 10) : 8;
      } else if (n < 1) {
        effectiveDecimals = Math.max(oraclePriceDecimals, 4);
      } else {
        effectiveDecimals = Math.min(oraclePriceDecimals, 6);
      }
      return numberWithCommas(n.toFixed(effectiveDecimals), { showDollar: true });
    }
    if (!dayPriceDeltaData?.low) {
      return "-";
    }

    let value = dayPriceDeltaData.low;
    if (!isSwap) {
      value = value * visualMultiplier;
    }

    return numberWithCommas(value.toFixed(oraclePriceDecimals), { showDollar: true });
  }, [isX10000Mode, x10000Ticker, dayPriceDeltaData, oraclePriceDecimals, visualMultiplier, isSwap]);

  const dayPriceDelta = useMemo(() => {
    if (isX10000Mode) {
      return x10000DayPriceDelta;
    }
    return (
      <div
        className={cx("numbers", {
          positive: dayPriceDeltaData?.deltaPercentage && dayPriceDeltaData?.deltaPercentage > 0,
          negative: dayPriceDeltaData?.deltaPercentage && dayPriceDeltaData?.deltaPercentage < 0,
        })}
      >
        {dayPriceDeltaData?.deltaPercentageStr || "-"}
      </div>
    );
  }, [isX10000Mode, x10000DayPriceDelta, dayPriceDeltaData]);

  const avgPrice = useMemo(() => {
    if (isX10000Mode) {
      return x10000AvgPrice || "...";
    }
    return (
      formatUsdPrice(avgPriceValue, {
        visualMultiplier,
      }) || "..."
    );
  }, [isX10000Mode, x10000AvgPrice, avgPriceValue, visualMultiplier]);

  const [longOIValue, longOIPercentage] = useMemo(() => {
    if (isX10000Mode) {
      return [x10000LongOIValue || "...", x10000LongOIPercentage] as const;
    }
    if (info?.longOpenInterestPercentage !== undefined && info.openInterestLong !== undefined) {
      return [
        <>
          <LongIcon width={12} className="relative top-1 opacity-70" />
          <span key="long-oi-value" className="whitespace-nowrap numbers">
            {formatAmountHuman(info?.openInterestLong, USD_DECIMALS, true)}
          </span>
        </>,
        formatPercentageDisplay(info.longOpenInterestPercentage),
      ];
    }

    return ["...", null];
  }, [isX10000Mode, x10000LongOIValue, x10000LongOIPercentage, info?.longOpenInterestPercentage, info?.openInterestLong]);

  const [shortOIValue, shortOIPercentage] = useMemo(() => {
    if (isX10000Mode) {
      return [x10000ShortOIValue || "...", x10000ShortOIPercentage] as const;
    }
    if (info?.shortOpenInterestPercentage !== undefined && info.openInterestShort !== undefined) {
      return [
        <>
          <ShortIcon width={12} className="relative opacity-70" />
          <span key="short-oi-value" className="whitespace-nowrap numbers">
            {formatAmountHuman(info?.openInterestShort, USD_DECIMALS, true)}
          </span>
        </>,
        formatPercentageDisplay(info.shortOpenInterestPercentage),
      ];
    }

    return ["...", null];
  }, [isX10000Mode, x10000ShortOIValue, x10000ShortOIPercentage, info?.shortOpenInterestPercentage, info?.openInterestShort]);

  const liquidityLong = useMemo(() => {
    if (isX10000Mode) {
      return x10000LiquidityLong || "...";
    }
    const liquidity = info?.liquidityLong;

    if (liquidity === undefined) {
      return "...";
    }

    return (
      <TooltipWithPortal
        variant="none"
        handle={
          <span className="flex items-center justify-center gap-4 numbers">
            <LongIcon width={12} className="relative top-1 opacity-70" />
            {formatAmountHuman(liquidity, USD_DECIMALS, true)}
          </span>
        }
        position="bottom-end"
        content={<AvailableLiquidityTooltip isLong />}
      />
    );
  }, [isX10000Mode, x10000LiquidityLong, info?.liquidityLong]);

  const liquidityShort = useMemo(() => {
    if (isX10000Mode) {
      return x10000LiquidityShort || "...";
    }
    const liquidity = info?.liquidityShort;

    if (liquidity === undefined) {
      return "...";
    }

    return (
      <TooltipWithPortal
        variant="none"
        handle={
          <span className="flex items-center justify-center gap-4 numbers">
            <ShortIcon width={12} className="relative opacity-70" />
            {formatAmountHuman(liquidity, USD_DECIMALS, true)}
          </span>
        }
        position="bottom-end"
        content={<AvailableLiquidityTooltip isLong={false} />}
      />
    );
  }, [isX10000Mode, x10000LiquidityShort, info?.liquidityShort]);

  const netRateLong = useMemo(() => {
    if (isX10000Mode) {
      return x10000NetRateLong || "...";
    }
    const netRate = info?.netRateHourlyLong;

    if (netRate === undefined) {
      return "...";
    }

    return (
      <span className={cx("flex flex-row items-center gap-4 numbers")}>
        <LongIcon width={12} className="relative top-1" />
        {formatRatePercentage(netRate)}
      </span>
    );
  }, [isX10000Mode, x10000NetRateLong, info]);

  const netRateShort = useMemo(() => {
    if (isX10000Mode) {
      return x10000NetRateShort || "...";
    }
    const netRate = info?.netRateHourlyShort;

    if (netRate === undefined) {
      return "...";
    }

    return (
      <span className={cx("flex flex-row items-center gap-4 numbers")}>
        <ShortIcon width={12} />
        {formatRatePercentage(netRate)}
      </span>
    );
  }, [isX10000Mode, x10000NetRateShort, info]);

  const dailyVolume = useMemo(() => {
    if (isX10000Mode) {
      return x10000DailyVolume || "...";
    }
    return dailyVolumesValue !== undefined ? (
      <span className="numbers">{formatAmountHuman(dailyVolumesValue, USD_DECIMALS, true)}</span>
    ) : (
      "..."
    );
  }, [isX10000Mode, x10000DailyVolume, dailyVolumesValue]);

  return {
    avgPrice,
    high24,
    low24,
    longOIValue,
    shortOIValue,
    longOIPercentage,
    shortOIPercentage,
    liquidityLong,
    liquidityShort,
    netRateLong,
    netRateShort,
    dailyVolume,
    dayPriceDelta,
    info: isX10000Mode ? (x10000Ticker as any) : info,
  };
}

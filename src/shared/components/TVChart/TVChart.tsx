import { useEffect, useMemo, useRef } from "react";

import { useX10000ChartLines } from "@/modules/cex/hooks/useX10000ChartLines";
import { isX10000ModeActive, useX10000State } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { SUPPORTED_RESOLUTIONS_V2 } from "config/tradingview";
import { selectChartToken } from "context/SyntheticsStateContext/selectors/chartSelectors";
import { selectChartLines } from "context/SyntheticsStateContext/selectors/chartSelectors/selectChartLines";
import { selectSetIsCandlesLoaded } from "context/SyntheticsStateContext/selectors/globalSelectors";
import { selectSelectedMarketVisualMultiplier } from "context/SyntheticsStateContext/selectors/statsSelectors";
import { useSelector } from "context/SyntheticsStateContext/utils";
import { useChainId } from "lib/chains";
import { CHART_PERIODS } from "lib/legacy";
import { useLocalStorageSerializeKey } from "lib/localStorage";

import TVChartContainer from "components/TVChartContainer/TVChartContainer";

import type { TVChartLayout } from "components/TVChartContainer/TVChartContainer";
import type { CrossHairMovedEventParams } from "../../charting_library";

import "./TVChart.scss";

const DEFAULT_PERIOD = "5m";

// Convert X10000 symbol format to chart symbol format (e.g., "BTC")
// Handles: "BTC-USD" -> "BTC", "BTCUSDT" -> "BTC", "BTCUSD" -> "BTC"
function convertX10000SymbolToChartSymbol(x10000Symbol: string): string {
  // Remove -USD, /USD, USD, USDT suffix to get base asset symbol
  return x10000Symbol
    .replace(/[-/]?USD[T]?$/i, "") // Remove suffix with optional separator
    .replace(/[-/]$/, ""); // Remove any trailing separator
}

export function TVChart({
  extraDisabledFeatures,
  removeEnabledFeatures,
  extraOverrides,
  studiesOverrides,
  onCrosshairMove,
  onLayoutChange,
  x10000VisiblePlotsSet,
  x10000VolumeMetric,
  createVolumeStudyOnReady,
  forcedPeriod,
  onPeriodChange,
  loadLastChart,
  disableAutoSave,
  chartName,
  brandName,
  customCssUrl,
  initialBarsCount,
}: {
  extraDisabledFeatures?: string[];
  removeEnabledFeatures?: string[];
  extraOverrides?: Record<string, any>;
  studiesOverrides?: Record<string, any>;
  onCrosshairMove?: (params: CrossHairMovedEventParams | null) => void;
  onLayoutChange?: (layout: TVChartLayout) => void;
  x10000VisiblePlotsSet?: "ohlcv" | "ohlc" | "c";
  x10000VolumeMetric?: "base" | "quote";
  createVolumeStudyOnReady?: boolean;
  forcedPeriod?: string;
  onPeriodChange?: (period: string) => void;
  loadLastChart?: boolean;
  disableAutoSave?: boolean;
  chartName?: string;
  brandName?: string;
  customCssUrl?: string;
  initialBarsCount?: number;
} = {}) {
  const { chainId } = useChainId();
  const { chartToken, symbol: chartTokenSymbol } = useSelector(selectChartToken);
  const visualMultiplier = useSelector(selectSelectedMarketVisualMultiplier);
  const setIsCandlesLoaded = useSelector(selectSetIsCandlesLoaded);

  // X10000 mode state
  const isX10000Mode = isX10000ModeActive();
  const { selectedSymbol: x10000SelectedSymbol } = useX10000State();

  let [period, setPeriod] = useLocalStorageSerializeKey([chainId, "Chart-period-v2"], DEFAULT_PERIOD);

  if (!period || !(period in CHART_PERIODS)) {
    period = DEFAULT_PERIOD;
  }

  const effectivePeriod = forcedPeriod && forcedPeriod in CHART_PERIODS ? forcedPeriod : period;
  const handlePeriodChange = onPeriodChange ?? setPeriod;

  const chartLines = useSelector(selectChartLines);

  // Get x10000 chart lines (entry, liq, TP/SL) for x10000 mode
  const x10000ChartLines = useX10000ChartLines();

  // Use appropriate chart lines based on mode
  const effectiveChartLines = isX10000Mode ? x10000ChartLines : chartLines;

  useEffect(
    function updatePeriod() {
      if (!period || !(period in CHART_PERIODS)) {
        setPeriod(DEFAULT_PERIOD);
      }
    },
    [period, setPeriod]
  );

  // Determine the symbol to display based on mode
  const effectiveSymbol = useMemo(() => {
    if (isX10000Mode && x10000SelectedSymbol) {
      return convertX10000SymbolToChartSymbol(x10000SelectedSymbol);
    }
    return chartTokenSymbol || "";
  }, [isX10000Mode, x10000SelectedSymbol, chartTokenSymbol]);

  // Use stable object reference for x10000 mode to prevent unnecessary re-renders
  const x10000ChartTokenRef = useRef<{ symbol: string; minPrice: bigint; maxPrice: bigint }>({
    symbol: "",
    minPrice: 0n,
    maxPrice: 0n,
  });

  // Memoize chartTokenProp to prevent unnecessary re-renders
  // Only create new object when symbol actually changes
  const chartTokenProp = useMemo(() => {
    if (chartToken && !isX10000Mode) {
      // Use existing chartToken object
      return {
        symbol: chartToken.symbol,
        ...chartToken.prices,
      };
    }
    // For x10000 mode, update ref only when symbol actually changes
    if (x10000ChartTokenRef.current.symbol !== effectiveSymbol) {
      x10000ChartTokenRef.current = {
        symbol: effectiveSymbol,
        minPrice: 0n,
        maxPrice: 0n,
      };
    }
    // Always return the ref object for stable reference
    return x10000ChartTokenRef.current;
  }, [chartToken, isX10000Mode, effectiveSymbol]);

  // In X10000 mode, show chart if we have a selected symbol
  // In normal mode, show chart if we have chartTokenSymbol
  const shouldShowChart = isX10000Mode ? !!effectiveSymbol : !!chartTokenSymbol;

  if (!shouldShowChart) {
    return null;
  }

  return (
    <div className="relative grow">
      <TVChartContainer
        chartLines={effectiveChartLines}
        chainId={chainId}
        period={effectivePeriod}
        setIsCandlesLoaded={setIsCandlesLoaded}
        visualMultiplier={isX10000Mode ? 1 : visualMultiplier}
        setPeriod={handlePeriodChange}
        chartToken={chartTokenProp}
        supportedResolutions={SUPPORTED_RESOLUTIONS_V2}
        extraDisabledFeatures={extraDisabledFeatures}
        removeEnabledFeatures={removeEnabledFeatures}
        extraOverrides={extraOverrides}
        studiesOverrides={studiesOverrides}
        onCrosshairMove={onCrosshairMove}
        onLayoutChange={onLayoutChange}
        x10000VisiblePlotsSet={x10000VisiblePlotsSet}
        x10000VolumeMetric={x10000VolumeMetric}
        createVolumeStudyOnReady={createVolumeStudyOnReady}
        loadLastChart={loadLastChart}
        disableAutoSave={disableAutoSave}
        chartName={chartName}
        brandName={brandName}
        customCssUrl={customCssUrl}
        initialBarsCount={initialBarsCount}
      />
    </div>
  );
}

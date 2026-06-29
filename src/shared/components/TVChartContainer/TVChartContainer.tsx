import { CSSProperties, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLatest, useLocalStorage, useMedia } from "react-use";

import { isX10000ModeActive } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { TV_SAVE_LOAD_CHARTS_KEY, WAS_TV_CHART_OVERRIDDEN_KEY } from "config/localStorage";
import { SUPPORTED_RESOLUTIONS_V1, SUPPORTED_RESOLUTIONS_V2 } from "config/tradingview";
import { useSettings } from "context/SettingsContext/SettingsContextProvider";
import { useTheme } from "context/ThemeContext/ThemeContext";
import { TokenPrices } from "domain/tokens";
import { DataFeed } from "domain/tradingview/DataFeed";
import { getObjectKeyFromValue, getSymbolName } from "domain/tradingview/utils";
import { X10000KlineDataFeed } from "domain/tradingview/X10000KlineDataFeed";
import { useOracleKeeperFetcher } from "lib/oracleKeeperFetcher";
import { useTradePageVersion } from "lib/useTradePageVersion";
import { isChartAvailableForToken } from "sdk/configs/tokens";

import Loader from "components/Loader/Loader";

import { chartOverridesDark, chartOverridesLight, defaultChartProps, disabledFeaturesOnMobile } from "./constants";
import { DynamicLines } from "./DynamicLines";
import { SaveLoadAdapter } from "./SaveLoadAdapter";
import { StaticLines } from "./StaticLines";
import type { StaticChartLine } from "./types";
import type {
  ChartData,
  ChartingLibraryWidgetOptions,
  CrossHairMovedEventParams,
  IChartingLibraryWidget,
  ResolutionString,
  VisibleTimeRange,
} from "../../charting_library";

export type TVChartLayout = {
  visibleRange: VisibleTimeRange;
  paneHeights: number[];
  mainPriceRange?: {
    from: number;
    to: number;
  };
};

const X10000_VOLUME_MA_STUDIES = [
  { length: 5, color: "#E0A23B" },
  { length: 10, color: "#8E61D7" },
  { length: 20, color: "#4D79FF" },
] as const;
const X10000_VOLUME_PANE_HEIGHT = 100;
const X10000_VOLUME_SCALE_TOP_PADDING = 0.24;

type Props = {
  chainId: number;
  chartLines: StaticChartLine[];
  period: string;
  setPeriod: (period: string) => void;
  chartToken:
    | ({
        symbol: string;
      } & TokenPrices)
    | { symbol: string };
  supportedResolutions: typeof SUPPORTED_RESOLUTIONS_V1 | typeof SUPPORTED_RESOLUTIONS_V2;
  visualMultiplier?: number;
  setIsCandlesLoaded?: (isCandlesLoaded: boolean) => void;
  /** 额外要禁用的 TradingView 内置功能(追加到默认 disabled_features 之后) */
  extraDisabledFeatures?: string[];
  /** 从默认 enabled_features 中要移除的功能(用于"反禁用"如 hide_left_toolbar_by_default) */
  removeEnabledFeatures?: string[];
  /** 额外覆盖的图表样式(合并到 chartOverridesDark/Light 之后) */
  extraOverrides?: Record<string, any>;
  /** 额外覆盖的 study 样式(合并到默认 volume studies_overrides 之后) */
  studiesOverrides?: Record<string, any>;
  onCrosshairMove?: (params: CrossHairMovedEventParams | null) => void;
  onLayoutChange?: (layout: TVChartLayout) => void;
  x10000VisiblePlotsSet?: "ohlcv" | "ohlc" | "c";
  x10000VolumeMetric?: "base" | "quote";
  createVolumeStudyOnReady?: boolean;
  loadLastChart?: boolean;
  disableAutoSave?: boolean;
  chartName?: string;
  /** 图表左上角图例显示的品牌名 (默认 GMX) */
  brandName?: string;
  /** 自定义 CSS URL,会注入 TradingView iframe (默认 /tradingview-chart.css) */
  customCssUrl?: string;
  /** 图表初始化后显示的 K 线根数(按当前 resolution) */
  initialBarsCount?: number;
};

// 把 "5m"/"1h" 等 resolution 字符串解析为秒数
function resolutionToSeconds(r: string): number {
  const m = /^(\d+)([mhdwy]|S|D|W|M)?$/i.exec(r);
  if (!m) return 60;
  const n = Number(m[1]);
  const u = (m[2] || "m").toLowerCase();
  switch (u) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86400;
    case "w":
      return n * 604800;
    default:
      return n * 60;
  }
}

export default function TVChartContainer({
  chartToken,
  chainId,
  chartLines,
  period,
  setPeriod,
  supportedResolutions,
  visualMultiplier,
  setIsCandlesLoaded,
  extraDisabledFeatures,
  removeEnabledFeatures,
  extraOverrides,
  studiesOverrides,
  onCrosshairMove,
  onLayoutChange,
  x10000VisiblePlotsSet,
  x10000VolumeMetric,
  createVolumeStudyOnReady,
  loadLastChart,
  disableAutoSave,
  chartName,
  brandName,
  customCssUrl,
  initialBarsCount,
}: Props) {
  const { shouldShowPositionLines } = useSettings();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const tvWidgetRef = useRef<IChartingLibraryWidget | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [isChartChangingSymbol, setIsChartChangingSymbol] = useState(false);
  const [chartDataLoading, setChartDataLoading] = useState(true);
  const [tvCharts, setTvCharts] = useLocalStorage<ChartData[] | undefined>(TV_SAVE_LOAD_CHARTS_KEY, []);
  const [wasChartOverridden, setWasChartOverridden] = useLocalStorage<boolean>(WAS_TV_CHART_OVERRIDDEN_KEY, false);

  const { theme } = useTheme();

  const [tradePageVersion] = useTradePageVersion();
  const resolvedChartName = chartName ?? `gmx-chart-v${tradePageVersion}`;

  const oracleKeeperFetcher = useOracleKeeperFetcher(chainId);

  // Check if we're in X10000 mode
  const isX10000Mode = isX10000ModeActive();

  const [datafeed, setDatafeed] = useState<DataFeed | X10000KlineDataFeed | null>(null);

  useEffect(() => {
    if (chartReady && tvWidgetRef.current && true) {
      const baseOverrides = theme === "light" ? chartOverridesLight : chartOverridesDark;
      const overrides = extraOverrides ? { ...baseOverrides, ...extraOverrides } : baseOverrides;
      tvWidgetRef.current.applyOverrides(overrides);
      if (!disableAutoSave) {
        tvWidgetRef.current.saveChartToServer();
        setWasChartOverridden(true);
      }
    }
  }, [chartReady, wasChartOverridden, setWasChartOverridden, theme, extraOverrides, disableAutoSave]);

  useEffect(() => {
    if (!chartReady || !tvWidgetRef.current) return;

    const activeChart = tvWidgetRef.current.activeChart();
    const preferredPeriod = getObjectKeyFromValue(period, supportedResolutions) as ResolutionString;
    const currentPeriod = activeChart.resolution();

    if (!preferredPeriod || currentPeriod === preferredPeriod) {
      return;
    }

    activeChart.setResolution(preferredPeriod, () => {
      const priceScale = activeChart.getPanes().at(0)?.getMainSourcePriceScale();
      if (priceScale) {
        priceScale.setAutoScale(true);
      }
    });
  }, [chartReady, period, supportedResolutions]);

  useEffect(() => {
    let newDatafeed: DataFeed | X10000KlineDataFeed;

    if (isX10000Mode) {
      // Use X10000 K-line datafeed for 10000x mode
      newDatafeed = new X10000KlineDataFeed(chainId, brandName, x10000VisiblePlotsSet, x10000VolumeMetric);
      // For X10000 mode, immediately mark candles as loaded (no prefetch needed)
      if (setIsCandlesLoaded) {
        setIsCandlesLoaded(true);
      }
    } else {
      // Use standard DataFeed for normal mode
      newDatafeed = new DataFeed(chainId, oracleKeeperFetcher, tradePageVersion, brandName);
      if (setIsCandlesLoaded) {
        newDatafeed.addEventListener("candlesDisplay.success", (event: Event) => {
          const isFirstDraw = (event as CustomEvent).detail.isFirstTimeLoad;
          if (isFirstDraw) {
            setIsCandlesLoaded(true);
          }
        });
      }
    }

    setDatafeed((prev) => {
      if (prev) {
        prev.destroy();
      }
      return newDatafeed;
    });
  }, [
    chainId,
    oracleKeeperFetcher,
    setIsCandlesLoaded,
    tradePageVersion,
    isX10000Mode,
    brandName,
    x10000VisiblePlotsSet,
    x10000VolumeMetric,
  ]);

  const isMobile = useMedia("(max-width: 550px)");
  const symbolRef = useRef(chartToken.symbol);
  const lastProcessedSymbolRef = useRef<string | undefined>(undefined);
  const isEnsuringVolumeStudiesRef = useRef(false);

  const enforceX10000VolumePaneHeight = useCallback(() => {
    if (!isX10000Mode || !createVolumeStudyOnReady || !tvWidgetRef.current) return;

    const activeChart = tvWidgetRef.current.activeChart();
    const paneHeights = activeChart.getAllPanesHeight();

    if (paneHeights.length < 2) return;

    const totalHeight = paneHeights.reduce((sum, height) => sum + height, 0);
    const volumePaneHeight = Math.min(X10000_VOLUME_PANE_HEIGHT, totalHeight - 120);

    if (volumePaneHeight <= 0) return;

    const nextPaneHeights = [...paneHeights];
    nextPaneHeights[1] = volumePaneHeight;
    nextPaneHeights[0] = Math.max(120, totalHeight - volumePaneHeight);

    activeChart.setAllPanesHeight(nextPaneHeights);
  }, [createVolumeStudyOnReady, isX10000Mode]);

  const enforceX10000VolumeScalePadding = useCallback(() => {
    if (!isX10000Mode || !createVolumeStudyOnReady || !tvWidgetRef.current) return;

    const volumePane = tvWidgetRef.current.activeChart().getPanes()[1];
    if (!volumePane) return;

    const priceScales = [
      ...volumePane.getRightPriceScales(),
      ...volumePane.getLeftPriceScales(),
      volumePane.getMainSourcePriceScale(),
    ].filter((scale, index, self): scale is NonNullable<typeof scale> => Boolean(scale) && self.indexOf(scale) === index);

    priceScales.forEach((priceScale) => {
      const visibleRange = priceScale.getVisiblePriceRange();
      if (!visibleRange) return;

      const topValue = Math.max(visibleRange.to, visibleRange.from);
      if (!Number.isFinite(topValue) || topValue <= 0) return;

      priceScale.setAutoScale(false);
      priceScale.setVisiblePriceRange({
        from: 0,
        to: topValue * (1 + X10000_VOLUME_SCALE_TOP_PADDING),
      });
    });
  }, [createVolumeStudyOnReady, isX10000Mode]);

  const ensureX10000VolumeStudies = useCallback(async () => {
    if (!isX10000Mode || !tvWidgetRef.current || isEnsuringVolumeStudiesRef.current) return;

    isEnsuringVolumeStudiesRef.current = true;

    try {
      const activeChart = tvWidgetRef.current.activeChart();
      const existingVolumeStudies = activeChart.getAllStudies().filter((study) => study.name === "Volume");

      existingVolumeStudies.forEach((study) => {
        activeChart.removeEntity(study.id);
      });

      const baseStudyId = await activeChart.createStudy("Volume", false, false, { showMA: false });
      const baseStudy = activeChart.getStudyById(baseStudyId);

      baseStudy.applyOverrides({
        "volume.display": 15,
        "volume ma:plot.display": 0,
        "smoothed ma.display": 0,
      });

      for (const config of X10000_VOLUME_MA_STUDIES) {
        const studyId = await activeChart.createStudy("Volume", false, false, {
          showMA: true,
          length: config.length,
          volumeMA: "SMA",
        });
        const study = activeChart.getStudyById(studyId);

        study.applyOverrides({
          "volume.display": 0,
          "volume ma:plot.display": 15,
          "volume ma:plot.color": config.color,
          "volume ma:plot.linewidth": 1,
          "smoothed ma.display": 0,
        });
        study.mergeUp();
        study.changePriceScale(baseStudyId);
      }

      requestAnimationFrame(() => {
        enforceX10000VolumePaneHeight();
        enforceX10000VolumeScalePadding();
      });
    } catch (error) {
      console.error("[TVChartContainer] Failed to ensure X10000 Volume MA studies:", error);
    } finally {
      isEnsuringVolumeStudiesRef.current = false;
    }
  }, [enforceX10000VolumePaneHeight, enforceX10000VolumeScalePadding, isX10000Mode]);

  useEffect(() => {
    // In X10000 mode, we don't check isChartAvailableForToken since we use backend data
    const symbolAvailable = isX10000Mode || isChartAvailableForToken(chainId, chartToken.symbol);

    if (!chartReady || !tvWidgetRef.current || !chartToken.symbol || !symbolAvailable || isChartChangingSymbol) {
      return;
    }

    // For X10000 mode, use symbol directly without multiplier
    const newSymbolWithMultiplier = isX10000Mode
      ? chartToken.symbol
      : getSymbolName(chartToken.symbol, visualMultiplier);

    // Skip if we've already processed this exact symbol
    if (newSymbolWithMultiplier === lastProcessedSymbolRef.current) {
      return;
    }

    const currentSymbolInfo = tvWidgetRef.current?.activeChart().symbolExt();
    const currentSymbolWithMultiplier = currentSymbolInfo
      ? isX10000Mode
        ? currentSymbolInfo.name
        : getSymbolName(
            currentSymbolInfo.name,
            currentSymbolInfo.unit_id ? parseInt(currentSymbolInfo.unit_id) : undefined
          )
      : undefined;

    // Only update if symbol actually changed
    if (newSymbolWithMultiplier !== currentSymbolWithMultiplier && newSymbolWithMultiplier) {
      lastProcessedSymbolRef.current = newSymbolWithMultiplier;
      symbolRef.current = chartToken.symbol;
      setIsChartChangingSymbol(true);

      tvWidgetRef.current.setSymbol(newSymbolWithMultiplier, tvWidgetRef.current.activeChart().resolution(), () => {
        const priceScale = tvWidgetRef.current?.activeChart().getPanes().at(0)?.getMainSourcePriceScale();
        if (priceScale) {
          priceScale.setAutoScale(true);
        }

        // For X10000 mode, ensure Volume indicator exists after symbol change
        if (isX10000Mode && createVolumeStudyOnReady) {
          void ensureX10000VolumeStudies();
        } else if (isX10000Mode && !createVolumeStudyOnReady && tvWidgetRef.current) {
          try {
            const activeChart = tvWidgetRef.current.activeChart();
            const studies = activeChart.getAllStudies();
            const hasVolume = studies.some((study) => study.name === "Volume");

            if (!hasVolume) {
              activeChart.createStudy(
                "Volume",
                false, // overlay = false (separate pane below main chart)
                false, // lock = false
                {
                  "plot.color.0": "#2962ff",
                  "plot.linewidth.0": 1,
                  "volume.ma.color": "#ff9800",
                  "volume.ma.transparency": 80,
                  "volume.ma.linewidth": 1,
                  "volume.ma.display": "MA",
                  "volume.ma length": 20,
                }
              );
              console.log("[TVChartContainer] Volume indicator added after symbol change");
            } else {
              console.log("[TVChartContainer] Volume indicator already exists after symbol change");
            }
          } catch (error) {
            console.error("[TVChartContainer] Failed to add Volume indicator after symbol change:", error);
          }
        }

        setIsChartChangingSymbol(false);
      });
    }
  }, [
    chainId,
    chartReady,
    chartToken.symbol,
    visualMultiplier,
    isX10000Mode,
    isChartChangingSymbol,
    createVolumeStudyOnReady,
    ensureX10000VolumeStudies,
  ]);

  const lastPeriod = useLatest(period);
  const lastSupportedResolutions = useLatest(supportedResolutions);

  useLayoutEffect(() => {
    // Only prefetch bars for standard DataFeed (not X10000KlineDataFeed)
    if (symbolRef.current && datafeed && !isX10000Mode && "prefetchBars" in datafeed) {
      datafeed.prefetchBars(
        symbolRef.current,
        getObjectKeyFromValue(lastPeriod.current, lastSupportedResolutions.current) as ResolutionString
      );
    }
  }, [datafeed, lastPeriod, lastSupportedResolutions, isX10000Mode]);

  useEffect(() => {
    if (!datafeed) return;

    // For X10000 mode, use symbol directly; for normal mode, add multiplier prefix
    const initialSymbol = isX10000Mode
      ? symbolRef.current
      : symbolRef.current && getSymbolName(symbolRef.current, visualMultiplier);

    // eslint-disable-next-line no-console

    const widgetOptions: ChartingLibraryWidgetOptions = {
      debug: false,
      symbol: initialSymbol, // For X10000 mode, use symbol directly without multiplier prefix
      datafeed,
      theme: theme,
      container: chartContainerRef.current!,
      library_path: defaultChartProps.library_path,
      locale: defaultChartProps.locale,
      loading_screen:
        theme === "light"
          ? { backgroundColor: "#FFFFFF", foregroundColor: "#2962ff" }
          : defaultChartProps.loading_screen,
      enabled_features: removeEnabledFeatures
        ? defaultChartProps.enabled_features.filter((f) => !removeEnabledFeatures.includes(f as string))
        : defaultChartProps.enabled_features,
      disabled_features: (isMobile
        ? defaultChartProps.disabled_features.concat(disabledFeaturesOnMobile)
        : defaultChartProps.disabled_features
      ).concat((extraDisabledFeatures ?? []) as any),
      client_id: defaultChartProps.client_id,
      user_id: defaultChartProps.user_id,
      fullscreen: defaultChartProps.fullscreen,
      autosize: defaultChartProps.autosize,
      custom_css_url: customCssUrl ?? defaultChartProps.custom_css_url,
      overrides: {
        ...(theme === "light" ? chartOverridesLight : chartOverridesDark),
        ...(extraOverrides ?? {}),
      } as any,
      studies_overrides: {
        ...(!createVolumeStudyOnReady
          ? {
              "volume.show ma": false,
            }
          : {}),
        ...(studiesOverrides ?? {}),
      },
      interval: getObjectKeyFromValue(period, supportedResolutions) as ResolutionString,
      favorites: { ...defaultChartProps.favorites, intervals: Object.keys(supportedResolutions) as ResolutionString[] },
      custom_formatters: defaultChartProps.custom_formatters,
      load_last_chart: loadLastChart ?? true,
      auto_save_delay: 1,
      save_load_adapter: new SaveLoadAdapter(tvCharts, setTvCharts, tradePageVersion),
    };
    let didTriggerOnChartReady = { current: false };
    let forceInitTimeout: ReturnType<typeof setTimeout> | undefined;
    let readyPollTimer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const initChart = () => {
      // charting_library.standalone.js is loaded `async` in index.html, so
      // window.TradingView can still be undefined when this effect first runs.
      // initChart() is only called once it's available (see waiter below), but
      // guard here too in case the effect was cleaned up while waiting.
      if (cancelled || !chartContainerRef.current || !window.TradingView?.widget) return;

      tvWidgetRef.current = new window.TradingView.widget(widgetOptions);

      tvWidgetRef.current!.onChartReady(function () {
      didTriggerOnChartReady.current = true;
      setChartReady(true);

      const emitLayout = () => {
        const activeChart = tvWidgetRef.current?.activeChart();
        if (!activeChart || !onLayoutChange) return;

        const mainPriceScale = activeChart.getPanes().at(0)?.getMainSourcePriceScale();
        const mainPriceRange = mainPriceScale?.getVisiblePriceRange();

        onLayoutChange({
          visibleRange: activeChart.getVisibleRange(),
          paneHeights: activeChart.getAllPanesHeight(),
          mainPriceRange: mainPriceRange
            ? {
                from: mainPriceRange.from,
                to: mainPriceRange.to,
              }
            : undefined,
        });
      };

      const savedPeriod = tvWidgetRef.current?.activeChart().resolution();
      const preferredPeriod = getObjectKeyFromValue(period, supportedResolutions) as ResolutionString;

      if (savedPeriod && savedPeriod !== preferredPeriod) {
        tvWidgetRef.current?.activeChart().setResolution(preferredPeriod);
      }

      // 按 initialBarsCount 设置初始可见范围(匹配 Lighter 的 K 线数量)
      if (initialBarsCount && initialBarsCount > 0) {
        try {
          const activeChart = tvWidgetRef.current?.activeChart();
          const res = activeChart?.resolution() ?? "5";
          const secPerBar = resolutionToSeconds(res);
          const now = Math.floor(Date.now() / 1000);
          activeChart?.setVisibleRange({
            from: now - initialBarsCount * secPerBar,
            to: now,
          });
        } catch (e) {
          // 忽略
        }
      }

      if (createVolumeStudyOnReady && tvWidgetRef.current) {
        void (async () => {
          try {
            await ensureX10000VolumeStudies();
            requestAnimationFrame(() => enforceX10000VolumePaneHeight());
            requestAnimationFrame(() => enforceX10000VolumeScalePadding());
            requestAnimationFrame(() => emitLayout());
            setTimeout(() => emitLayout(), 0);
          } catch (error) {
            console.error("[TVChartContainer] Failed to create Volume study on ready:", error);
          }
        })();
      }

      // For X10000 mode, manually add Volume indicator to ensure it's displayed
      if (isX10000Mode && !createVolumeStudyOnReady && tvWidgetRef.current) {
        try {
          const activeChart = tvWidgetRef.current.activeChart();
          // Check if Volume indicator already exists
          const studies = activeChart.getAllStudies();
          const hasVolume = studies.some((study) => study.name === "Volume");

          if (!hasVolume) {
            // Create Volume indicator in a separate pane (overlay = false)
            // This will display volume bars below the main chart
            activeChart.createStudy(
              "Volume",
              false, // overlay = false (separate pane below main chart)
              false, // lock = false
              {
                "plot.color.0": "#2962ff",
                "plot.linewidth.0": 1,
                "volume.ma.color": "#ff9800",
                "volume.ma.transparency": 80,
                "volume.ma.linewidth": 1,
                "volume.ma.display": "MA",
                "volume.ma length": 20,
              }
            );
            console.log("[TVChartContainer] Volume indicator added for X10000 mode");
          } else {
            console.log("[TVChartContainer] Volume indicator already exists");
          }
        } catch (error) {
          console.error("[TVChartContainer] Failed to add Volume indicator:", error);
        }
      }

      tvWidgetRef.current
        ?.activeChart()
        .onIntervalChanged()
        .subscribe(null, (interval) => {
          if (supportedResolutions[interval]) {
            const period = supportedResolutions[interval];
            setPeriod(period);
            if (!disableAutoSave) {
              tvWidgetRef.current?.saveChartToServer(undefined, undefined, {
                chartName: resolvedChartName,
              });
            }

            const priceScale = tvWidgetRef.current?.activeChart().getPanes().at(0)?.getMainSourcePriceScale();
            if (priceScale) {
              priceScale.setAutoScale(true);
            }
          }

          emitLayout();
        });

      tvWidgetRef.current?.activeChart().onVisibleRangeChanged().subscribe(null, () => {
        emitLayout();
      });

      tvWidgetRef.current?.activeChart().crossHairMoved().subscribe(null, (params) => {
        onCrosshairMove?.(params ?? null);
      });

      tvWidgetRef.current?.subscribe("onAutoSaveNeeded", () => {
        if (!disableAutoSave) {
          tvWidgetRef.current?.saveChartToServer(undefined, undefined, {
            chartName: resolvedChartName,
          });
        }
      });

      tvWidgetRef.current?.activeChart().dataReady(() => {
        setChartDataLoading(false);
        enforceX10000VolumePaneHeight();
        enforceX10000VolumeScalePadding();
        emitLayout();
      });
    });

    /*
    For some reason on prod TV sometimes does not get initialized properly,
    for these cases we wait some fixed amount of time and force TV into initialization
    */

    forceInitTimeout = setTimeout(() => {
      if (didTriggerOnChartReady.current || !chartContainerRef.current) {
        return;
      }

      const iframe = chartContainerRef.current.querySelector("iframe");

      if (!iframe || !iframe.contentWindow) {
        return;
      }
      const iframeWindow = iframe.contentWindow;
      const iframeDocument = iframeWindow.document;

      if (iframeDocument.readyState !== "complete") {
        iframeDocument.addEventListener("readystatechange", () => {
          if (iframeDocument.readyState === "complete") {
            iframeWindow.dispatchEvent(new Event("innerWindowLoad"));
          }
        });
      } else {
        iframeWindow.dispatchEvent(new Event("innerWindowLoad"));
      }
    }, 800);
    };

    // Build the widget as soon as the async-loaded charting_library has defined
    // window.TradingView. Without this wait the effect could call
    // `new window.TradingView.widget(...)` on an undefined global, throwing
    // "Cannot read properties of undefined (reading 'widget')" — which the
    // Sentry ErrorBoundary swallows, leaving the chart panel blank (no K-line).
    if (window.TradingView?.widget) {
      initChart();
    } else {
      readyPollTimer = setInterval(() => {
        if (window.TradingView?.widget) {
          clearInterval(readyPollTimer);
          readyPollTimer = undefined;
          initChart();
        }
      }, 50);
    }

    return () => {
      cancelled = true;
      if (readyPollTimer) clearInterval(readyPollTimer);
      if (forceInitTimeout) clearTimeout(forceInitTimeout);
      onCrosshairMove?.(null);
      if (tvWidgetRef.current) {
        tvWidgetRef.current.remove();
        tvWidgetRef.current = null;
        setChartReady(false);
        setChartDataLoading(true);
      }
    };
    // We don't want to re-initialize the chart when the symbol changes. This will make the chart flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chainId,
    datafeed,
    theme,
    onLayoutChange,
    createVolumeStudyOnReady,
    enforceX10000VolumePaneHeight,
    enforceX10000VolumeScalePadding,
    ensureX10000VolumeStudies,
  ]);

  const style = useMemo<CSSProperties>(
    () => ({ visibility: !chartDataLoading ? "visible" : "hidden" }),
    [chartDataLoading]
  );

  return (
    <div className="ExchangeChart-error">
      {chartDataLoading && <Loader />}
      <div style={style} ref={chartContainerRef} className="ExchangeChart-bottom-content" />
      {shouldShowPositionLines && chartReady && !isChartChangingSymbol && (
        <>
          <StaticLines tvWidgetRef={tvWidgetRef} chartLines={chartLines} />
          {tradePageVersion === 2 && <DynamicLines isMobile={isMobile} tvWidgetRef={tvWidgetRef} />}
        </>
      )}
    </div>
  );
}

/**
 * Spot TradingView chart. Uses the same `charting_library.standalone.js`
 * that perp mounts from `index.html` (`<script async src="/charting_library/…"/>`)
 * — we just wait for `window.TradingView.widget` to be defined, then
 * instantiate a widget with our SpotDataFeed.
 *
 * Kept intentionally minimal (no `save_load_adapter`, no theme system,
 * no perp overrides). If we ever want the full workspace/save features
 * shared with perp, refactor TVChartContainer to accept an injected
 * `datafeed` prop and reuse it here.
 */

import { useEffect, useRef, useState } from "react";

import panelStyles from "@/modules/lighter/components/ChartPanel/ChartPanel.module.scss";
import { ChartTimeframeControls, type ChartTimeframe } from "@/modules/lighter/components/ChartPanel/ChartTimeframeControls";
import type { ChartingLibraryWidgetOptions, IChartingLibraryWidget, ResolutionString, SeriesType } from "charting_library";

import Loader from "components/Loader/Loader";

import styles from "./SpotChart.module.scss";
import { SpotDataFeed } from "./SpotDataFeed";
import type { SpotMarket } from "../../model/spotMarkets";

// Wait up to 10s for the async <script> in index.html to attach the widget factory.
const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 10_000;

type TVFactory = new (o: ChartingLibraryWidgetOptions) => IChartingLibraryWidget;

function loadTVWidget(): Promise<TVFactory> {
  return new Promise((resolve, reject) => {
    let elapsed = 0;
    const check = () => {
      const tv = (window as unknown as { TradingView?: { widget?: TVFactory } }).TradingView;
      if (tv?.widget) return resolve(tv.widget);
      elapsed += POLL_INTERVAL_MS;
      if (elapsed >= POLL_TIMEOUT_MS) {
        return reject(new Error("TradingView charting_library did not load within 10s"));
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
  });
}

const DEFAULT_TIMEFRAME: ChartTimeframe = "15m";
const TIMEFRAME_RESOLUTIONS: Record<ChartTimeframe, ResolutionString> = {
  "1m": "1" as ResolutionString,
  "5m": "5" as ResolutionString,
  "15m": "15" as ResolutionString,
  "1h": "60" as ResolutionString,
  "4h": "240" as ResolutionString,
  "1d": "1D" as ResolutionString,
  "1w": "1W" as ResolutionString,
  "1M": "1M" as ResolutionString,
};
const CHART_HIDDEN_STYLE = { visibility: "hidden" } as const;
const CHART_VISIBLE_STYLE = { visibility: "visible" } as const;
const SPOT_CHART_TYPES: { label: string; value: SeriesType }[] = [
  { label: "Candles", value: 1 as SeriesType },
  { label: "Bars", value: 0 as SeriesType },
  { label: "Line", value: 2 as SeriesType },
  { label: "Area", value: 3 as SeriesType },
];

export function SpotChart({ market }: { market: SpotMarket }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<IChartingLibraryWidget | null>(null);
  const selectedTimeframeRef = useRef<ChartTimeframe>(DEFAULT_TIMEFRAME);
  const [err, setErr] = useState<string | null>(null);
  const [chartDataLoading, setChartDataLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(DEFAULT_TIMEFRAME);
  const [widgetReady, setWidgetReady] = useState(false);
  const [chartType, setChartType] = useState<SeriesType>(1 as SeriesType);
  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  const [chartElementsOpen, setChartElementsOpen] = useState(false);
  const [rawPrices, setRawPrices] = useState(true);

  const selectTimeframe = (nextTimeframe: ChartTimeframe) => {
    selectedTimeframeRef.current = nextTimeframe;
    setTimeframe(nextTimeframe);
    try {
      widgetRef.current?.activeChart().setResolution(TIMEFRAME_RESOLUTIONS[nextTimeframe]);
    } catch (_error) {
      /* chart is still starting; the selected interval is applied at construction */
    }
  };

  const openIndicators = () => {
    try {
      widgetRef.current?.activeChart().executeActionById("insertIndicator");
    } catch (_error) {
      /* chart is not ready */
    }
  };

  const selectChartType = (nextChartType: SeriesType) => {
    setChartTypeOpen(false);
    try {
      widgetRef.current?.activeChart().setChartType(nextChartType);
      setChartType(nextChartType);
    } catch (_error) {
      /* chart is not ready */
    }
  };

  const toggleRawPrices = () => {
    const nextRawPrices = !rawPrices;
    setRawPrices(nextRawPrices);
    try {
      widgetRef.current?.applyOverrides({
        "mainSeriesProperties.showPriceLine": nextRawPrices,
        "mainSeriesProperties.priceLineColor": "#E64558",
      });
    } catch (_error) {
      /* chart is not ready */
    }
  };

  const takeScreenshot = async () => {
    try {
      const canvas = await widgetRef.current?.takeClientScreenshot();
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `${market.routeSymbol}-${timeframe}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (_error) {
      /* screenshot is unavailable while the chart is starting */
    }
  };

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    setErr(null);
    setChartDataLoading(true);
    setWidgetReady(false);

    (async () => {
      let Widget: TVFactory;
      try {
        Widget = await loadTVWidget();
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
        return;
      }
      if (cancelled) return;

      const options: ChartingLibraryWidgetOptions = {
        symbol: market.routeSymbol,
        interval: TIMEFRAME_RESOLUTIONS[selectedTimeframeRef.current],
        container,
        datafeed: new SpotDataFeed(),
        library_path: "/charting_library/",
        locale: "en",
        theme: "dark",
        autosize: true,
        client_id: "rocky.exchange",
        user_id: "spot-user",
        fullscreen: false,
        disabled_features: [
          "header_symbol_search",
          "header_compare",
          "header_saveload",
          "header_resolutions",
          "header_chart_type",
          "header_indicators",
          "header_settings",
          "header_screenshot",
          "header_fullscreen_button",
          "header_widget",
          "timeframes_toolbar",
          "control_bar",
          "border_around_the_chart",
          "main_series_scale_menu",
          "symbol_search_hot_key",
          "use_localstorage_for_settings",
          "study_templates",
        ],
        enabled_features: [],
        loading_screen: { backgroundColor: "#121218", foregroundColor: "#8f93a2" },
        overrides: {
          "paneProperties.background": "#121218",
          "paneProperties.backgroundType": "solid",
          "paneProperties.vertGridProperties.color": "#1e1e26",
          "paneProperties.horzGridProperties.color": "#1e1e26",
          "scalesProperties.textColor": "#8f93a2",
          "scalesProperties.lineColor": "#2b2b30",
          "mainSeriesProperties.candleStyle.upColor": "#1bd289",
          "mainSeriesProperties.candleStyle.downColor": "#ff384f",
          "mainSeriesProperties.candleStyle.borderUpColor": "#1bd289",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ff384f",
          "mainSeriesProperties.candleStyle.wickUpColor": "#1bd289",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ff384f",
        },
      };

      try {
        const widget = new Widget(options);
        widgetRef.current = widget;
        widget.onChartReady(() => {
          if (cancelled) return;
          setWidgetReady(true);
          widget.activeChart().dataReady(() => {
            if (!cancelled) setChartDataLoading(false);
          });
        });
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      const w = widgetRef.current;
      if (w) {
        try {
          w.remove();
        } catch (_error) {
          /* removed already */
        }
        widgetRef.current = null;
      }
    };
  }, [market.routeSymbol]);

  return (
    <div className={styles.wrap}>
      <div className={panelStyles.toolbar} data-testid="spot-chart-toolbar">
        <div className={panelStyles.tfs}>
          <ChartTimeframeControls value={timeframe} onChange={selectTimeframe} />
          <span className={panelStyles.sep} />
          <button
            type="button"
            className={panelStyles.iconBtn}
            aria-label="Indicators"
            title="Indicators"
            onClick={openIndicators}
            disabled={!widgetReady}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M3.53 6.8h7" strokeLinecap="round" />
              <path d="m9.48 10.01 4 4m-4 0 4-4" strokeLinecap="round" />
              <path d="M2.53 12.3h1.83a2 2 0 0 0 1.97-1.64l1.4-7.72A2 2 0 0 1 9.7 1.3h1.83" strokeLinecap="round" />
            </svg>
          </button>
          <span className={panelStyles.sep} />
          <div className={panelStyles.moreWrap}>
            <button
              type="button"
              className={panelStyles.iconBtn}
              aria-label="Chart type"
              title="Chart type"
              aria-haspopup="listbox"
              aria-expanded={chartTypeOpen}
              onClick={() => setChartTypeOpen((open) => !open)}
              disabled={!widgetReady}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3.33 10.67V9.33M8 14v-1.33m4.67-4V7.33m-9.34-2V4M8 8.67V7.33m4.67-4V2" />
                <path d="M4.67 5.73v3.2a.4.4 0 0 1-.4.4H2.4a.4.4 0 0 1-.4-.4v-3.2a.4.4 0 0 1 .4-.4h1.87a.4.4 0 0 1 .4.4Zm4.66 3.34v3.2a.4.4 0 0 1-.4.4H7.07a.4.4 0 0 1-.4-.4v-3.2a.4.4 0 0 1 .4-.4h1.86a.4.4 0 0 1 .4.4ZM14 3.73v3.2a.4.4 0 0 1-.4.4h-1.87a.4.4 0 0 1-.4-.4v-3.2a.4.4 0 0 1 .4-.4h1.87a.4.4 0 0 1 .4.4Z" />
              </svg>
            </button>
            {chartTypeOpen && (
              <div className={panelStyles.moreMenu} role="listbox">
                {SPOT_CHART_TYPES.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    role="option"
                    aria-selected={chartType === option.value}
                    className={`${panelStyles.moreItem}${
                      chartType === option.value ? ` ${panelStyles.moreItemActive}` : ""
                    }`}
                    onClick={() => selectChartType(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className={panelStyles.sep} />
          <div className={panelStyles.moreWrap}>
            <button
              type="button"
              className={panelStyles.tool}
              title="Chart Elements"
              aria-haspopup="menu"
              aria-expanded={chartElementsOpen}
              onClick={() => setChartElementsOpen((open) => !open)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 8h5.5M8 4h5.5M8 12h5.5" />
                <path d="m2.5 4 1 1 2-2m-3 5 1 1 2-2m-3 5 1 1 2-2" />
              </svg>
              Chart Elements
            </button>
            {chartElementsOpen && (
              <div className={panelStyles.moreMenu} role="menu">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={rawPrices}
                  className={`${panelStyles.moreItem}${rawPrices ? ` ${panelStyles.moreItemActive}` : ""}`}
                  onClick={toggleRawPrices}
                >
                  Raw Prices {rawPrices ? "✓" : ""}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={panelStyles.toolsRight}>
          <button
            type="button"
            className={panelStyles.iconBtn}
            aria-label="screenshot"
            onClick={() => void takeScreenshot()}
            disabled={!widgetReady}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 5h3l1.5-2h3L11 5h3v9H2z" />
              <circle cx="8" cy="9" r="2.5" />
            </svg>
          </button>
        </div>
      </div>
      <div className={styles.chartBody}>
        {err ? (
          <div className={styles.loading}>chart: {err}</div>
        ) : (
          <>
            {chartDataLoading && <Loader variant={1} />}
            <div
              ref={containerRef}
              className={styles.container}
              data-testid="spot-chart-container"
              style={chartDataLoading ? CHART_HIDDEN_STYLE : CHART_VISIBLE_STYLE}
            />
          </>
        )}
      </div>
    </div>
  );
}

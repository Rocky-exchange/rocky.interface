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

import type { ChartingLibraryWidgetOptions, IChartingLibraryWidget, ResolutionString } from "charting_library";

import { SpotDataFeed } from "./SpotDataFeed";
import styles from "./SpotChart.module.scss";

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

const DEFAULT_INTERVAL: ResolutionString = "5" as ResolutionString;

export function SpotChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<IChartingLibraryWidget | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

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
        symbol,
        interval: DEFAULT_INTERVAL,
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
        widgetRef.current = new Widget(options);
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
        } catch {
          /* removed already */
        }
        widgetRef.current = null;
      }
    };
  }, [symbol]);

  return (
    <div className={styles.wrap}>
      {err ? (
        <div className={styles.loading}>chart: {err}</div>
      ) : (
        <div ref={containerRef} className={styles.container} />
      )}
    </div>
  );
}

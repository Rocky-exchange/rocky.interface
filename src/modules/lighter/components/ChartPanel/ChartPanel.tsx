import cx from "classnames";
import { useState } from "react";

import { TVChart } from "components/TVChart/TVChart";

import styles from "./ChartPanel.module.scss";
import { DetailsPanel } from "./DetailsPanel";
import { FundingPanel } from "./FundingPanel";
import { LighterDepthChart } from "./LighterDepthChart";
import { LIGHTER_DEPTH_CHART_THEME } from "./lighterDepthChartTheme";
import { LighterOriginalChart } from "./LighterOriginalChart";

// 用 TV widget 配置压平为 Lighter 风格:纯黑底、隐藏内置 toolbar/symbol-info、保留左侧画线工具
const LIGHTER_TV_DISABLED: string[] = [
  "header_resolutions",
  "header_chart_type",
  "header_indicators",
  "header_settings",
  "header_screenshot",
  "header_fullscreen_button",
  "header_widget", // 整个顶部 header(含 OHLC 行)
  "timeframes_toolbar",
  "control_bar",
  "border_around_the_chart",
  "main_series_scale_menu",
  "study_templates",
];

const LIGHTER_TV_OVERRIDES: Record<string, any> = {
  "paneProperties.background": "#121218",
  "paneProperties.backgroundGradientStartColor": "#121218",
  "paneProperties.backgroundGradientEndColor": "#121218",
  "paneProperties.backgroundType": "solid",
  "paneProperties.vertGridProperties.color": "#1F1F24",
  "paneProperties.vertGridProperties.style": 0,
  "paneProperties.horzGridProperties.color": "#1F1F24",
  "paneProperties.horzGridProperties.style": 0,
  "paneProperties.crossHairProperties.color": "#515155",
  "scalesProperties.backgroundColor": "#121218",
  "scalesProperties.lineColor": "rgba(0,0,0,0)",
  "scalesProperties.textColor": "#B4B4B6",
  "mainSeriesProperties.priceLineColor": "#515155",
  "mainSeriesProperties.candleStyle.upColor": "#00B26B",
  "mainSeriesProperties.candleStyle.downColor": "#E64558",
  "mainSeriesProperties.candleStyle.wickUpColor": "#00B26B",
  "mainSeriesProperties.candleStyle.wickDownColor": "#E64558",
  "mainSeriesProperties.candleStyle.borderUpColor": "#00B26B",
  "mainSeriesProperties.candleStyle.borderDownColor": "#E64558",
  "mainSeriesProperties.statusViewStyle.showExchange": true,
  "mainSeriesProperties.statusViewStyle.showSymbolAsDescription": false,
  "mainSeriesProperties.statusViewStyle.symbolTextSource": "ticker",
  "mainSeriesProperties.statusViewStyle.showInterval": true,
  "paneProperties.legendProperties.showBarChange": false,
  "paneProperties.legendProperties.showStudyTitles": true,
  "paneProperties.legendProperties.showStudyArguments": false,
  "paneProperties.legendProperties.showStudyValues": true,
};

type TopTab = "Price" | "Funding" | "Details";
type ChartMode = "TradingView" | "Original" | "Depth";

const DEPTH_FRAME_STYLE = { padding: LIGHTER_DEPTH_CHART_THEME.outerPadding };
const TV_ENABLED_FEATURES_TO_REMOVE = ["hide_left_toolbar_by_default"];

export function ChartPanel() {
  const [topTab, setTopTab] = useState<TopTab>("Price");
  const [mode, setMode] = useState<ChartMode>("TradingView");
  const [tf, setTf] = useState("5m");
  const tabs: TopTab[] = ["Price", "Funding", "Details"];
  const modes: ChartMode[] = ["TradingView", "Original", "Depth"];
  const tfs = ["5m", "15m", "1h", "4h"];

  return (
    <div className={styles.root}>
      <div className={styles.topTabs}>
        <div className={styles.tabsLeft}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTopTab(t)} className={topTab === t ? styles.tabActive : styles.tab}>
              {t}
            </button>
          ))}
        </div>
        {topTab === "Price" && (
          <div className={styles.modes}>
            {modes.map((m) => (
              <button key={m} onClick={() => setMode(m)} className={mode === m ? styles.modeActive : styles.mode}>
                {m}
              </button>
            ))}
            <span className={styles.modesSep} />
            <button className={styles.iconBtnSm} aria-label="windowed">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="10" height="10" rx="0.5" />
              </svg>
            </button>
            <button className={styles.iconBtnSm} aria-label="fullscreen">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.5 3H13V5.5" />
                <path d="M5.5 13H3V10.5" />
                <path d="M13 10.5V13H10.5" />
                <path d="M3 5.5V3H5.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {topTab === "Price" ? (
        <>
          <div className={styles.toolbar}>
            <div className={styles.tfs}>
              {tfs.map((t) => (
                <button key={t} onClick={() => setTf(t)} className={tf === t ? styles.tfActive : styles.tf}>
                  {t}
                </button>
              ))}
              <button className={styles.moreBtn}>
                More
                <span className={styles.moreCaret}>
                  <svg width="8" height="8" viewBox="0 0 256 256" fill="currentColor">
                    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
                  </svg>
                </span>
              </button>
              <span className={styles.sep} />
              <button className={styles.iconBtn} aria-label="add indicator">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="8" cy="8" r="6" />
                  <path d="M5.5 8h5M8 5.5v5" />
                </svg>
              </button>
              <span className={styles.sep} />
              <button className={styles.iconBtn} aria-label="indicators">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3.5 6.8h7" />
                  <path d="M9.5 10 13.5 14M9.5 14 13.5 10" />
                  <path d="M2.5 12.3h1.8c0.47 0 0.93-0.16 1.3-0.46c0.36-0.3 0.6-0.72 0.68-1.18l1.4-7.72c0.08-0.46 0.32-0.88 0.68-1.18c0.36-0.3 0.82-0.46 1.3-0.46h1.83" />
                </svg>
              </button>
              <span className={styles.sep} />
              <button className={styles.iconBtn} aria-label="volume">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M9.7 6.3V9.7H11.4V6.3ZM9.4 5.7H11.7C11.8 5.7 11.9 5.7 11.9 5.8C12 5.9 12 5.9 12 6V10C12 10.1 12 10.1 11.9 10.2C11.9 10.3 11.8 10.3 11.7 10.3H9.4C9.4 10.3 9.3 10.3 9.2 10.2C9.2 10.1 9.1 10.1 9.1 10V6C9.1 5.9 9.2 5.9 9.2 5.8C9.3 5.7 9.4 5.7 9.4 5.7Z" />
                  <path d="M10.3 4H10.9V6H10.3V4ZM10.3 10H10.9V12H10.3V10Z" />
                  <path d="M5.1 4.6V10.9H6.9V4.6ZM4.9 4H7.1C7.2 4 7.3 4 7.3 4.1C7.4 4.1 7.4 4.2 7.4 4.3V11.1C7.4 11.2 7.4 11.3 7.3 11.3C7.3 11.4 7.2 11.4 7.1 11.4H4.9C4.8 11.4 4.7 11.4 4.7 11.3C4.6 11.3 4.6 11.2 4.6 11.1V4.3C4.6 4.2 4.6 4.1 4.7 4.1C4.7 4 4.8 4 4.9 4Z" />
                  <path d="M5.7 2.3H6.3V4.5H5.7V2.3ZM5.7 11H6.3V13.1H5.7V11Z" />
                </svg>
              </button>
              <span className={styles.sep} />
              <button className={styles.tool}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M8 8H13.5M8 4H13.5M8 12H13.5" />
                  <path d="M2.5 4L3.5 5L5.5 3M2.5 8L3.5 9L5.5 7M2.5 12L3.5 13L5.5 11" />
                </svg>
                Chart Elements
              </button>
            </div>
            <div className={styles.toolsRight}>
              <button className={styles.iconBtn} aria-label="screenshot">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 5h3l1.5-2h3L11 5h3v9H2z" />
                  <circle cx="8" cy="9" r="2.5" />
                </svg>
              </button>
            </div>
          </div>
          <div className={styles.chart}>
            <div
              className={cx(styles.chartLayer, {
                [styles.layerActive]: mode === "TradingView",
              })}
            >
              {mode === "TradingView" ? (
                <TVChart
                  extraDisabledFeatures={LIGHTER_TV_DISABLED}
                  removeEnabledFeatures={TV_ENABLED_FEATURES_TO_REMOVE}
                  extraOverrides={LIGHTER_TV_OVERRIDES}
                  brandName="Primit"
                  customCssUrl="/lighter-tv.css"
                  initialBarsCount={170}
                />
              ) : null}
            </div>
            <div
              className={cx(styles.chartLayer, {
                [styles.layerActive]: mode === "Original",
              })}
            >
              {mode === "Original" ? <LighterOriginalChart timeframe={tf} /> : null}
            </div>
            <div
              className={cx(styles.chartLayer, {
                [styles.layerActive]: mode === "Depth",
              })}
            >
              {mode === "Depth" ? (
                <div className={styles.depthFrame} style={DEPTH_FRAME_STYLE}>
                  <LighterDepthChart />
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : topTab === "Funding" ? (
        <FundingPanel />
      ) : (
        <DetailsPanel />
      )}
    </div>
  );
}

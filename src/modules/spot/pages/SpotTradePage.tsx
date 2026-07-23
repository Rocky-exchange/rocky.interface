import { Trans, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHistory, useParams } from "react-router-dom";

import "@/modules/lighter/styles/global.scss";

import styles from "./SpotTradePage.module.scss";
import { useSpotSession } from "../api/spotSession";
import { SpotAccountsPanel } from "../components/Accounts/Accounts";
import { SpotBottomTabs } from "../components/BottomTabs/BottomTabs";
import { SpotChart } from "../components/Chart/SpotChart";
import { SpotDepthChart } from "../components/Chart/SpotDepthChart";
import { SpotMarketDetails } from "../components/Chart/SpotMarketDetails";
import { SpotOrderBookPanel } from "../components/OrderBook/OrderBook";
import { SpotOrderForm } from "../components/OrderForm/OrderForm";
import { SpotSymbolBar } from "../components/SymbolBar/SymbolBar";
import { resolveSpotMarket } from "../model/spotMarkets";

type TopTab = "price" | "details";
type ChartMode = "tradingview" | "depth";
type SplitLayout = "1" | "2H" | "2V" | "3H" | "3V" | "4G";

const SPLIT_PANE_COUNT: Record<SplitLayout, number> = {
  "1": 1,
  "2H": 2,
  "2V": 2,
  "3H": 3,
  "3V": 3,
  "4G": 4,
};
const SPLIT_LAYOUT_ROWS: { label: string; options: SplitLayout[] }[] = [
  { label: "1", options: ["1"] },
  { label: "2", options: ["2H", "2V"] },
  { label: "3", options: ["3H", "3V"] },
  { label: "4", options: ["4G"] },
];

function SplitLayoutIcon({ layout }: { layout: SplitLayout }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
    "aria-hidden": true,
  };

  switch (layout) {
    case "1":
      return (
        <svg {...props}>
          <rect x="2.5" y="3" width="11" height="10" rx="1" />
        </svg>
      );
    case "2H":
      return (
        <svg {...props}>
          <rect x="2.5" y="3" width="11" height="10" rx="1" />
          <line x1="8" y1="3" x2="8" y2="13" />
        </svg>
      );
    case "2V":
      return (
        <svg {...props}>
          <rect x="2.5" y="3" width="11" height="10" rx="1" />
          <line x1="2.5" y1="8" x2="13.5" y2="8" />
        </svg>
      );
    case "3H":
      return (
        <svg {...props}>
          <rect x="2.5" y="3" width="11" height="10" rx="1" />
          <line x1="6.166" y1="3" x2="6.166" y2="13" />
          <line x1="9.833" y1="3" x2="9.833" y2="13" />
        </svg>
      );
    case "3V":
      return (
        <svg {...props}>
          <rect x="2.5" y="3" width="11" height="10" rx="1" />
          <line x1="2.5" y1="6.333" x2="13.5" y2="6.333" />
          <line x1="2.5" y1="9.666" x2="13.5" y2="9.666" />
        </svg>
      );
    case "4G":
      return (
        <svg {...props}>
          <rect x="2.5" y="3" width="11" height="10" rx="1" />
          <line x1="8" y1="3" x2="8" y2="13" />
          <line x1="2.5" y1="8" x2="13.5" y2="8" />
        </svg>
      );
  }
}

function SplitMenuRow({
  label,
  current,
  onPick,
  options,
}: {
  label: string;
  current: SplitLayout;
  onPick: (layout: SplitLayout) => void;
  options: SplitLayout[];
}) {
  return (
    <div className={styles.splitMenuRow}>
      <span className={styles.splitMenuRowLabel}>{label}</span>
      {options.map((layout) => (
        <button
          key={layout}
          type="button"
          role="menuitemradio"
          aria-label={layout}
          aria-checked={current === layout}
          className={`${styles.splitMenuOption} ${current === layout ? styles.splitMenuOptionActive : ""}`}
          onClick={() => onPick(layout)}
        >
          <SplitLayoutIcon layout={layout} />
        </button>
      ))}
    </div>
  );
}

/**
 * Spot trading page — a route-coordinated workspace using the same panel
 * tokens and dense visual rhythm as the perp terminal. Content in each cell
 * talks to rocky-backend /api/v3/* directly.
 *
 * The route-level terminal shell owns Rocky's persistent TopNav and global
 * `.lighter-active` body class so spot and futures share identical app chrome.
 */
export default function SpotTradePage() {
  const { i18n } = useLingui();
  const params = useParams<{ symbol?: string }>();
  const history = useHistory();
  const chartPanelRef = useRef<HTMLDivElement>(null);
  const splitMenuRef = useRef<HTMLDivElement>(null);
  const routeSymbol = params.symbol?.trim();
  const market = resolveSpotMarket(routeSymbol);
  const [isFavorite, setIsFavorite] = useState(false);
  const [topTab, setTopTab] = useState<TopTab>("price");
  const [chartMode, setChartMode] = useState<ChartMode>("tradingview");
  const [splitLayout, setSplitLayout] = useState<SplitLayout>("1");
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const activeTabId = topTab === "price" ? "spot-chart-tab" : "spot-details-tab";

  // Mint / clear per-user HMAC credentials when the Canton wallet connects
  // or disconnects. Downstream components read via useSpotAuthReady().
  useSpotSession();

  useEffect(() => {
    if (params.symbol !== market.routeSymbol) {
      history.replace(`/spot/${market.routeSymbol}`);
    }
  }, [history, market.routeSymbol, params.symbol]);

  useEffect(() => {
    if (!splitMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(event.target as Node)) {
        setSplitMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [splitMenuOpen]);

  useEffect(() => {
    const syncFullscreen = () => {
      const documentWithWebkit = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(documentWithWebkit.fullscreenElement || documentWithWebkit.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const pickSplitLayout = useCallback((layout: SplitLayout) => {
    setSplitLayout(layout);
    setSplitMenuOpen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const panel = chartPanelRef.current;
    if (!panel) return;
    const documentWithWebkit = document as Document & { webkitFullscreenElement?: Element | null };
    if (documentWithWebkit.fullscreenElement || documentWithWebkit.webkitFullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void panel.requestFullscreen?.();
    }
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.primary} data-testid="spot-primary-workspace">
        <section className={styles.chartWorkspace} data-testid="spot-market-workspace">
          <SpotSymbolBar market={market} />
          <div className={styles.favoritesBar} data-testid="spot-favorites-bar">
            <button
              type="button"
              className={styles.favoriteButton}
              aria-label={isFavorite ? "remove favorite" : "add favorite"}
              aria-pressed={isFavorite}
              onClick={() => setIsFavorite((favorite) => !favorite)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill={isFavorite ? "var(--color-yellow-300, #ffe166)" : "none"}
                stroke={isFavorite ? "var(--color-yellow-300, #ffe166)" : "currentColor"}
                strokeWidth="1.9"
                aria-hidden="true"
              >
                <path
                  d="M12 3.8l2.53 5.12 5.65.82-4.09 3.99.97 5.63L12 16.68l-5.06 2.68.97-5.63L3.82 9.74l5.65-.82L12 3.8z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div ref={chartPanelRef} className={styles.chartPanel} data-testid="spot-chart-workspace">
            <div className={styles.chartTabs} role="tablist" aria-label="Market view">
              <div className={styles.chartTabsLeft}>
                <button
                  type="button"
                  className={styles.chartTab}
                  role="tab"
                  id="spot-chart-tab"
                  aria-selected={topTab === "price"}
                  aria-controls="spot-chart-panel"
                  tabIndex={topTab === "price" ? 0 : -1}
                  onClick={() => setTopTab("price")}
                >
                  <Trans>Price</Trans>
                </button>
                <button
                  type="button"
                  className={styles.chartTab}
                  role="tab"
                  id="spot-details-tab"
                  aria-selected={topTab === "details"}
                  aria-controls="spot-chart-panel"
                  tabIndex={topTab === "details" ? 0 : -1}
                  onClick={() => setTopTab("details")}
                >
                  <Trans>Details</Trans>
                </button>
              </div>
              {topTab === "price" && (
                <div className={styles.chartModes}>
                  <button
                    type="button"
                    className={`${styles.chartMode} ${
                      chartMode === "tradingview" ? styles.chartModeActive : ""
                    }`}
                    aria-pressed={chartMode === "tradingview"}
                    onClick={() => setChartMode("tradingview")}
                  >
                    <Trans>TradingView</Trans>
                  </button>
                  <button
                    type="button"
                    className={`${styles.chartMode} ${chartMode === "depth" ? styles.chartModeActive : ""}`}
                    aria-pressed={chartMode === "depth"}
                    onClick={() => setChartMode("depth")}
                  >
                    <Trans>Depth</Trans>
                  </button>
                  <span className={styles.chartModesSep} />
                  <div ref={splitMenuRef} className={styles.splitMenuWrap}>
                    <button
                      type="button"
                      className={`${styles.chartIconButton} ${
                        splitMenuOpen || splitLayout !== "1" ? styles.chartIconButtonActive : ""
                      }`}
                      aria-label={i18n._(t`Chart layout`)}
                      aria-haspopup="menu"
                      aria-expanded={splitMenuOpen}
                      title={i18n._(t`Chart layout`)}
                      onClick={() => setSplitMenuOpen((open) => !open)}
                    >
                      <SplitLayoutIcon layout={splitLayout} />
                    </button>
                    {splitMenuOpen && (
                      <div className={styles.splitMenu} role="menu">
                        {SPLIT_LAYOUT_ROWS.map((row) => (
                          <SplitMenuRow
                            key={row.label}
                            label={row.label}
                            current={splitLayout}
                            onPick={pickSplitLayout}
                            options={row.options}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`${styles.chartIconButton} ${isFullscreen ? styles.chartIconButtonActive : ""}`}
                    aria-label={i18n._(isFullscreen ? t`Exit fullscreen` : t`Enter fullscreen`)}
                    aria-pressed={isFullscreen}
                    title={i18n._(isFullscreen ? t`Exit fullscreen` : t`Fullscreen`)}
                    onClick={toggleFullscreen}
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
                      <path d="M10.5 3H13V5.5" />
                      <path d="M5.5 13H3V10.5" />
                      <path d="M13 10.5V13H10.5" />
                      <path d="M3 5.5V3H5.5" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <div className={styles.chart} role="tabpanel" id="spot-chart-panel" aria-labelledby={activeTabId}>
              {topTab === "details" ? (
                <SpotMarketDetails market={market} />
              ) : chartMode === "depth" ? (
                <SpotDepthChart market={market} />
              ) : (
                <div
                  className={`${styles.splitGrid} ${styles[`splitGrid_${splitLayout}`]}`}
                  data-testid="spot-chart-grid"
                  data-layout={splitLayout}
                >
                  {Array.from({ length: SPLIT_PANE_COUNT[splitLayout] }).map((_, paneIndex) => (
                    <div key={`${splitLayout}-${paneIndex}`} className={styles.splitPane}>
                      <SpotChart market={market} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
        <aside className={styles.orderbook} data-testid="spot-orderbook-region">
          <SpotOrderBookPanel market={market} />
        </aside>
        <aside className={styles.orderform} data-testid="spot-orderform-region">
          <SpotOrderForm market={market} />
        </aside>
      </main>
      <section className={styles.bottom} data-testid="spot-bottom-workspace">
        <div className={styles.tabs}>
          <SpotBottomTabs market={market} />
        </div>
        <aside className={styles.accounts}>
          <SpotAccountsPanel market={market} />
        </aside>
      </section>
    </div>
  );
}

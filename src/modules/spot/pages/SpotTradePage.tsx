import { useEffect, useState } from "react";
import { useHistory, useParams } from "react-router-dom";

import "@/modules/lighter/styles/global.scss";

import styles from "./SpotTradePage.module.scss";
import { useSpotSession } from "../api/spotSession";
import { SpotAccountsPanel } from "../components/Accounts/Accounts";
import { SpotBottomTabs } from "../components/BottomTabs/BottomTabs";
import { SpotChart } from "../components/Chart/SpotChart";
import { SpotOrderBookPanel } from "../components/OrderBook/OrderBook";
import { SpotOrderForm } from "../components/OrderForm/OrderForm";
import { SpotSymbolBar } from "../components/SymbolBar/SymbolBar";
import { resolveSpotMarket } from "../model/spotMarkets";

/**
 * Spot trading page — a route-coordinated workspace using the same panel
 * tokens and dense visual rhythm as the perp terminal. Content in each cell
 * talks to rocky-backend /api/v3/* directly.
 *
 * The route-level terminal shell owns Rocky's persistent TopNav and global
 * `.lighter-active` body class so spot and futures share identical app chrome.
 */
export default function SpotTradePage() {
  const params = useParams<{ symbol?: string }>();
  const history = useHistory();
  const routeSymbol = params.symbol?.trim().replace(/-USDCX$/i, "-USDA");
  const market = resolveSpotMarket(routeSymbol);
  const [isFavorite, setIsFavorite] = useState(false);

  // Mint / clear per-user HMAC credentials when the Canton wallet connects
  // or disconnects. Downstream components read via useSpotAuthReady().
  useSpotSession();

  useEffect(() => {
    if (params.symbol !== market.routeSymbol) {
      history.replace(`/spot/${market.routeSymbol}`);
    }
  }, [history, market.routeSymbol, params.symbol]);

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
          <div className={styles.chartPanel} data-testid="spot-chart-workspace">
            <div className={styles.chartTabs} role="tablist" aria-label="Market view">
              <div className={styles.chartTabsLeft}>
                <button
                  type="button"
                  className={styles.chartTab}
                  role="tab"
                  id="spot-chart-tab"
                  aria-selected="true"
                  aria-controls="spot-chart-panel"
                >
                  Price
                </button>
                <button type="button" className={styles.chartTab} role="tab" aria-selected="false" disabled>
                  Funding
                </button>
                <button type="button" className={styles.chartTab} role="tab" aria-selected="false" disabled>
                  Details
                </button>
              </div>
              <div className={styles.chartModes} aria-hidden="true">
                <span className={styles.chartModeActive}>TradingView</span>
                <span>Depth</span>
                <span className={styles.chartModesSep} />
                <span className={styles.chartIcon}>□</span>
                <span className={styles.chartIcon}>⛶</span>
              </div>
            </div>
            <div className={styles.chart} role="tabpanel" id="spot-chart-panel" aria-labelledby="spot-chart-tab">
              <SpotChart market={market} />
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

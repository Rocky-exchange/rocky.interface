import { useEffect } from "react";
import { useHistory, useParams } from "react-router-dom";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import "@/modules/lighter/styles/global.scss";

import styles from "./SpotTradePage.module.scss";
import { useSpotSession } from "../api/spotSession";
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
 * Reuses Rocky's TopNav + global.scss (`.lighter-active` body class) so the
 * app chrome (logo, nav pills, wallet button, language selector) is identical
 * to the perp page.
 */
export default function SpotTradePage() {
  const params = useParams<{ symbol?: string }>();
  const history = useHistory();
  const routeSymbol = params.symbol?.trim().replace(/-USDCX$/i, "-USDA");
  const market = resolveSpotMarket(routeSymbol);

  // Mint / clear per-user HMAC credentials when the Canton wallet connects
  // or disconnects. Downstream components read via useSpotAuthReady().
  useSpotSession();

  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  useEffect(() => {
    if (params.symbol !== market.routeSymbol) {
      history.replace(`/spot/${market.routeSymbol}`);
    }
  }, [history, market.routeSymbol, params.symbol]);

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav />
      </div>
      <main className={styles.workspace}>
        <section className={styles.marketWorkspace} data-testid="spot-market-workspace">
          <SpotSymbolBar market={market} />
          <div className={styles.chartPanel}>
            <div className={styles.chartTabs} role="tablist" aria-label="Market view">
              <button type="button" role="tab" aria-selected="true">
                Chart
              </button>
              <button type="button" role="tab" aria-selected="false" disabled>
                Market Info
              </button>
            </div>
            <div className={styles.chart}>
              <SpotChart market={market} />
            </div>
          </div>
          <SpotBottomTabs market={market} />
        </section>
        <aside className={styles.orderbook} data-testid="spot-orderbook-region">
          <SpotOrderBookPanel market={market} />
        </aside>
        <aside className={styles.orderform} data-testid="spot-orderform-region">
          <SpotOrderForm market={market} />
        </aside>
      </main>
    </div>
  );
}

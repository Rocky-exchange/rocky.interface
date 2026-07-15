import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import "@/modules/lighter/styles/global.scss";

import { useSpotSession } from "../api/spotSession";
import { SpotSymbolBar } from "../components/SymbolBar/SymbolBar";
import { SpotOrderBookPanel } from "../components/OrderBook/OrderBook";
import { SpotOrderForm } from "../components/OrderForm/OrderForm";
import { SpotBottomTabs } from "../components/BottomTabs/BottomTabs";
import { SpotAccountsPanel } from "../components/Accounts/Accounts";
import { SpotChart } from "../components/Chart/SpotChart";
import styles from "./SpotTradePage.module.scss";

/**
 * Spot trading page — layout grid mirrors LighterTradePage.module.scss so the
 * visual rhythm (row heights, col widths, borders, panel look) matches perp
 * exactly. Content in each cell talks to rocky-backend /api/v3/* directly.
 *
 * Reuses Rocky's TopNav + global.scss (`.lighter-active` body class) so the
 * app chrome (logo, nav pills, wallet button, language selector) is identical
 * to the perp page.
 */
export default function SpotTradePage() {
  const params = useParams<{ symbol?: string }>();
  const symbol = params.symbol ?? "CBTC-USDCX";

  // Mint / clear per-user HMAC credentials when the Canton wallet connects
  // or disconnects. Downstream components read via useSpotAuthReady().
  useSpotSession();

  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav />
      </div>
      <div className={styles.main}>
        <div className={styles.chartCol}>
          <SpotSymbolBar symbol={symbol} />
          <div className={styles.chart}>
            <SpotChart symbol={symbol} />
          </div>
        </div>
        <div className={styles.orderbook}>
          <SpotOrderBookPanel symbol={symbol} />
        </div>
        <div className={styles.orderform}>
          <SpotOrderForm symbol={symbol} />
        </div>
      </div>
      <div className={styles.bottom}>
        <div>
          <SpotBottomTabs symbol={symbol} />
        </div>
        <div>
          <SpotAccountsPanel />
        </div>
      </div>
    </div>
  );
}

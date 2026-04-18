// src/modules/lighter/pages/LighterTradePage.tsx
import { useEffect, useState } from "react";

import "../styles/global.scss";
import styles from "./LighterTradePage.module.scss";
import { AccountsPanel } from "../components/AccountsPanel/AccountsPanel";
import { BottomTabs } from "../components/BottomTabs/BottomTabs";
import { ChartPanel } from "../components/ChartPanel/ChartPanel";
import { OrderBookPanel, type OrderBookLayout } from "../components/OrderBookPanel/OrderBookPanel";
import { OrderFormPanel } from "../components/OrderFormPanel/OrderFormPanel";
import { SymbolBar } from "../components/SymbolBar/SymbolBar";
import { TopNav } from "../components/TopNav/TopNav";

export default function LighterTradePage() {
  const [orderBookLayout, setOrderBookLayout] = useState<OrderBookLayout>("Tab");

  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  return (
    <div className={`lighter-root ${styles.page}`}>
      <div className={styles.topnav}>
        <TopNav />
      </div>
      {/* <div className={styles.banner}>
        You're accessing Lighter from a restricted jurisdiction. Only withdrawals are available. For more details, see
        the&nbsp;
        <a href="#terms">Terms of Service</a>.
      </div> */}
      <div className={`${styles.main} ${orderBookLayout === "Large" ? styles.mainLarge : ""}`}>
        <div className={styles.chartCol}>
          <SymbolBar />
          <div className={styles.favoritesBar}>
            <button type="button" className={styles.favoriteButton} aria-label="favorite market">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path
                  d="M12 3.8l2.53 5.12 5.65.82-4.09 3.99.97 5.63L12 16.68l-5.06 2.68.97-5.63L3.82 9.74l5.65-.82L12 3.8z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className={styles.chart}>
            <ChartPanel />
          </div>
        </div>
        <div className={`${styles.orderbook} ${orderBookLayout === "Large" ? styles.orderbookLarge : ""}`}>
          <OrderBookPanel layout={orderBookLayout} onLayoutChange={setOrderBookLayout} />
        </div>
        <div className={styles.orderform}>
          <OrderFormPanel />
        </div>
      </div>
      <div className={`${styles.bottom} ${orderBookLayout === "Large" ? styles.bottomLarge : ""}`}>
        <div className={`${styles.tabs} ${orderBookLayout === "Large" ? styles.tabsLarge : ""}`}>
          <BottomTabs />
        </div>
        <div className={`${styles.accounts} ${orderBookLayout === "Large" ? styles.accountsLarge : ""}`}>
          <AccountsPanel />
        </div>
      </div>
    </div>
  );
}

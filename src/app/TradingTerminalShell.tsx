import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import "@/modules/lighter/styles/global.scss";

import styles from "./TradingTerminalShell.module.scss";

export function TradingTerminalShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isFuturesRoute = pathname.startsWith("/trade");

  useEffect(() => {
    document.body.classList.add("lighter-active");
    return () => document.body.classList.remove("lighter-active");
  }, []);

  return (
    <div className={`lighter-root ${styles.page} ${isFuturesRoute ? styles.futuresRoute : ""}`}>
      <div className={styles.topnav}>
        <TopNav />
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

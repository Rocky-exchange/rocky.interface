// src/modules/lighter/mobile/TradePage/panels/FundingPanel.tsx
import { FundingPanel as DesktopFundingPanel } from "@/modules/lighter/components/ChartPanel/FundingPanel";

import styles from "./PanelWrap.module.scss";

export function FundingPanel() {
  return (
    <div className={styles.wrap}>
      <DesktopFundingPanel />
    </div>
  );
}

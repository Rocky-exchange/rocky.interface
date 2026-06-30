// src/modules/lighter/mobile/TradePage/panels/DetailsPanel.tsx
import { DetailsPanel as DesktopDetailsPanel } from "@/modules/lighter/components/ChartPanel/DetailsPanel";

import styles from "./PanelWrap.module.scss";

export function DetailsPanel() {
  return (
    <div className={styles.wrap}>
      <DesktopDetailsPanel />
    </div>
  );
}

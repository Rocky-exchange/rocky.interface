// src/modules/lighter/mobile/TradePage/panels/DepthPanel.tsx
import { LighterDepthChart } from "@/modules/lighter/components/ChartPanel/LighterDepthChart";

import styles from "./PanelWrap.module.scss";

export function DepthPanel() {
  return (
    <div className={styles.wrap}>
      <LighterDepthChart />
    </div>
  );
}

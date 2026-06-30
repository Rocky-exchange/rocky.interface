import { ChartPanel } from "@/modules/lighter/components/ChartPanel/ChartPanel";

import styles from "./PriceChartPanel.module.scss";

export function PriceChartPanel() {
  return (
    <div className={styles.chartWrap}>
      <ChartPanel />
    </div>
  );
}

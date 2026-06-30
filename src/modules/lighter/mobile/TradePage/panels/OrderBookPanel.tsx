import { useState } from "react";

import { OrderBookPanel as DesktopOrderBookPanel, type OrderBookLayout } from "@/modules/lighter/components/OrderBookPanel/OrderBookPanel";

import styles from "./OrderBookPanel.module.scss";

export function OrderBookPanel() {
  const [layout, setLayout] = useState<OrderBookLayout>("Tab");

  return (
    <div className={styles.wrap}>
      <DesktopOrderBookPanel layout={layout} onLayoutChange={setLayout} />
    </div>
  );
}

import type { ReactNode } from "react";
import { Trans } from "@lingui/macro";
import styles from "./MobileTradeTabs.module.scss";

export type MobileTradeTabKey = "Price" | "OrderBook" | "Trades" | "Depth" | "Funding" | "Details";

const TABS: MobileTradeTabKey[] = ["Price", "OrderBook", "Trades", "Depth", "Funding", "Details"];

const LABELS: Record<MobileTradeTabKey, ReactNode> = {
  Price: <Trans>Price</Trans>,
  OrderBook: <Trans>Order Book</Trans>,
  Trades: <Trans>Trades</Trans>,
  Depth: <Trans>Depth</Trans>,
  Funding: <Trans>Funding</Trans>,
  Details: <Trans>Details</Trans>,
};

type Props = {
  active: MobileTradeTabKey;
  onChange: (key: MobileTradeTabKey) => void;
};

export function MobileTradeTabs({ active, onChange }: Props) {
  return (
    <div role="tablist" className={styles.tablist}>
      {TABS.map((key) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            aria-controls={`mobile-tradepanel-${key}`}
            id={`mobile-tradetab-${key}`}
            onClick={() => onChange(key)}
            className={`${styles.tab}${isActive ? ` ${styles.tabActive}` : ""}`}
          >
            {LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}

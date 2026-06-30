// src/modules/lighter/mobile/TradePage/MobileTradeCTA.tsx
import { Trans } from "@lingui/macro";
import styles from "./MobileTradeCTA.module.scss";

type Props = {
  onBuy: () => void;
  onSell: () => void;
};

export function MobileTradeCTA({ onBuy, onSell }: Props) {
  return (
    <div className={styles.bar}>
      <button type="button" onClick={onBuy} className={`${styles.button} ${styles.buy}`}>
        <Trans>Buy / Long</Trans>
      </button>
      <button type="button" onClick={onSell} className={`${styles.button} ${styles.sell}`}>
        <Trans>Sell / Short</Trans>
      </button>
    </div>
  );
}

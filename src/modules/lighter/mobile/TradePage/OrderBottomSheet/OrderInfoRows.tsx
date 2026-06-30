// src/modules/lighter/mobile/TradePage/OrderBottomSheet/OrderInfoRows.tsx
import { Trans } from "@lingui/macro";
import type { ReactNode } from "react";

import styles from "./OrderBottomSheet.module.scss";

type Props = {
  availableToTrade: string;
  position: ReactNode;
  orderSize: string;
  orderValue: string;
  estPrice: string;
  cost: string;
  liquidation: string;
  slippage: string;
  fees: string;
};

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className={styles.previewRow}>
      <span className={styles.previewLabel}>{label}</span>
      <span className={styles.previewValue}>{value}</span>
    </div>
  );
}

export function OrderInfoRows({
  availableToTrade,
  position,
  orderSize,
  orderValue,
  estPrice,
  cost,
  liquidation,
  slippage,
  fees,
}: Props) {
  return (
    <>
      <Row label={<Trans>Available to Trade</Trans>} value={availableToTrade} />
      <Row label={<Trans>Position</Trans>} value={position} />
      <Row label={<Trans>Order Size</Trans>} value={orderSize} />
      <Row label={<Trans>Order Value</Trans>} value={orderValue} />
      <Row label={<Trans>Est. Price</Trans>} value={estPrice} />
      <Row label={<Trans>Cost</Trans>} value={cost} />
      <Row label={<Trans>Liquidation</Trans>} value={liquidation} />
      <Row label={<Trans>Slippage</Trans>} value={slippage} />
      <Row label={<Trans>Fees</Trans>} value={fees} />
    </>
  );
}

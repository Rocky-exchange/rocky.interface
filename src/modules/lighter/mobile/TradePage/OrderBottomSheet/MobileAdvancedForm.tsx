// src/modules/lighter/mobile/TradePage/OrderBottomSheet/MobileAdvancedForm.tsx
import { Trans, t } from "@lingui/macro";
import type { ReactNode } from "react";

import { useMobileAdvancedOrder } from "@/modules/lighter/features/orderForm/useMobileAdvancedOrder";
import { useOrderInfoRows } from "@/modules/lighter/features/orderForm/useOrderInfoRows";
import type { AdvancedMode, Side } from "@/modules/lighter/features/orderForm/types";

import { MobilePercentSlider } from "./MobilePercentSlider";
import { SizeInput } from "./SizeInput";
import styles from "./OrderBottomSheet.module.scss";

type Props = {
  type: AdvancedMode;
  side: Side;
  isConnected: boolean;
  leverage: number;
  marginMode: "cross" | "isolated";
  baseSymbol: string;
};

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className={styles.previewRow}>
      <span className={styles.previewLabel}>{label}</span>
      <span className={styles.previewValue}>{value}</span>
    </div>
  );
}

export function MobileAdvancedForm({ type, side, isConnected, leverage, marginMode, baseSymbol }: Props) {
  const adv = useMobileAdvancedOrder({ type, side, leverage, marginMode });
  const info = useOrderInfoRows({
    preview: adv.preview,
    side,
    amountNum: adv.amountNum,
    baseSymbol,
    reduceOnly: adv.reduceOnly,
  });

  const triggerLabel = adv.isTakeProfit ? t`TP Trigger Price` : t`Trigger Price`;
  const submitLabel = adv.canSubmit ? t`Submit Order` : t`Enter ${triggerLabel}`;

  return (
    <div className={styles.body}>
      <div className={styles.priceRow}>
        <label className={styles.priceLabel}>{triggerLabel}</label>
        <input
          type="text"
          inputMode="decimal"
          value={adv.triggerPrice}
          onChange={(e) => adv.setTriggerPrice(e.target.value.replace(/[^\d.]/g, ""))}
          className={styles.priceInput}
          placeholder="0.000000"
        />
      </div>

      {adv.hasLimitPrice && (
        <div className={styles.priceRow}>
          <label className={styles.priceLabel}>
            <Trans>Limit Price</Trans>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={adv.limitPrice}
            onChange={(e) => adv.setLimitPrice(e.target.value.replace(/[^\d.]/g, ""))}
            className={styles.priceInput}
            placeholder="0.000000"
          />
          <button
            type="button"
            className={styles.unitButton}
            onClick={() => {
              if (adv.markPrice) adv.setLimitPrice(String(adv.markPrice));
            }}
          >
            <Trans>Mid</Trans>
          </button>
        </div>
      )}

      <SizeInput
        value={adv.amount}
        unit={adv.amountUnit}
        baseSymbol={baseSymbol}
        onChange={adv.onAmountInput}
        onUnitToggle={adv.onUnitToggle}
      />

      <MobilePercentSlider value={adv.pct} onChange={adv.onPctChange} />

      <label className={styles.previewRow}>
        <span className={styles.previewLabel}>
          <input
            type="checkbox"
            checked={adv.reduceOnly}
            onChange={(e) => adv.setReduceOnly(e.target.checked)}
            aria-label={t`Reduce Only`}
          />{" "}
          <Trans>Reduce Only</Trans>
        </span>
      </label>

      <Row label={<Trans>Available to Trade</Trans>} value={info.availableToTrade} />
      <Row label={<Trans>Position</Trans>} value={info.position} />
      {adv.hasLimitPrice && <Row label={<Trans>Maximum Order Value</Trans>} value={adv.maxOrderValueText} />}
      <Row label={<Trans>Order Size</Trans>} value={adv.orderSizeText} />
      {adv.hasLimitPrice && <Row label={<Trans>Order Value</Trans>} value={adv.orderValueText} />}
      <Row label={<Trans>Fees</Trans>} value={info.fees} />

      {adv.previewErrorMessage && <div className={styles.error}>{adv.previewErrorMessage}</div>}

      {isConnected && (
        <button
          type="button"
          disabled={adv.submitting || !adv.canSubmit}
          onClick={() => void adv.submit()}
          className={
            side === "buy" ? `${styles.placeButton} ${styles.buyButton}` : `${styles.placeButton} ${styles.sellButton}`
          }
        >
          {submitLabel}
        </button>
      )}
    </div>
  );
}

// src/modules/lighter/mobile/TradePage/OrderBottomSheet/SizeInput.tsx
import { Trans, t } from "@lingui/macro";
import { SizeUnit } from "@/modules/lighter/features/orderForm/types";
import styles from "./SizeInput.module.scss";

type Props = {
  value: string;
  unit: SizeUnit;
  baseSymbol: string;
  onChange: (v: string) => void;
  onUnitToggle: () => void;
};

export function SizeInput({ value, unit, baseSymbol, onChange, onUnitToggle }: Props) {
  return (
    <div className={styles.row}>
      <label className={styles.label}><Trans>Size</Trans></label>
      <div className={styles.box}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0.00"
          className={styles.input}
        />
        <button type="button" onClick={onUnitToggle} className={styles.unitButton} aria-label={t`Toggle size unit`}>
          {unit === "BASE" ? baseSymbol : "USD"} ▼
        </button>
      </div>
    </div>
  );
}

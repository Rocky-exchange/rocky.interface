// src/modules/lighter/mobile/TradePage/OrderBottomSheet/LeverageSlider.tsx
import { Trans, t } from "@lingui/macro";
import styles from "./LeverageSlider.module.scss";

type Props = {
  value: number;
  max: number;
  onChange: (v: number) => void;
};

export function LeverageSlider({ value, max, onChange }: Props) {
  return (
    <div className={styles.row}>
      <div className={styles.head}>
        <span className={styles.label}><Trans>Leverage</Trans></span>
        <span className={styles.value}>{value}x</span>
      </div>
      <input
        type="range"
        min={1}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.slider}
        aria-label={t`Leverage`}
      />
    </div>
  );
}

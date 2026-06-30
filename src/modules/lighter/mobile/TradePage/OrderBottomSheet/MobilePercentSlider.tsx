// src/modules/lighter/mobile/TradePage/OrderBottomSheet/MobilePercentSlider.tsx
import { t } from "@lingui/macro";

import styles from "./MobilePercentSlider.module.scss";

type Props = {
  value: number;
  onChange: (v: number) => void;
};

const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

export function MobilePercentSlider({ value, onChange }: Props) {
  return (
    <div className={styles.row}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(clampPct(Number(e.target.value)))}
        className={styles.slider}
        aria-label={t`Amount percent`}
      />
      <input
        type="text"
        inputMode="numeric"
        value={`${value}`}
        onChange={(e) => onChange(clampPct(Number(e.target.value.replace(/[^\d]/g, "")) || 0))}
        className={styles.box}
        aria-label={t`Amount percent value`}
      />
    </div>
  );
}

// src/modules/lighter/mobile/TradePage/OrderBottomSheet/TPSLSection.tsx
import { useState } from "react";
import { Trans, t } from "@lingui/macro";
import styles from "./TPSLSection.module.scss";

type Props = {
  tp: string;
  sl: string;
  onTpChange: (v: string) => void;
  onSlChange: (v: string) => void;
};

export function TPSLSection({ tp, sl, onTpChange, onSlChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.section}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={styles.toggle}>
        <span><Trans>Take Profit / Stop Loss</Trans></span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className={styles.inputs}>
          <input
            type="text"
            inputMode="decimal"
            placeholder={t`TP price`}
            value={tp}
            onChange={(e) => onTpChange(e.target.value.replace(/[^\d.]/g, ""))}
            className={styles.input}
            aria-label={t`Take profit price`}
          />
          <input
            type="text"
            inputMode="decimal"
            placeholder={t`SL price`}
            value={sl}
            onChange={(e) => onSlChange(e.target.value.replace(/[^\d.]/g, ""))}
            className={styles.input}
            aria-label={t`Stop loss price`}
          />
        </div>
      )}
    </div>
  );
}

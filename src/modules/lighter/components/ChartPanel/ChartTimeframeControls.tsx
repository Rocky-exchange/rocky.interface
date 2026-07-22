import cx from "classnames";
import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./ChartPanel.module.scss";

export type ChartTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";

const PRIMARY_TIMEFRAMES: ChartTimeframe[] = ["5m", "15m", "1h", "4h"];
const MORE_TIMEFRAMES: { label: string; value: ChartTimeframe }[] = [
  { label: "1m", value: "1m" },
  { label: "D", value: "1d" },
  { label: "W", value: "1w" },
  { label: "M", value: "1M" },
];

type Props = {
  value: ChartTimeframe;
  onChange: (value: ChartTimeframe) => void;
  moreLabel?: ReactNode;
};

export function ChartTimeframeControls({ value, onChange, moreLabel = "More" }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const selectedMore = MORE_TIMEFRAMES.find((option) => option.value === value);

  useEffect(() => {
    if (!moreOpen) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [moreOpen]);

  return (
    <>
      {PRIMARY_TIMEFRAMES.map((timeframe) => (
        <button
          key={timeframe}
          type="button"
          onClick={() => onChange(timeframe)}
          className={value === timeframe ? styles.tfActive : styles.tf}
        >
          {timeframe}
        </button>
      ))}
      <div className={styles.moreWrap} ref={moreRef}>
        <button
          type="button"
          className={cx(styles.moreBtn, { [styles.moreBtnActive]: Boolean(selectedMore) || moreOpen })}
          onClick={() => setMoreOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
        >
          {selectedMore ? selectedMore.label : moreLabel}
          <span className={cx(styles.moreCaret, { [styles.moreCaretOpen]: moreOpen })}>
            <svg width="8" height="8" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
              <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
            </svg>
          </span>
        </button>
        {moreOpen && (
          <div className={styles.moreMenu} role="menu">
            {MORE_TIMEFRAMES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                className={cx(styles.moreItem, { [styles.moreItemActive]: value === option.value })}
                onClick={() => {
                  onChange(option.value);
                  setMoreOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// src/modules/lighter/mobile/TradePage/OrderBottomSheet/OrderTypeTabs.tsx
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { BasicMode, Mode, AdvancedMode } from "@/modules/lighter/features/orderForm/types";
import { ADVANCED_MODES, isAdvancedMode, pickAdvancedLabel } from "@/modules/lighter/features/orderForm/advancedModes";
import styles from "./OrderTypeTabs.module.scss";

const BASIC_TABS: BasicMode[] = ["Market", "Limit"];

const LABELS: Record<BasicMode, ReactNode> = {
  Market: <Trans>Market</Trans>,
  Limit: <Trans>Limit</Trans>,
};

type Props = {
  mode: Mode;
  onChange: (m: BasicMode) => void;
  advancedOpen: boolean;
  onAdvancedToggle: (open: boolean) => void;
  onAdvancedSelect: (m: AdvancedMode) => void;
};

export function OrderTypeTabs({ mode, onChange, advancedOpen, onAdvancedToggle, onAdvancedSelect }: Props) {
  const { i18n } = useLingui();
  const advancedActive = isAdvancedMode(mode);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!advancedOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onAdvancedToggle(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [advancedOpen, onAdvancedToggle]);

  return (
    <div role="tablist" className={styles.tablist}>
      {BASIC_TABS.map((tab) => {
        const isActive = mode === tab && !advancedActive;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              onChange(tab);
              onAdvancedToggle(false);
            }}
            className={isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            type="button"
          >
            {LABELS[tab]}
          </button>
        );
      })}

      <div ref={wrapRef} className={styles.advancedWrap}>
        <button
          role="tab"
          type="button"
          aria-haspopup="menu"
          aria-expanded={advancedOpen}
          aria-selected={advancedActive}
          onClick={() => onAdvancedToggle(!advancedOpen)}
          className={advancedActive ? `${styles.tab} ${styles.tabActive}` : styles.tab}
        >
          <span>
            {advancedActive ? pickAdvancedLabel(mode as AdvancedMode, i18n.locale) : <Trans>Advanced</Trans>}
          </span>
          <span className={`${styles.caret} ${advancedOpen ? styles.caretOpen : ""}`} aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 256 256" fill="currentColor">
              <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
            </svg>
          </span>
        </button>

        {advancedOpen && (
          <div role="menu" aria-label="Advanced" className={styles.menu}>
            {ADVANCED_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  onAdvancedSelect(m);
                  onAdvancedToggle(false);
                }}
              >
                {pickAdvancedLabel(m, i18n.locale)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

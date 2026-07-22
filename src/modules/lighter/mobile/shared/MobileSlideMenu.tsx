// src/modules/lighter/mobile/shared/MobileSlideMenu.tsx
import { Trans, t } from "@lingui/macro";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { BottomSheet } from "./BottomSheet";
import styles from "./MobileSlideMenu.module.scss";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const LINKS: { to: string; label: ReactNode }[] = [
  { to: "/spot/CBTC-USDA", label: <Trans>Spot</Trans> },
  { to: "/trade", label: <Trans>Futures</Trans> },
];

export function MobileSlideMenu({ open, onOpenChange }: Props) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t`Menu`}>
      <nav className={styles.nav}>
        {LINKS.map(({ to, label }) => (
          <Link key={to} to={to} onClick={() => onOpenChange(false)} className={styles.link}>
            {label}
          </Link>
        ))}
      </nav>
    </BottomSheet>
  );
}

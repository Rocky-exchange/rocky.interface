// src/modules/lighter/mobile/shared/MobileSlideMenu.tsx
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trans, t } from "@lingui/macro";
import { BottomSheet } from "./BottomSheet";
import styles from "./MobileSlideMenu.module.scss";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const LINKS: { to: string; label: ReactNode }[] = [
  { to: "/trade", label: <Trans>Trade</Trans> },
  { to: "/earn", label: <Trans>Earn</Trans> },
  { to: "/accounts", label: <Trans>Portfolio</Trans> },
  { to: "/leaderboard", label: <Trans>Leaderboard</Trans> },
  { to: "/referrals", label: <Trans>Referrals</Trans> },
  { to: "/points", label: <Trans>Points</Trans> },
  { to: "/fee-vip", label: <Trans>Fee &amp; VIP</Trans> },
  { to: "/blog", label: <Trans>Blog</Trans> },
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

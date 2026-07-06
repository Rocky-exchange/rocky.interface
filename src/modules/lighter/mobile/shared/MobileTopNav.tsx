// src/modules/lighter/mobile/shared/MobileTopNav.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { t } from "@lingui/macro";
import WalletIcon from "img/ic_wallet.svg?react";
import BurgerIcon from "img/ic_burger_menu.svg?react";
import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { MobileSlideMenu } from "./MobileSlideMenu";
import styles from "./MobileTopNav.module.scss";

export function MobileTopNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { connected } = useCantonSession();

  return (
    <header className={styles.nav}>
      <Link to="/trade" className={styles.logo} aria-label={t`Home`}>
        <img src="/logo.svg" alt="Rocky" />
      </Link>
      <div className={styles.actions}>
        <button
          type="button"
          aria-label={connected ? t`Wallet` : t`Connect Wallet`}
          onClick={() => openCantonConnect()}
          className={styles.iconButton}
        >
          <WalletIcon />
        </button>
        <button type="button" aria-label={t`Menu`} onClick={() => setMenuOpen(true)} className={styles.iconButton}>
          <BurgerIcon />
        </button>
      </div>
      <MobileSlideMenu open={menuOpen} onOpenChange={setMenuOpen} />
    </header>
  );
}

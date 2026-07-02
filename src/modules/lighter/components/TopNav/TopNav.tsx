import { Trans } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import cx from "classnames";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { useSettings } from "@/modules/lighter/context/SettingsContext";
import { CantonFundsModal } from "@/shared/lib/canton-wallet/CantonFundsModal";
import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { dynamicActivate } from "@/shared/lib/i18n";

import styles from "./TopNav.module.scss";

const LANGUAGE_OPTIONS = [
  { key: "en", label: "English" },
  { key: "zh", label: "繁體中文" },
] as const;

export function TopNav({ rightExtra }: { rightExtra?: ReactNode } = {}) {
  const { i18n } = useLingui();
  const { connected, username, party } = useCantonSession();
  const { setIsSettingsVisible } = useSettings();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isLanguageSwitching, setIsLanguageSwitching] = useState(false);
  const [fundsOpen, setFundsOpen] = useState(false);
  const languageRef = useRef<HTMLDivElement>(null);

  const walletLabel = connected ? username || `${party.slice(0, 8)}...` : null;

  const handleSettingsClick = useCallback(() => {
    setIsSettingsVisible(true);
  }, [setIsSettingsVisible]);

  const handleWalletClick = useCallback(() => {
    if (connected) {
      setFundsOpen(true);
      return;
    }
    openCantonConnect();
  }, [connected]);

  const handleLanguageToggle = useCallback(() => {
    setIsLanguageOpen((prev) => !prev);
  }, []);

  const handleLanguageSelect = useCallback(
    async (locale: string) => {
      if (locale === i18n.locale || isLanguageSwitching) {
        setIsLanguageOpen(false);
        return;
      }

      setIsLanguageSwitching(true);
      try {
        await dynamicActivate(locale);
      } finally {
        setIsLanguageSwitching(false);
        setIsLanguageOpen(false);
      }
    },
    [i18n.locale, isLanguageSwitching]
  );

  useEffect(() => {
    if (!isLanguageOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!languageRef.current?.contains(event.target as Node)) {
        setIsLanguageOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isLanguageOpen]);

  return (
    <nav className={styles.root}>
      <NavLink to="/trade" className={styles.logo} aria-label="Rocky home">
        <img src="/logo.svg" alt="Rocky" className={styles.logoImage} />
      </NavLink>
      <div className={styles.nav}>
        {/* 临时隐藏「个人中心」(Portfolio) 顶部入口 —— 仅临时注释, 请勿删除, 后续需恢复。
        <NavLink
          to="/portfolio"
          className={styles.link}
          activeClassName={styles.active}
          isActive={(_match, location) => location.pathname === "/" || location.pathname.startsWith("/portfolio")}
        >
          <Trans>Portfolio</Trans>
        </NavLink>
        */}
        <NavLink to="/trade" className={styles.link} activeClassName={styles.active}>
          <Trans>Trade</Trans>
        </NavLink>
      </div>
      <div className={styles.right}>
        {rightExtra}
        <div className={styles.langWrap} ref={languageRef}>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.langBtn}`}
            aria-label="language"
            aria-expanded={isLanguageOpen}
            onClick={handleLanguageToggle}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 21 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.75 10H17.75" />
              <path d="M10.25 2.5C12.3 4.7 13.5 7.3 13.5 10s-1.2 5.3-3.25 7.5C8.2 15.3 7 12.7 7 10s1.2-5.3 3.25-7.5Z" />
              <circle cx="10.25" cy="10" r="7.5" />
            </svg>
            <svg
              className={cx(styles.caret, isLanguageOpen && styles.caretOpen)}
              width="12"
              height="12"
              viewBox="0 0 256 256"
              fill="currentColor"
            >
              <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
            </svg>
          </button>
          {isLanguageOpen ? (
            <div className={styles.langMenu}>
              <div className={styles.langMenuHeader}>
                <span>Language</span>
                <svg
                  className={styles.langMenuHeaderIcon}
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 13.5L11.5 6.5L8 13.5" />
                  <path d="M9 11.5H14" />
                  <path d="M6 2V3.5" />
                  <path d="M2 3.5H10" />
                  <path d="M8 3.5C8 5.0913 7.36786 6.61742 6.24264 7.74264C5.11742 8.86786 3.5913 9.5 2 9.5" />
                  <path d="M4.34192 5.5C4.75558 6.67001 5.52186 7.68297 6.53519 8.39935C7.54853 9.11572 8.75906 9.50026 10 9.5" />
                </svg>
              </div>
              {LANGUAGE_OPTIONS.map((item) => {
                const isActive = i18n.locale === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={cx(styles.langItem, isActive && styles.langItemActive)}
                    onClick={() => handleLanguageSelect(item.key)}
                    disabled={isLanguageSwitching}
                  >
                    <span>{item.label}</span>
                    {isActive ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <button type="button" className={styles.iconBtn} aria-label="settings" onClick={handleSettingsClick}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3.9a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2a7 7 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 1.7 1l.4 2.5h5l.4-2.5a7 7 0 0 0 1.7-1l2.3.9 2-3.4-2-1.5c.07-.3.1-.6.1-1Z" />
          </svg>
        </button>
        <button type="button" className={styles.connect} onClick={handleWalletClick} data-tour="connect">
          {walletLabel || <Trans>Connect wallet</Trans>}
        </button>
      </div>
      <CantonFundsModal open={fundsOpen} onClose={() => setFundsOpen(false)} />
    </nav>
  );
}

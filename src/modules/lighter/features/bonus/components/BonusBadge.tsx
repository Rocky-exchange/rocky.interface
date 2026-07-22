import { Trans, t } from "@lingui/macro";
import { NavLink } from "react-router-dom";

import styles from "./BonusBadge.module.scss";
import { formatUsdcx } from "./BonusBalanceCard";
import { useBonusStatus } from "../api/useBonus";

type BadgePresentation = {
  ariaLabel?: string;
  status: "active" | "expired_pending" | "frozen" | "recalled" | "redeem" | "unavailable";
  to: string;
  content: React.ReactNode;
};

export function BonusBadge() {
  const { data, error, isLoading } = useBonusStatus();

  if (!data && isLoading) {
    return (
      <NavLink
        exact
        to="/bonus"
        className={`${styles.badge} ${styles.loading}`}
        data-status="loading"
        aria-label={t`Loading trial funds`}
      >
        <span className={styles.skeleton} data-bonus-skeleton="true" aria-hidden="true" />
      </NavLink>
    );
  }

  const presentation = getPresentation(data, Boolean(error));

  return (
    <NavLink
      exact
      to={presentation.to}
      className={styles.badge}
      data-status={presentation.status}
      aria-label={presentation.ariaLabel}
    >
      <span className={styles.mark} aria-hidden="true">
        RX
      </span>
      {presentation.content}
    </NavLink>
  );
}

function getPresentation(data: ReturnType<typeof useBonusStatus>["data"], hasError: boolean): BadgePresentation {
  if (!data) {
    if (hasError) {
      return {
        status: "unavailable",
        to: "/bonus",
        content: <Trans>Trial funds unavailable</Trans>,
      };
    }

    return {
      status: "redeem",
      to: "/bonus/redeem",
      content: <Trans>Redeem</Trans>,
    };
  }

  if (!data.has_bonus) {
    return {
      status: "redeem",
      to: "/bonus/redeem",
      content: <Trans>Redeem</Trans>,
    };
  }

  if (data.status === "frozen") {
    return {
      status: "frozen",
      to: "/bonus",
      content: <Trans>Trial funds frozen</Trans>,
    };
  }

  if (data.status === "expired_pending") {
    return {
      status: "expired_pending",
      to: "/bonus",
      content: <Trans>Trial funds expiring</Trans>,
    };
  }

  if (data.status === "recalled") {
    return {
      status: "recalled",
      to: "/bonus",
      content: <Trans>Trial funds recalled</Trans>,
    };
  }

  if (data.status === "active") {
    const amount = formatUsdcx(data.bonus_balance);
    return {
      status: "active",
      to: "/bonus",
      ariaLabel: t`Trial funds: ${amount}`,
      content: (
        <>
          <span className={styles.fullAmount}>{amount}</span>
          <span className={styles.compactLabel} aria-hidden="true">
            <Trans>Bonus</Trans>
          </span>
        </>
      ),
    };
  }

  return {
    status: "unavailable",
    to: "/bonus",
    content: <Trans>Trial funds unavailable</Trans>,
  };
}

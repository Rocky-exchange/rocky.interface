import { Trans, t } from "@lingui/macro";
import { NavLink } from "react-router-dom";

import styles from "./BonusBadge.module.scss";
import { formatUsda } from "./BonusBalanceCard";
import { useBonusStatus } from "../api/useBonus";

type BadgePresentation = {
  ariaLabel?: string;
  status: "active" | "expired_pending" | "frozen" | "loading" | "recalled" | "redeem" | "unavailable";
  to: string;
  content: React.ReactNode;
};

type Props = {
  onClick?: () => void;
};

export function BonusBadge({ onClick }: Props = {}) {
  const { data, error, isLoading } = useBonusStatus();

  const presentation: BadgePresentation =
    !data && isLoading
      ? {
          status: "loading",
          to: "/bonus",
          ariaLabel: t`Loading trial funds`,
          content: (
            <>
              <span className={styles.skeleton} data-bonus-skeleton="true" aria-hidden="true" />
            </>
          ),
        }
      : getPresentation(data, Boolean(error));
  const className = `${styles.badge} ${presentation.status === "loading" ? styles.loading : ""}`;
  const content =
    presentation.status === "loading" ? (
      presentation.content
    ) : (
      <>
        <span className={styles.mark} aria-hidden="true">
          RX
        </span>
        {presentation.content}
      </>
    );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        data-status={presentation.status}
        aria-label={presentation.ariaLabel}
        disabled={presentation.status === "loading"}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <NavLink
      exact
      to={presentation.to}
      className={className}
      data-status={presentation.status}
      aria-label={presentation.ariaLabel}
    >
      {content}
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
    const amount = formatUsda(data.bonus_balance);
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

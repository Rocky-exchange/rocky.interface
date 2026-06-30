import { Trans } from "@lingui/macro";
import cx from "classnames";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { shortenAddress } from "lib/legacy";
import useWallet from "lib/wallets/useWallet";
import { buildAccountDashboardUrl } from "shared/utils/buildAccountDashboardUrl";

import "./AddressView.scss";

type Address = `0x${string}`;

const lengths = { S: 9, M: 13, L: 13, XL: 13 };

type AddressViewProps = {
  address: string;
  size: number;
  ensName?: string;
  avatarUrl?: string;
  breakpoint?: keyof typeof lengths;
  maxLength?: number;
  noLink?: boolean;
  big?: boolean;
};

function AddressAvatar({ address, size }: { address: string; size: number }) {
  const label = address.replace(/^0x/, "").slice(0, 2).toUpperCase() || "--";

  return (
    <span
      aria-hidden="true"
      className="AddressView-ens-avatar"
      style={{
        alignItems: "center",
        background: "linear-gradient(135deg, #1f8f7a, #2858a8)",
        backgroundImage: undefined,
        color: "#fff",
        display: "inline-flex",
        fontSize: `${Math.max(10, Math.round(size * 0.38))}px`,
        fontWeight: 700,
        height: `${size}px`,
        justifyContent: "center",
        lineHeight: 1,
        width: `${size}px`,
      }}
    >
      {label}
    </span>
  );
}

export default function AddressView({
  address,
  ensName,
  avatarUrl,
  size = 24,
  breakpoint,
  maxLength,
  noLink,
  big,
}: AddressViewProps) {
  const { account } = useWallet();
  const strLength = (breakpoint && lengths[breakpoint]) ?? maxLength;

  const trader = useMemo(() => {
    let trader;

    if (strLength) {
      trader = (ensName ? "" : "0x") + shortenAddress(ensName || address.replace(/^0x/, ""), strLength, 0);
    } else {
      trader = ensName || address;
    }

    if (account === address) {
      return (
        <span className="flex items-center gap-4">
          <Trans>You</Trans> <span className="text-typography-secondary">{trader}</span>
        </span>
      );
    }

    return trader;
  }, [account, address, ensName, strLength]);

  const style = useMemo(
    () => ({
      width: `${size}px`,
      height: `${size}px`,
      backgroundImage: `url(${avatarUrl})`,
    }),
    [avatarUrl, size]
  );

  const textClassName = big ? "text-body-large" : "text-body-medium";

  if (noLink) {
    return (
      <div className="AddressView">
        {avatarUrl ? (
          <span className="AddressView-ens-avatar" style={style} />
        ) : (
          <AddressAvatar address={address} size={size} />
        )}
        <span className={cx("AddressView-trader-id", textClassName)}>{trader}</span>
      </div>
    );
  }

  return (
    <Link target="_blank" className="AddressView" to={buildAccountDashboardUrl(address as Address, undefined, 2)}>
      {avatarUrl ? (
        <span className="AddressView-ens-avatar" style={style} />
      ) : (
        <AddressAvatar address={address} size={size} />
      )}
      <span className={cx("AddressView-trader-id", textClassName)}>{trader}</span>
    </Link>
  );
}

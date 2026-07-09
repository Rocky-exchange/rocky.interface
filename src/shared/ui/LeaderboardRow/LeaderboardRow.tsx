import cx from "classnames";

export type LeaderboardRowProps = {
  rank: number | string;
  rankClassName?: string;
  address: string;
  addressTitle?: string;
  /** Custom public display name for this party, if set. Shown in place of the address. */
  displayName?: string;
  points: string;
  isCurrent?: boolean;
  className?: string;
};

export function LeaderboardRow({
  rank,
  rankClassName,
  address,
  addressTitle,
  displayName,
  points,
  isCurrent = false,
  className,
}: LeaderboardRowProps) {
  const primary = displayName || address;
  return (
    <div className={cx("pd-lb-row", { "is-self": isCurrent }, className)}>
      <span className={cx("pd-lb-row__rank", rankClassName)}>{rank}</span>
      <span className="pd-lb-row__addr" title={addressTitle ?? address}>
        {primary}
        {displayName ? <span className="pd-lb-row__addr-sub">{address}</span> : null}
      </span>
      <span className="pd-lb-row__pts">{points}</span>
    </div>
  );
}

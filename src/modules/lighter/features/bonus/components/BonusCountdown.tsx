import { Trans } from "@lingui/macro";
import { useEffect, useState } from "react";

export type BonusCountdownProps = {
  expiresAt?: string;
  className?: string;
};

type CountdownValue = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
};

export function BonusCountdown({ expiresAt, className }: BonusCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const expiry = safeTimestamp(expiresAt);

  useEffect(() => {
    setNow(Date.now());
    if (expiry === null) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [expiry]);

  const countdown = splitCountdown(expiry === null ? 0 : expiry - now);

  return (
    <div
      className={className}
      role="timer"
      aria-label="Bonus expiry countdown"
      aria-live="polite"
      data-expired={countdown.expired ? "true" : "false"}
    >
      <CountdownUnit value={countdown.days} unit="day" label={<Trans>Days</Trans>} />
      <CountdownUnit value={countdown.hours} unit="hour" label={<Trans>Hours</Trans>} />
      <CountdownUnit value={countdown.minutes} unit="minute" label={<Trans>Minutes</Trans>} />
      <CountdownUnit value={countdown.seconds} unit="second" label={<Trans>Seconds</Trans>} />
    </div>
  );
}

function CountdownUnit({
  value,
  unit,
  label,
}: {
  value: number;
  unit: "day" | "hour" | "minute" | "second";
  label: React.ReactNode;
}) {
  return (
    <span data-countdown-unit aria-label={`${value} ${unit}${value === 1 ? "" : "s"}`}>
      <strong data-countdown-value>{String(value).padStart(2, "0")}</strong>
      <span data-countdown-label>{label}</span>
    </span>
  );
}

function safeTimestamp(value?: string): number | null {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function splitCountdown(remainingMs: number): CountdownValue {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1_000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    expired: totalSeconds === 0,
  };
}

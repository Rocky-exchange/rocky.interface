import { Trans } from "@lingui/macro";
import { type CSSProperties, useEffect, useId, useState } from "react";

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
  const countdownId = useId();
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
      aria-labelledby={`${countdownId}-title`}
      aria-live="polite"
      data-expired={countdown.expired ? "true" : "false"}
    >
      <span id={`${countdownId}-title`} style={VISUALLY_HIDDEN}>
        <Trans>Bonus expiry countdown</Trans>
      </span>
      <CountdownUnit id={`${countdownId}-days`} value={countdown.days} label={<Trans>Days</Trans>} />
      <CountdownUnit id={`${countdownId}-hours`} value={countdown.hours} label={<Trans>Hours</Trans>} />
      <CountdownUnit id={`${countdownId}-minutes`} value={countdown.minutes} label={<Trans>Minutes</Trans>} />
      <CountdownUnit id={`${countdownId}-seconds`} value={countdown.seconds} label={<Trans>Seconds</Trans>} />
    </div>
  );
}

function CountdownUnit({ id, value, label }: { id: string; value: number; label: React.ReactNode }) {
  const valueId = `${id}-value`;
  const labelId = `${id}-label`;
  return (
    <span data-countdown-unit role="group" aria-labelledby={`${valueId} ${labelId}`}>
      <strong id={valueId} data-countdown-value>
        {String(value).padStart(2, "0")}
      </strong>
      <span id={labelId} data-countdown-label>
        {label}
      </span>
    </span>
  );
}

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

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

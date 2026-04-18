import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, durationMs = 1400): number {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

export function formatCount(v: number, decimals = 0): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

type CountUpProps = {
  value: number;
  decimals?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

export function CountUp({ value, decimals = 0, durationMs, prefix = "", suffix = "", className }: CountUpProps) {
  const animated = useCountUp(value, durationMs);
  return (
    <span className={className}>
      {prefix}
      {formatCount(animated, decimals)}
      {suffix}
    </span>
  );
}

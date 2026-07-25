const MAX_SPOT_PRICE_DECIMALS = 8;

function meaningfulFractionDigits(value: string): number {
  const normalized = value.trim().replace(/^[+-]/, "");
  const fraction = normalized.split(".", 2)[1];
  if (!fraction) return 0;
  return Math.min(fraction.replace(/0+$/, "").length, MAX_SPOT_PRICE_DECIMALS);
}

/**
 * Format a backend decimal without discarding the market's meaningful tick
 * precision. Backend numeric values carry trailing zeroes, so trimming them
 * gives CC five decimals while keeping CBTC/cETH at their two-decimal ticks.
 */
export function formatSpotPrice(value: string | number | undefined): string {
  if (value === undefined) return "—";
  const raw = String(value);
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) return "—";

  return numeric.toLocaleString("en-US", {
    maximumFractionDigits: meaningfulFractionDigits(raw),
  });
}

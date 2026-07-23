import BigNumber from "bignumber.js";

export type AggregatedOrderBookLevel = {
  price: number;
  size: number;
  total: number;
  quoteSize: number;
  quoteTotal: number;
};
const ALLOWED_DEPTH_VALUES = [
  "0.00000001",
  "0.0000001",
  "0.000001",
  "0.00001",
  "0.0001",
  "0.001",
  "0.01",
  "0.1",
  "1",
  "10",
  "100",
  "1000",
  "10000",
] as const;

const ALLOWED_DEPTH_NUMBERS = ALLOWED_DEPTH_VALUES.map((s) => Number.parseFloat(s));

function roundToTick(price: string | number, tick: number, side: "ask" | "bid"): number {
  const priceValue = new BigNumber(price);
  const tickValue = new BigNumber(tick.toString());
  const roundingMode = side === "ask" ? BigNumber.ROUND_CEIL : BigNumber.ROUND_FLOOR;
  return priceValue.dividedBy(tickValue).integerValue(roundingMode).multipliedBy(tickValue).toNumber();
}

export function aggregateOrderBookLevels(
  levels: [string, string][] | undefined,
  side: "ask" | "bid",
  tickSize: number
): AggregatedOrderBookLevel[] {
  if (!levels || !levels.length) return [];
  if (!Number.isFinite(tickSize) || tickSize <= 0) return [];

  const buckets = new Map<number, number>();

  for (const [priceRaw, sizeRaw] of levels) {
    const price = Number(priceRaw);
    const size = Number(sizeRaw);
    if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) continue;

    const bucketPrice = roundToTick(priceRaw, tickSize, side);
    buckets.set(bucketPrice, (buckets.get(bucketPrice) ?? 0) + size);
  }

  const sorted = Array.from(buckets.entries())
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => (side === "ask" ? a.price - b.price : b.price - a.price));

  let total = 0;
  let quoteTotal = 0;
  return sorted.map((level) => {
    total += level.size;
    const quoteSize = level.price * level.size;
    quoteTotal += quoteSize;
    return { ...level, total, quoteSize, quoteTotal };
  });
}

export function parseOrderBookGroupTick(group?: string): number {
  if (!group) return 0.1;

  const numeric = Number(group.replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0.1;
  return numeric;
}

function snapUpToAllowedDepth(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return Number.parseFloat(ALLOWED_DEPTH_VALUES[0]);
  for (const allowed of ALLOWED_DEPTH_NUMBERS) {
    if (allowed >= value) return allowed;
  }
  return ALLOWED_DEPTH_NUMBERS[ALLOWED_DEPTH_NUMBERS.length - 1];
}

export function buildOrderBookGroupOptions(
  tickSize: string | number | null | undefined,
  count = 4
): string[] {
  const normalized = typeof tickSize === "string" ? tickSize.replace(/,/g, "").trim() : String(tickSize ?? "");
  const base = new BigNumber(normalized);
  if (!base.isFinite() || base.lte(0) || !Number.isInteger(count) || count <= 0) return [];

  return Array.from({ length: count }, (_, index) =>
    base.multipliedBy(new BigNumber(10).pow(index)).toFixed()
  );
}

export function orderBookPriceFractionDigits(tickSize: string | number | null | undefined): number {
  const normalized = typeof tickSize === "string" ? tickSize.replace(/,/g, "").trim() : String(tickSize ?? "");
  const tick = new BigNumber(normalized);
  if (!tick.isFinite() || tick.lte(0)) return 2;
  return Math.max(0, tick.decimalPlaces() ?? 0);
}

export function computeOrderBookGroupOptions(
  orderbook: { bids?: unknown; asks?: unknown } | null | undefined,
  configuredTickSize?: string | number | null
): string[] {
  const fallback = ["0.01", "0.1", "1", "10"];
  const configured = buildOrderBookGroupOptions(configuredTickSize);
  if (configured.length > 0) return configured;

  const collectPrices = (levels: unknown) => {
    if (!Array.isArray(levels)) return [] as number[];

    const output: number[] = [];
    for (const raw of levels) {
      const priceRaw = Array.isArray(raw) ? raw[0] : (raw as { price?: string })?.price;
      const price = Number.parseFloat(String(priceRaw));
      if (Number.isFinite(price)) output.push(price);
    }
    return output;
  };

  const bids = collectPrices(orderbook?.bids);
  const asks = collectPrices(orderbook?.asks);
  const all = [...bids, ...asks];
  if (all.length < 4) return fallback;

  const diffs: number[] = [];
  const pushDiffs = (prices: number[]) => {
    const sorted = [...prices].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      const diff = sorted[i] - sorted[i - 1];
      if (diff > 0 && Number.isFinite(diff)) diffs.push(diff);
    }
  };

  pushDiffs(bids);
  pushDiffs(asks);

  const minDiff = Math.min(...diffs.filter((diff) => diff > 0));
  if (!Number.isFinite(minDiff) || minDiff <= 0) return fallback;

  const base = snapUpToAllowedDepth(minDiff);
  const desired = [base, base * 10, base * 100, base * 1000].map(snapUpToAllowedDepth);
  const unique = Array.from(new Set(desired)).sort((a, b) => a - b);

  if (unique.length >= 4) {
    return unique.slice(0, 4).map((value) => {
      const index = ALLOWED_DEPTH_NUMBERS.indexOf(value);
      return ALLOWED_DEPTH_VALUES[index] ?? String(value);
    });
  }

  const baseIndex = Math.max(0, ALLOWED_DEPTH_NUMBERS.findIndex((value) => value === base));
  const start = Math.max(0, Math.min(baseIndex, ALLOWED_DEPTH_VALUES.length - 4));
  return [...ALLOWED_DEPTH_VALUES.slice(start, start + 4)];
}

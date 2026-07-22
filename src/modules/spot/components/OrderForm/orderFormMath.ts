type Side = "BUY" | "SELL";

type PercentInput = {
  side: Side;
  percent: number;
  price: string;
  baseFree: string;
  quoteFree: string;
};

const FEE_CAP = 0.001;

function positiveNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function format(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(8).replace(/\.?0+$/, "");
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

export function quantityForPercent(input: PercentInput): string {
  const percent = clampPercent(input.percent) / 100;
  const balance = positiveNumber(input.side === "BUY" ? input.quoteFree : input.baseFree);
  if (balance === null) return "";

  if (input.side === "SELL") return format(balance * percent);

  const price = positiveNumber(input.price);
  return price === null ? "" : format((balance * percent) / price);
}

export function calculateOrderSummary(price: string, quantity: string): { total: string; fee: string } {
  const parsedPrice = positiveNumber(price);
  const parsedQuantity = positiveNumber(quantity);
  if (parsedPrice === null || parsedQuantity === null) return { total: "", fee: "" };

  const total = parsedPrice * parsedQuantity;
  if (!Number.isFinite(total) || total <= 0) return { total: "", fee: "" };

  return { total: format(total), fee: format(total * FEE_CAP) };
}

import BigNumber from "bignumber.js";

type Side = "BUY" | "SELL";

type PercentInput = {
  side: Side;
  percent: number;
  price: string;
  baseFree: string;
  quoteFree: string;
};

const Decimal = BigNumber.clone({ DECIMAL_PLACES: 8, ROUNDING_MODE: BigNumber.ROUND_DOWN });
const FEE_CAP = new Decimal("0.001");

function positiveNumber(value: string): BigNumber | null {
  const parsed = new Decimal(value);
  return parsed.isFinite() && parsed.gt(0) ? parsed : null;
}

function format(value: BigNumber, roundingMode: BigNumber.RoundingMode): string {
  if (!value.isFinite()) return "";
  return value.decimalPlaces(8, roundingMode).toFixed();
}

function clampPercent(percent: number): BigNumber {
  const parsed = new Decimal(percent);
  if (!parsed.isFinite() || parsed.isNegative()) return new Decimal(0);
  return parsed.gt(100) ? new Decimal(100) : parsed;
}

export function quantityForPercent(input: PercentInput): string {
  const percent = clampPercent(input.percent);
  const balance = positiveNumber(input.side === "BUY" ? input.quoteFree : input.baseFree);
  if (balance === null) return "";

  if (input.side === "SELL") {
    return format(balance.times(percent).dividedBy(100), BigNumber.ROUND_DOWN);
  }

  const price = positiveNumber(input.price);
  return price === null
    ? ""
    : format(balance.times(percent).dividedBy(price.times(100)), BigNumber.ROUND_DOWN);
}

export function calculateOrderSummary(side: Side, price: string, quantity: string): { total: string; fee: string } {
  const parsedPrice = positiveNumber(price);
  const parsedQuantity = positiveNumber(quantity);
  if (parsedPrice === null || parsedQuantity === null) return { total: "", fee: "" };

  const total = parsedPrice.times(parsedQuantity);
  if (!total.isFinite() || !total.gt(0)) return { total: "", fee: "" };

  return {
    total: format(total, BigNumber.ROUND_HALF_UP),
    fee: format((side === "BUY" ? parsedQuantity : total).times(FEE_CAP), BigNumber.ROUND_HALF_UP),
  };
}

export const DEFAULT_MARKET_AGGRESSION = 0.005;

export function resolveMarketAggression(maxSlippage?: string | number): number {
  if (maxSlippage === undefined) return DEFAULT_MARKET_AGGRESSION;
  const parsed = Number(maxSlippage);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    throw new Error("maxSlippage must be greater than 0 and less than 1");
  }
  return parsed;
}

export function getMarketExecutablePrice(
  referencePrice: number,
  isLong: boolean,
  maxSlippage?: string | number
): number {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error("Market order requires a positive reference price");
  }
  const aggression = resolveMarketAggression(maxSlippage);
  return Number((referencePrice * (isLong ? 1 + aggression : 1 - aggression)).toFixed(6));
}

export function getSafeMarketBuyingPowerUsd(input: {
  availableBalance: number;
  leverage: number;
  referencePrice: number | null;
  isLong: boolean;
  maxSlippage?: string | number;
}): number {
  const { availableBalance, leverage, referencePrice } = input;
  if (
    !Number.isFinite(availableBalance) ||
    availableBalance <= 0 ||
    !Number.isFinite(leverage) ||
    leverage <= 0 ||
    referencePrice === null ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  ) {
    return 0;
  }

  const nominalBuyingPower = availableBalance * leverage;
  const executablePrice = getMarketExecutablePrice(referencePrice, input.isLong, input.maxSlippage);
  const protectedBuyingPower = (nominalBuyingPower * referencePrice) / executablePrice;
  return Math.min(nominalBuyingPower, protectedBuyingPower);
}

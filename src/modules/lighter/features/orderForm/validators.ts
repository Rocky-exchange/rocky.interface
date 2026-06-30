// src/modules/lighter/features/orderForm/validators.ts
import { OrderFormSnapshot, OrderFormValidationError, Mode } from "./types";

export function validateSize(size: string): OrderFormValidationError | null {
  if (!size.trim()) return "SIZE_EMPTY";
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return "SIZE_TOO_SMALL";
  if (n > 1e9) return "SIZE_TOO_LARGE";
  return null;
}

export function validatePrice(price: string, mode: Mode): OrderFormValidationError | null {
  if (mode === "Market") return null;
  if (!price.trim()) return "PRICE_EMPTY";
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return "PRICE_NEGATIVE";
  return null;
}

export function validateLeverage(value: number, max: number): OrderFormValidationError | null {
  if (!Number.isInteger(value) || value < 1 || value > max) return "LEVERAGE_OUT_OF_RANGE";
  return null;
}

export function validateAll(snapshot: OrderFormSnapshot, maxLeverage: number): OrderFormValidationError[] {
  return [
    validateSize(snapshot.size),
    validatePrice(snapshot.price, snapshot.mode),
    validateLeverage(snapshot.leverageValue, maxLeverage),
  ].filter((e): e is OrderFormValidationError => e !== null);
}

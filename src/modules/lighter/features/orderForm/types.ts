// src/modules/lighter/features/orderForm/types.ts
export type BasicMode = "Market" | "Limit";
export type AdvancedMode = "Stop Market" | "Stop Limit" | "Take Profit Market" | "Take Profit Limit";
export type Mode = BasicMode | AdvancedMode;
export type Side = "buy" | "sell";
export type MarginTab = "Cross" | "Isolated";
export type SizeUnit = "BASE" | "USD";

export type OrderFormSnapshot = {
  mode: Mode;
  side: Side;
  leverageValue: number;
  marginTab: MarginTab;
  size: string;
  sizeUnit: SizeUnit;
  price: string;
  tp: string;
  sl: string;
};

export type OrderFormValidationError =
  | "SIZE_EMPTY"
  | "SIZE_TOO_SMALL"
  | "SIZE_TOO_LARGE"
  | "PRICE_EMPTY"
  | "PRICE_NEGATIVE"
  | "TP_INVALID"
  | "SL_INVALID"
  | "LEVERAGE_OUT_OF_RANGE";

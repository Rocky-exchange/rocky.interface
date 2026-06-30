// src/modules/lighter/features/orderForm/useOrderInfoRows.ts
import type { ReactNode } from "react";

import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import type { PreviewState } from "../../adapters/useOrderPreviewAdapter";
import { usePositionsAdapter } from "../../adapters/usePositionsAdapter";

import { getCurrentOrderFormPosition, getProjectedOrderFormPositionValue } from "./desktop/orderFormPosition";
import { formatPreviewFeeRatePercent } from "./desktop/orderPreviewFeeFormat";
import type { Side } from "./types";

export type UseOrderInfoRowsArgs = {
  preview: PreviewState;
  side: Side;
  amountNum: number;
  baseSymbol: string;
  reduceOnly?: boolean;
};

export type UseOrderInfoRowsReturn = {
  availableToTrade: string;
  position: ReactNode;
  orderSize: string;
  orderValue: string;
  estPrice: string;
  slippage: string;
  fees: string;
};

const PLACEHOLDER = "—";

function fmtUsdString(s?: string | null): string {
  if (s == null || s === "") return PLACEHOLDER;
  const n = Number(s);
  if (!Number.isFinite(n)) return PLACEHOLDER;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtUsdNumber(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(s: string | null | undefined, fallback: string): string {
  if (s == null || s === "") return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return `${(n * 100).toFixed(2)}%`;
}

/**
 * Formats the already-fetched order preview (+ available balance + position
 * projection) into the read-only info rows shown on the H5 order sheet.
 * No network calls of its own — `preview` is passed in from
 * useOrderAmountPreview. Mirrors desktop MarketOrderForm field semantics.
 */
export function useOrderInfoRows({
  preview,
  side,
  amountNum,
  baseSymbol,
  reduceOnly = false,
}: UseOrderInfoRowsArgs): UseOrderInfoRowsReturn {
  const { available } = useAvailableBalanceAdapter();
  const positions = usePositionsAdapter();
  const data = preview.data;

  const currentPosition = getCurrentOrderFormPosition(positions, baseSymbol);
  const position = getProjectedOrderFormPositionValue(currentPosition, baseSymbol, amountNum, side, reduceOnly);

  const availableToTrade =
    data?.available_balance != null && data.available_balance !== ""
      ? fmtUsdString(data.available_balance)
      : available != null
        ? fmtUsdNumber(available)
        : PLACEHOLDER;

  const orderSize = data?.order_size_symbol ? data.order_size_symbol : PLACEHOLDER;
  const orderValue = fmtUsdString(data?.order_value);
  const estPrice = data?.est_price ? Number(data.est_price).toLocaleString() : PLACEHOLDER;
  const slippage = `Est: ${fmtPct(data?.est_slippage, "0.00%")} | Max: ${fmtPct(data?.max_slippage, "1.00%")}`;
  const fees = `Taker: ${formatPreviewFeeRatePercent(data?.taker_fee_rate)} | Maker: ${formatPreviewFeeRatePercent(
    data?.maker_fee_rate
  )}`;

  return { availableToTrade, position, orderSize, orderValue, estPrice, slippage, fees };
}

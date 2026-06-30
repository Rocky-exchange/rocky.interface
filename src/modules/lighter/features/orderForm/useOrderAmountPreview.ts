// src/modules/lighter/features/orderForm/useOrderAmountPreview.ts
import { useEffect, useState } from "react";

import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import {
  useOrderPreviewAdapter,
  usePreviewErrorMessage,
  type PreviewState,
} from "../../adapters/useOrderPreviewAdapter";

import type { Mode, Side, SizeUnit } from "./types";

export type UseOrderAmountPreviewArgs = {
  side: Side;
  mode: Mode;
  rawSize: string;
  sizeUnit: SizeUnit;
  /** Only used when mode === "Limit". */
  limitPrice: string;
  leverage: number;
  marginMode: "cross" | "isolated";
};

export type UseOrderAmountPreviewReturn = {
  amountNum: number;
  amountReady: boolean;
  preview: PreviewState;
  costMargin: number | null;
  liqPrice: number | null;
  previewErrorMessage: string | null;
};

function toFiniteNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Owns the error-prone USD↔token conversion + order preview for the H5 sheet.
 * Market: lock the first valid markPrice as a conversion snapshot (ticker
 * polls every 2s; a live price would thrash the preview SWR key). Resnap when
 * the user changes size or unit. Limit: the limit price IS the conversion
 * price (deterministic — no markPrice needed).
 */
export function useOrderAmountPreview({
  side,
  mode,
  rawSize,
  sizeUnit,
  limitPrice,
  leverage,
  marginMode,
}: UseOrderAmountPreviewArgs): UseOrderAmountPreviewReturn {
  const isLimit = mode === "Limit";
  const market = useMarketInfoAdapter();
  const markPrice = market.markPrice;
  const rawSizeNum = toFiniteNumber(rawSize);
  const limitPriceNum = toFiniteNumber(limitPrice);

  const [conversionPrice, setConversionPrice] = useState<number | null>(null);
  useEffect(() => {
    if (conversionPrice == null && markPrice != null && markPrice > 0) {
      setConversionPrice(markPrice);
    }
  }, [conversionPrice, markPrice]);
  useEffect(() => {
    if (markPrice != null && markPrice > 0) setConversionPrice(markPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSize, sizeUnit]);

  // Tentative amount drives the preview request. Market uses only the snapshot
  // (est_price comes FROM the preview — chicken/egg), Limit uses the limit price.
  const tentativeAmount =
    sizeUnit === "USD"
      ? isLimit
        ? limitPriceNum > 0
          ? rawSizeNum / limitPriceNum
          : 0
        : conversionPrice && conversionPrice > 0
          ? rawSizeNum / conversionPrice
          : 0
      : rawSizeNum;

  const preview = useOrderPreviewAdapter({
    side,
    orderType: isLimit ? "limit" : "market",
    amount: tentativeAmount,
    leverage,
    marginMode,
    price: isLimit && limitPriceNum > 0 ? limitPriceNum : undefined,
  });

  const previewEstPrice = preview.data?.est_price ? Number(preview.data.est_price) : null;
  const effectivePrice = isLimit
    ? limitPriceNum > 0
      ? limitPriceNum
      : null
    : conversionPrice ?? (previewEstPrice && previewEstPrice > 0 ? previewEstPrice : null);

  const amountNum =
    sizeUnit === "USD" ? (effectivePrice && effectivePrice > 0 ? rawSizeNum / effectivePrice : 0) : rawSizeNum;
  const amountReady = Number.isFinite(amountNum) && amountNum > 0;

  const costMargin = preview.data?.position_margin_after ? Number(preview.data.position_margin_after) : null;
  const liqPrice = preview.data?.est_liq_price ? Number(preview.data.est_liq_price) : null;
  const previewErrorMessage = usePreviewErrorMessage(preview);

  return { amountNum, amountReady, preview, costMargin, liqPrice, previewErrorMessage };
}

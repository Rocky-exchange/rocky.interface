import { useEffect, useRef, useState } from "react";

import { useAccount } from "wagmi";

import { useChainId } from "lib/chains";
import { getOrderPreview } from "modules/cex/lib/api/custom/client";
import type { OrderPreviewData, OrderPreviewRequest } from "modules/cex/lib/api/types";
import { useX10000State } from "modules/cex/store/X10000StateContext";

export type PreviewInput = {
  side: "buy" | "sell";
  orderType: "market" | "limit";
  amount: number;
  leverage: number;
  marginMode?: "cross" | "isolated";
  reduceOnly?: boolean;
  price?: number;
  /** 防抖间隔(ms),默认 300 */
  debounceMs?: number;
};

export type PreviewState = {
  data: OrderPreviewData | null;
  loading: boolean;
  error: string | null;
};

const EMPTY: PreviewState = { data: null, loading: false, error: null };

function toAmountString(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  // 保留 8 位精度,去除尾部 0
  return parseFloat(n.toFixed(8)).toString();
}

/**
 * 调用 POST /api/v1/orders/preview 获取订单预估信息。
 * 当输入变化(数量/杠杆/价格/方向/reduceOnly)时自动请求(防抖)。
 * 未连钱包、数量 <= 0 或缺失必要字段时返回空状态。
 */
export function useOrderPreviewAdapter(input: PreviewInput): PreviewState {
  const { chainId } = useChainId();
  const { address } = useAccount();
  const { selectedSymbol } = useX10000State();
  const [state, setState] = useState<PreviewState>(EMPTY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const amount = input.amount;
    const priceNeeded = input.orderType === "limit";
    const priceValid = !priceNeeded || (input.price != null && input.price > 0);

    if (!chainId || !selectedSymbol || !Number.isFinite(amount) || amount <= 0 || !priceValid) {
      setState(EMPTY);
      return;
    }

    const request: OrderPreviewRequest = {
      symbol: selectedSymbol,
      side: input.side,
      order_type: input.orderType,
      amount: toAmountString(amount),
      leverage: input.leverage,
      margin_mode: input.marginMode ?? "cross",
      reduce_only: input.reduceOnly ?? false,
      ...(priceNeeded && input.price != null ? { price: toAmountString(input.price) } : {}),
    };

    const debounce = input.debounceMs ?? 300;
    if (timerRef.current) clearTimeout(timerRef.current);
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const myReqId = ++reqIdRef.current;

    timerRef.current = setTimeout(async () => {
      try {
        const res = (await getOrderPreview(chainId, request, address)) as any;
        if (myReqId !== reqIdRef.current) return; // 过期请求
        // 兼容两种响应形态:
        // 1) 文档版:{ success, data, error, timestamp }
        // 2) 实际版:扁平 OrderPreviewData 对象
        const data: OrderPreviewData | null =
          res && typeof res === "object" && "order_size" in res ? (res as OrderPreviewData) : res?.data ?? null;
        if (data) {
          setState({ data, loading: false, error: null });
        } else {
          const err = typeof res?.error === "string" ? res.error : res?.error?.message ?? "Preview failed";
          setState({ data: null, loading: false, error: err });
        }
      } catch (e: any) {
        if (myReqId !== reqIdRef.current) return;
        setState({ data: null, loading: false, error: e?.message ?? String(e) });
      }
    }, debounce);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    chainId,
    address,
    selectedSymbol,
    input.side,
    input.orderType,
    input.amount,
    input.leverage,
    input.marginMode,
    input.reduceOnly,
    input.price,
    input.debounceMs,
  ]);

  return state;
}

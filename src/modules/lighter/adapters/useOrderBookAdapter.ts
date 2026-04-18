import { useMemo } from "react";

import { useChainId } from "lib/chains";
import { useApiOrderbook } from "modules/cex/lib/api/hooks";
import { useX10000State } from "modules/cex/store/X10000StateContext";

import { aggregateOrderBookLevels, parseOrderBookGroupTick } from "./orderBookAggregation";

export type OrderBookLevel = {
  price: number;
  size: number;
  total: number;
  quoteSize: number;
  quoteTotal: number;
};
export type OrderBookData = {
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  spread: number;
  spreadPct: number;
  tickSize: number;
};

const EMPTY: OrderBookData = { asks: [], bids: [], spread: 0, spreadPct: 0, tickSize: 0.1 };

/**
 * 把 API [price, size] 累计成 { price, size, total }:
 * - asks: 价格升序,cumulative 从 best ask 外扩
 * - bids: 价格降序,cumulative 从 best bid 外扩
 */
export function useOrderBookAdapter(group?: string): OrderBookData {
  const { chainId } = useChainId();
  const { selectedSymbol } = useX10000State();
  const { orderbook } = useApiOrderbook(chainId, selectedSymbol ?? undefined);

  return useMemo(() => {
    if (!orderbook || (!orderbook.asks?.length && !orderbook.bids?.length)) return EMPTY;

    const tickSize = parseOrderBookGroupTick(group);
    const asks = aggregateOrderBookLevels(orderbook.asks, "ask", tickSize);
    const bids = aggregateOrderBookLevels(orderbook.bids, "bid", tickSize);
    if (!asks.length || !bids.length) return EMPTY;

    const spread = asks[0].price - bids[0].price;
    const mid = (asks[0].price + bids[0].price) / 2;
    const spreadPct = mid > 0 ? (spread / mid) * 100 : 0;

    return { asks, bids, spread, spreadPct, tickSize };
  }, [group, orderbook]);
}

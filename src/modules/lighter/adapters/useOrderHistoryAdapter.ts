import { useMemo } from "react";

import { useUserAccountTrades, useUserApiOrders } from "modules/lighter/api";

type LighterOrderHistoryStatus = "filled" | "cancelled" | "rejected" | "expired" | "--";

export type LighterOrderHistoryRow = {
  id: string;
  market: string;
  side: "long" | "short" | "--";
  date: number;
  type: string;
  amount: number | null;
  filled: number | null;
  price: number | null;
  average: number | null;
  reduceOnly: boolean | null;
  status: LighterOrderHistoryStatus;
};

const CLOSED_STATUSES = new Set(["filled", "cancelled", "rejected", "expired"]);

function toNumber(value: string | number | null | undefined) {
  if (value == null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toTimestamp(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOrderSide(side: string | null | undefined): LighterOrderHistoryRow["side"] {
  if (side === "buy") return "long";
  if (side === "sell") return "short";
  return "--";
}

function toOrderStatus(status: string | null | undefined): LighterOrderHistoryStatus {
  if (status === "filled" || status === "cancelled" || status === "rejected" || status === "expired") {
    return status;
  }
  return "--";
}

export function useOrderHistoryAdapter(): LighterOrderHistoryRow[] {
  const { apiOrders } = useUserApiOrders();
  const { trades } = useUserAccountTrades();

  return useMemo(() => {
    const closedOrderRows: LighterOrderHistoryRow[] = (apiOrders ?? [])
      .filter((order) => CLOSED_STATUSES.has(order.status))
      .map((order) => ({
        id: order.id,
        market: order.symbol?.replace(/-PERP$/i, "").replace(/USDT$/i, "") || "--",
        side: toOrderSide(order.side),
        date: toTimestamp(order.updated_at || order.created_at),
        type: order.order_type === "market" ? "Market" : "Limit",
        amount: toNumber(order.size),
        filled: toNumber(order.filled_amount ?? order.filled_size),
        price: toNumber(order.price),
        average: toNumber(order.average_price),
        reduceOnly: order.reduce_only ?? null,
        status: toOrderStatus(order.status),
      }));

    // The current Rocky endpoint only persists open orders. Once an order is
    // completely filled it disappears from /v1/orders/me, while its execution
    // remains authoritative in /v1/trades/me. Surface those executions as
    // filled order-history rows until the backend ships a closed-order store.
    const knownIds = new Set(closedOrderRows.map((order) => order.id));
    const filledTradeRows: LighterOrderHistoryRow[] = (trades ?? [])
      .filter((trade) => !knownIds.has(trade.order_id || trade.id))
      .map((trade) => ({
        id: trade.order_id || trade.id,
        market: trade.symbol?.replace(/-PERP$/i, "").replace(/USDT$/i, "") || "--",
        side: toOrderSide(trade.side),
        date: toTimestamp(trade.executed_at || trade.created_at || trade.timestamp),
        type: "Market",
        amount: toNumber(trade.amount ?? trade.size),
        filled: toNumber(trade.amount ?? trade.size),
        price: toNumber(trade.price),
        average: toNumber(trade.price),
        reduceOnly: trade.reduce_only ?? null,
        status: "filled",
      }));

    return [...closedOrderRows, ...filledTradeRows].sort((a, b) => b.date - a.date);
  }, [apiOrders, trades]);
}

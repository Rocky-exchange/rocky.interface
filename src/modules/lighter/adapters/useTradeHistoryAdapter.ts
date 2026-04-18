import { useMemo } from "react";

import { useUserAccountTrades } from "modules/cex/lib/api";

export type LighterTradeHistoryRow = {
  id: string;
  market: string;
  side: string;
  date: number;
  tradeValue: number | null;
  size: number | null;
  price: number | null;
  closedPnl: number | null;
  fee: number | null;
  role: string;
  type: string;
};

function toNumber(value: string | number | null | undefined) {
  if (value == null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function useTradeHistoryAdapter(): LighterTradeHistoryRow[] {
  const { trades } = useUserAccountTrades();

  return useMemo(() => {
    return (trades ?? [])
      .map((trade) => {
        const price = toNumber(trade.price);
        const size = toNumber(trade.amount);
        const tradeValue = price != null && size != null ? price * size : null;

        return {
          id: trade.id,
          market: trade.symbol?.replace(/USDT$/i, "") || "--",
          side: trade.side === "buy" ? "Open Long" : trade.side === "sell" ? "Open Short" : "--",
          date: typeof trade.timestamp === "string" ? new Date(trade.timestamp).getTime() : trade.timestamp,
          tradeValue,
          size,
          price,
          closedPnl: toNumber(trade.realized_pnl),
          fee: toNumber(trade.fee),
          role: "Taker",
          type: "Trade",
        };
      })
      .sort((a, b) => b.date - a.date);
  }, [trades]);
}

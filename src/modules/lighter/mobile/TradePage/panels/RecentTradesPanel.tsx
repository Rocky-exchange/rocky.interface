// src/modules/lighter/mobile/TradePage/panels/RecentTradesPanel.tsx
import { useEffect, useMemo, useState } from "react";
import { Trans } from "@lingui/macro";

import { useTradesUpdates } from "modules/lighter/api";
import { useApiTrades } from "modules/lighter/api/hooks";
import { useChainId } from "lib/chains";

import { useTradeState } from "@/modules/lighter/store/TradeStateContext";

import styles from "./RecentTradesPanel.module.scss";

type TradeRow = {
  id: string;
  price: string;
  amount: string;
  side: "buy" | "sell";
  timestamp: number | string;
};

function formatPrice(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function formatAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  // Up to 6 significant digits; trim trailing zeros
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function RecentTradesPanel() {
  const { chainId } = useChainId();
  const { selectedSymbol } = useTradeState();
  const { trades } = useApiTrades(chainId, selectedSymbol ?? undefined, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const { lastTrade } = useTradesUpdates(chainId, selectedSymbol ?? undefined);
  const [tradeList, setTradeList] = useState<TradeRow[]>([]);

  useEffect(() => {
    setTradeList(trades?.trades ?? []);
  }, [selectedSymbol, trades?.trades]);

  useEffect(() => {
    if (!lastTrade) return;

    const id =
      lastTrade.id ??
      `${selectedSymbol ?? "UNKNOWN"}:${lastTrade.timestamp}:${lastTrade.price}:${lastTrade.amount}:${lastTrade.side}`;

    setTradeList((prev) => {
      if (prev.some((t) => t.id === id)) return prev;
      return [{ ...lastTrade, id }, ...prev].slice(0, 100);
    });
  }, [lastTrade, selectedSymbol]);

  const rows = useMemo(() => tradeList.slice(0, 50), [tradeList]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span>
          <Trans>Price</Trans>
        </span>
        <span>
          <Trans>Size</Trans>
        </span>
        <span>
          <Trans>Time</Trans>
        </span>
      </div>
      <div className={styles.body}>
        {rows.map((t, i) => {
          const isBuy = t.side === "buy";
          const ts = typeof t.timestamp === "number" ? t.timestamp : Number(t.timestamp);
          const time = !Number.isNaN(ts)
            ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
            : "—";
          return (
            <div key={`${t.id}-${i}`} className={styles.row}>
              <span style={{ color: isBuy ? "var(--ltr-up)" : "var(--ltr-down)" }}>{formatPrice(t.price)}</span>
              <span>{formatAmount(t.amount)}</span>
              <span className={styles.time}>{time}</span>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className={styles.empty}>
            <Trans>No trades yet</Trans>
          </div>
        )}
      </div>
    </div>
  );
}

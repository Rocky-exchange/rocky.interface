import { useMarketInfoAdapter } from "@/modules/lighter/adapters/useMarketInfoAdapter";
import { useTradeState } from "@/modules/lighter/store/TradeStateContext";

import styles from "./MarketHeaderRow.module.scss";

function fmt(n: number | null, d = 2): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number | null, fixed = 2): string {
  if (n == null) return "— %";
  return `${n.toFixed(fixed)}%`;
}

function changeColorVar(change24hPct: number | null): string {
  if (change24hPct == null) return "var(--ltr-text-secondary)";
  return change24hPct >= 0 ? "var(--ltr-up)" : "var(--ltr-down)";
}

type Props = {
  onOpenMarketSelector: () => void;
};

export function MarketHeaderRow({ onOpenMarketSelector }: Props) {
  const { selectedSymbol } = useTradeState();
  const m = useMarketInfoAdapter();

  // Derive base token from symbol (e.g. "BTC-USDT" → "BTC").
  // useMarketInfoAdapter does not expose baseSymbol directly.
  const base = (m.symbol || selectedSymbol)?.split("-")[0] ?? "BTC";
  const changeColor = changeColorVar(m.change24hPct);

  return (
    <button type="button" onClick={onOpenMarketSelector} className={styles.row}>
      <div className={styles.left}>
        <span className={styles.symbol}>{base}</span>
        <span className={styles.leverage}>50x</span>
      </div>
      <div className={styles.right}>
        <span className={styles.price}>{fmt(m.markPrice, 1)}</span>
        <span className={styles.change} style={{ color: changeColor }}>
          {fmtPct(m.change24hPct)}
        </span>
        <span className={styles.caret} aria-hidden>
          ▼
        </span>
      </div>
    </button>
  );
}

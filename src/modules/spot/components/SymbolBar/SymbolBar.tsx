import { spotApi, type Ticker24h } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import { SpotMarketDropdown } from "./MarketDropdown";
import styles from "./SymbolBar.module.scss";

function fmtNum(v: string, digits = 2): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function SpotSymbolBar({ symbol }: { symbol: string }) {
  const { data: t } = usePolling<Ticker24h>(() => spotApi.ticker(symbol), 3000, [symbol]);
  const pct = t ? parseFloat(t.priceChangePercent) : 0;
  const pctCls = pct > 0 ? styles.up : pct < 0 ? styles.down : styles.muted;
  const base = symbol.split("-")[0];

  return (
    <div className={styles.bar}>
      <SpotMarketDropdown symbol={symbol} />
      <div className={styles.divider} />
      <div className={styles.stats}>
        <div className={styles.priceMain}>{t ? fmtNum(t.lastPrice) : "—"}</div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>24h Change</span>
          <span className={`${styles.cellValue} ${pctCls}`}>
            {t ? `${pct >= 0 ? "+" : ""}${fmtNum(t.priceChange)}` : "—"}{" "}
            <span className={pctCls}>{t ? `(${pct.toFixed(3)}%)` : ""}</span>
          </span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>24h High</span>
          <span className={styles.cellValue}>{t ? fmtNum(t.highPrice) : "—"}</span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>24h Low</span>
          <span className={styles.cellValue}>{t ? fmtNum(t.lowPrice) : "—"}</span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>24h Vol {base}</span>
          <span className={styles.cellValue}>{t ? fmtNum(t.volume, 4) : "—"}</span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>24h Vol USDA</span>
          <span className={styles.cellValue}>{t ? fmtNum(t.quoteVolume) : "—"}</span>
        </div>
      </div>
    </div>
  );
}

import { Trans } from "@lingui/macro";

import { SpotMarketDropdown } from "./MarketDropdown";
import styles from "./SymbolBar.module.scss";
import { getCachedSpotIconUrl, spotApi, type Ticker24h } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";

function fmtNum(v: string, digits = 2): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function SpotSymbolBarContent({ market }: { market: SpotMarket }) {
  const { data: t } = usePolling<Ticker24h>(() => spotApi.ticker(market.apiSymbol), 3000, [market.apiSymbol]);
  const iconUrl = t?.iconUrl ?? getCachedSpotIconUrl(market.apiSymbol);
  const pct = t ? parseFloat(t.priceChangePercent) : 0;
  const pctCls = pct > 0 ? styles.up : pct < 0 ? styles.down : styles.muted;

  return (
    <div className={styles.bar}>
      <SpotMarketDropdown market={market} iconUrl={iconUrl} iconLoading={!iconUrl && !t} />
      <div className={styles.divider} />
      <div className={styles.stats}>
        <div className={styles.priceBlock}>
          <div className={styles.priceMain}>{t ? fmtNum(t.lastPrice) : "—"}</div>
          <span className={styles.priceQuote}>
            <Trans>Last Price</Trans>
          </span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>
            <Trans>24h Change</Trans>
          </span>
          <span className={`${styles.cellValue} ${pctCls}`}>
            {t ? `${pct >= 0 ? "+" : ""}${fmtNum(t.priceChange)}` : "—"}{" "}
            <span className={pctCls}>{t ? `(${pct.toFixed(3)}%)` : ""}</span>
          </span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>
            <Trans>24h High</Trans>
          </span>
          <span className={styles.cellValue}>{t ? fmtNum(t.highPrice) : "—"}</span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>
            <Trans>24h Low</Trans>
          </span>
          <span className={styles.cellValue}>{t ? fmtNum(t.lowPrice) : "—"}</span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>
            <Trans>24h Vol</Trans> {market.displayBase}
          </span>
          <span className={styles.cellValue}>{t ? fmtNum(t.volume, 4) : "—"}</span>
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>
            <Trans>24h Vol</Trans> {market.displayQuote}
          </span>
          <span className={styles.cellValue}>{t ? fmtNum(t.quoteVolume) : "—"}</span>
        </div>
      </div>
    </div>
  );
}

export function SpotSymbolBar({ market }: { market: SpotMarket }) {
  return <SpotSymbolBarContent key={market.apiSymbol} market={market} />;
}

import { useMemo, useState } from "react";
import { useHistory } from "react-router-dom";

import TokenIcon from "@/shared/components/TokenIcon/TokenIcon";

import { SelectorBase, useSelectorClose } from "components/SelectorBase/SelectorBase";

import styles from "./MarketDropdown.module.scss";
import { spotApi, type Ticker24h } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import { SPOT_MARKETS, spotMarketAssetIconSymbol } from "../../markets";

type Market = (typeof SPOT_MARKETS)[number];

export function AssetBadge({ symbol, size = 22 }: { symbol: string; size?: number }) {
  return <TokenIcon symbol={spotMarketAssetIconSymbol(symbol)} displaySize={size} />;
}

function fmtPrice(v: string | undefined): string {
  const n = v ? parseFloat(v) : NaN;
  if (!isFinite(n) || n === 0) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmtPct(v: string | undefined): string {
  const n = v ? parseFloat(v) : NaN;
  if (!isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** One row in the panel — polls its own ticker for last price + 24h%. */
function MarketRow({ market, active, query }: { market: Market; active: boolean; query: string }) {
  const history = useHistory();
  const close = useSelectorClose();
  const { data: t } = usePolling<Ticker24h>(() => spotApi.ticker(market.symbol), 5000, [market.symbol]);

  const label = `${market.base}/${market.quote}`;
  const q = query.trim().toLowerCase();
  if (q && !label.toLowerCase().includes(q) && !market.symbol.toLowerCase().includes(q)) {
    return null;
  }

  const pct = t ? parseFloat(t.priceChangePercent) : NaN;
  const pctCls = pct > 0 ? styles.up : pct < 0 ? styles.down : styles.muted;

  const onClick = () => {
    history.push(`/spot/${market.symbol}`);
    close();
  };

  return (
    <button type="button" className={`${styles.row} ${active ? styles.rowActive : ""}`} onClick={onClick}>
      <span className={styles.rowLeft}>
        <AssetBadge symbol={market.base} />
        <span className={styles.rowSymbol}>
          {market.base}
          <span className={styles.rowQuote}>/{market.quote}</span>
        </span>
        <span className={styles.rowBadgeSpot}>1x</span>
      </span>
      <span className={styles.rowPrice}>{fmtPrice(t?.lastPrice)}</span>
      <span className={`${styles.rowPct} ${pctCls}`}>{fmtPct(t?.priceChangePercent)}</span>
      <span className={styles.rowVol}>{fmtPrice(t?.quoteVolume)}</span>
    </button>
  );
}

function PanelBody({ active }: { active: string }) {
  const [q, setQ] = useState("");
  return (
    <div className={styles.panel}>
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          placeholder="Search markets…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>
      <div className={styles.header}>
        <span>Market</span>
        <span className={styles.right}>Last</span>
        <span className={styles.right}>24h %</span>
        <span className={styles.right}>24h Vol</span>
      </div>
      <div className={styles.list}>
        {SPOT_MARKETS.map((m) => (
          <MarketRow key={m.symbol} market={m} active={m.symbol === active} query={q} />
        ))}
      </div>
    </div>
  );
}

export function SpotMarketDropdown({ symbol }: { symbol: string }) {
  const active = useMemo(() => SPOT_MARKETS.find((m) => m.symbol === symbol) ?? SPOT_MARKETS[0], [symbol]);
  return (
    <SelectorBase
      label={
        <span className={styles.trigger}>
          <AssetBadge symbol={active.base} />
          <span className={styles.triggerName}>
            {active.base}
            <span className={styles.triggerQuote}>/{active.quote}</span>
          </span>
          <span className={styles.triggerLev}>1x</span>
        </span>
      }
      modalLabel="Select market"
      desktopPanelClassName={styles.floatingPanel}
    >
      <PanelBody active={symbol} />
    </SelectorBase>
  );
}

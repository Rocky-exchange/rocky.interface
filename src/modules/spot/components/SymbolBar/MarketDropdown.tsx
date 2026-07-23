import { useState } from "react";
import { useHistory } from "react-router-dom";

import TokenIcon from "@/shared/components/TokenIcon/TokenIcon";
import cbtcIconSrc from "@/shared/lib/canton-wallet/token-icons/cBTC.webp";
import ccIconSrc from "@/shared/lib/canton-wallet/token-icons/CC.webp";
import cethIconSrc from "@/shared/lib/canton-wallet/token-icons/cETH.webp";

import { SelectorBase, useSelectorClose } from "components/SelectorBase/SelectorBase";

import styles from "./MarketDropdown.module.scss";
import { spotApi, type Ticker24h } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import { SPOT_MARKETS, type SpotMarket } from "../../model/spotMarkets";

const SPOT_TOKEN_ICONS: Record<string, string> = {
  CBTC: cbtcIconSrc,
  CETH: cethIconSrc,
  CC: ccIconSrc,
};

export function AssetBadge({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const iconSrc = SPOT_TOKEN_ICONS[symbol.trim().toUpperCase()];

  if (iconSrc) {
    return (
      <img
        data-qa="token-icon"
        className="Token-icon inline rounded-full"
        src={iconSrc}
        alt={symbol}
        width={size}
        height={size}
      />
    );
  }

  return <TokenIcon symbol={symbol} displaySize={size} />;
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
function MarketRow({ market, active, query }: { market: SpotMarket; active: boolean; query: string }) {
  const history = useHistory();
  const close = useSelectorClose();
  const { data: t } = usePolling<Ticker24h>(() => spotApi.ticker(market.apiSymbol), 5000, [market.apiSymbol]);

  const label = `${market.displayBase}/${market.displayQuote}`;
  const q = query.trim().toLowerCase();
  if (
    q &&
    !label.toLowerCase().includes(q) &&
    !market.routeSymbol.toLowerCase().includes(q) &&
    !market.apiSymbol.toLowerCase().includes(q)
  ) {
    return null;
  }

  const pct = t ? parseFloat(t.priceChangePercent) : NaN;
  const pctCls = pct > 0 ? styles.up : pct < 0 ? styles.down : styles.muted;

  const onClick = () => {
    history.push(`/spot/${market.routeSymbol}`);
    close();
  };

  return (
    <button type="button" className={`${styles.row} ${active ? styles.rowActive : ""}`} onClick={onClick}>
      <span className={styles.rowLeft}>
        <AssetBadge symbol={market.displayBase} />
        <span className={styles.rowSymbol}>
          {market.displayBase}
          <span className={styles.rowQuote}>/{market.displayQuote}</span>
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
          <MarketRow key={m.routeSymbol} market={m} active={m.routeSymbol === active} query={q} />
        ))}
      </div>
    </div>
  );
}

export function SpotMarketDropdown({ market }: { market: SpotMarket }) {
  return (
    <SelectorBase
      label={
        <span className={styles.trigger}>
          <AssetBadge symbol={market.displayBase} />
          <span className={styles.triggerName}>
            {market.displayBase}
            <span className={styles.triggerQuote}>/{market.displayQuote}</span>
          </span>
          <span className={styles.triggerLev}>1x</span>
        </span>
      }
      modalLabel="Select market"
      handleClassName={styles.symbolHandle}
      chevronClassName={styles.caret}
      desktopPanelClassName={styles.floatingPanel}
    >
      <PanelBody active={market.routeSymbol} />
    </SelectorBase>
  );
}

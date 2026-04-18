import { useCallback, useMemo } from "react";

import { getNormalizedTokenSymbol } from "sdk/configs/tokens";

import { SelectorBase } from "components/SelectorBase/SelectorBase";
import TokenIcon from "components/TokenIcon/TokenIcon";

import styles from "./SymbolBar.module.scss";
import { useX10000State } from "../../../cex/store/X10000StateContext";
import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import { formatFundingPct } from "../../utils/fundingFormat";
import { MarketsDropdown } from "../MarketsDropdown/MarketsDropdown";

function fmt(n: number | null, d = 2, prefix = ""): string {
  if (n == null) return "-";
  return prefix + n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number | null, fixed = 2): string {
  if (n == null) return "-";
  return `${n >= 0 ? "" : ""}${n.toFixed(fixed)}%`;
}
function fmtCompactUsd(n: number | null): string {
  if (n == null) return "-";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtCountdown(ts: number | null): string {
  if (ts == null) return "-";
  const diff = Math.max(0, ts - Date.now());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function Stat({ label, value, cls, clickable }: { label: string; value: string; cls?: string; clickable?: boolean }) {
  return (
    <div className={styles.stat}>
      <div className={`${styles.label} ${clickable ? styles.labelLink : ""}`}>{label}</div>
      <div className={`${styles.value} ltr-mono ${cls ?? ""}`}>{value}</div>
    </div>
  );
}

export function SymbolBar() {
  const m = useMarketInfoAdapter();
  const { setSelectedSymbol } = useX10000State();
  const changeCls = m.change24hPct == null ? "" : m.change24hPct >= 0 ? "ltr-up" : "ltr-down";
  const baseSymbol = useMemo(() => getNormalizedTokenSymbol(m.symbol.replace(/[-/]?USD[T]?$/i, "")), [m.symbol]);

  const handleSelectMarket = useCallback(
    (symbol: string) => {
      setSelectedSymbol(symbol);
    },
    [setSelectedSymbol]
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.root}>
        <SelectorBase
          label={
            <>
              <TokenIcon className={styles.btcIcon} symbol={baseSymbol} displaySize={20} />
              <span className={styles.symName}>{baseSymbol}</span>
              <span className={styles.lev}>
                <span>{m.leverage}x</span>
              </span>
            </>
          }
          modalLabel="Market"
          handleClassName={styles.symbol}
          chevronClassName={styles.caret}
          desktopPanelClassName={styles.marketSelectorPanel}
          mobileModalContentPadding={false}
          popoverPlacement="bottom-start"
          qa="lighter-market-selector"
        >
          <MarketsDropdown onMarketSelect={handleSelectMarket} displayMode="popover" />
        </SelectorBase>
        <div className={styles.stats}>
          <Stat label="Mark Price" value={fmt(m.markPrice, 1)} clickable />
          <Stat label="Index Price" value={fmt(m.indexPrice, 1)} clickable />
          <Stat label="24h Change" value={fmtPct(m.change24hPct)} cls={changeCls} />
          <Stat label="24h Volume" value={fmtCompactUsd(m.volume24hUsd)} />
          <Stat label="Open Interest" value={fmtCompactUsd(m.openInterestUsd)} clickable />
          <div className={styles.fundingGroup}>
            <span className={`${styles.corner} ${styles.cornerTL}`} />
            <span className={`${styles.corner} ${styles.cornerTR}`} />
            <span className={`${styles.corner} ${styles.cornerBL}`} />
            <span className={`${styles.corner} ${styles.cornerBR}`} />
            <Stat label="1hr Funding" value={formatFundingPct(m.funding1hPct, 4)} clickable />
            <Stat label="Next Funding" value={fmtCountdown(m.nextFundingTs)} />
          </div>
        </div>
      </div>
    </div>
  );
}

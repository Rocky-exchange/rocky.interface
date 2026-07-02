import { Trans } from "@lingui/macro";
import { useCallback, useMemo, type ReactNode } from "react";

import { getNormalizedTokenSymbol } from "sdk/configs/tokens";

import { useTradeState } from "@/modules/lighter/store/TradeStateContext";
import { SelectorBase } from "components/SelectorBase/SelectorBase";
import TokenIcon from "components/TokenIcon/TokenIcon";
import { TradingMarketsDropdown } from "components/TradingMarketsList/TradingMarketsDropdown";

import styles from "./SymbolBar.module.scss";
import { useMarketInfoAdapter } from "../../adapters/useMarketInfoAdapter";
import { formatFundingPct } from "../../utils/fundingFormat";

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
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function Stat({
  label,
  value,
  cls,
  clickable,
}: {
  label: ReactNode;
  value: string;
  cls?: string;
  clickable?: boolean;
}) {
  return (
    <div className={styles.stat}>
      <div className={`${styles.label} ${clickable ? styles.labelLink : ""}`}>{label}</div>
      <div className={`${styles.value} ltr-mono ${cls ?? ""}`}>{value}</div>
    </div>
  );
}

export function SymbolBar() {
  const m = useMarketInfoAdapter();
  const { setSelectedSymbol } = useTradeState();
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
          desktopPanelClassName={`${styles.marketSelectorPanel} TradingMarketsDropdown-panel`}
          mobileModalContentPadding={false}
          popoverPlacement="bottom-start"
          qa="lighter-market-selector"
        >
          <TradingMarketsDropdown onMarketSelect={handleSelectMarket} displayMode="popover" />
        </SelectorBase>
        <div className={styles.stats}>
          <Stat label={<Trans>Mark Price</Trans>} value={fmt(m.markPrice, 1)} clickable />
          <Stat label={<Trans>Index Price</Trans>} value={fmt(m.indexPrice, 1)} clickable />
          <Stat label={<Trans>24h Change</Trans>} value={fmtPct(m.change24hPct)} cls={changeCls} />
          <Stat label={<Trans>24h Volume</Trans>} value={fmtCompactUsd(m.volume24hUsd)} />
          <Stat label={<Trans>Open Interest</Trans>} value={fmtCompactUsd(m.openInterestUsd)} clickable />
          <div className={styles.fundingGroup}>
            <span className={`${styles.corner} ${styles.cornerTL}`} />
            <span className={`${styles.corner} ${styles.cornerTR}`} />
            <span className={`${styles.corner} ${styles.cornerBL}`} />
            <span className={`${styles.corner} ${styles.cornerBR}`} />
            <Stat label={<Trans>8h Funding</Trans>} value={formatFundingPct(m.funding1hPct, 4)} clickable />
            <Stat label={<Trans>Next Funding</Trans>} value={fmtCountdown(m.nextFundingTs)} />
          </div>
        </div>
      </div>
    </div>
  );
}

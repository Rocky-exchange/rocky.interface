import { Trans } from "@lingui/macro";
import { useMemo, type ReactNode } from "react";

import styles from "./SpotChartPanels.module.scss";
import { spotApi, type SpotMarketInfo, type Ticker24h } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";

function formatNumber(value: string | number | undefined, maximumFractionDigits = 8): string {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toLocaleString("en-US", {
    maximumFractionDigits,
    useGrouping: true,
  });
}

function DetailRow({ label, value, tone }: { label: ReactNode; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span
        className={`${styles.detailValue} ${
          tone === "positive" ? styles.positive : tone === "negative" ? styles.negative : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function findMarketInfo(markets: SpotMarketInfo[] | null, market: SpotMarket): SpotMarketInfo | undefined {
  return markets?.find((candidate) => candidate.symbol.toUpperCase() === market.apiSymbol.toUpperCase());
}

export function SpotMarketDetails({ market }: { market: SpotMarket }) {
  const tickerState = usePolling<Ticker24h>(() => spotApi.ticker(market.apiSymbol), 3000, [market.apiSymbol]);
  const marketsState = usePolling<SpotMarketInfo[]>(() => spotApi.markets(), 60_000);
  const marketInfo = useMemo(() => findMarketInfo(marketsState.data, market), [market, marketsState.data]);
  const changePercent = Number(tickerState.data?.priceChangePercent);
  const changeTone = Number.isFinite(changePercent)
    ? changePercent > 0
      ? "positive"
      : changePercent < 0
        ? "negative"
        : undefined
    : undefined;
  const error = tickerState.err || marketsState.err;

  if (error && !tickerState.data) {
    return <div className={styles.panelState}>{error}</div>;
  }

  if (!tickerState.data && !marketInfo) {
    return (
      <div className={styles.panelState}>
        <Trans>Loading…</Trans>
      </div>
    );
  }

  return (
    <div className={styles.detailsRoot}>
      <section className={styles.detailsCard}>
        <div className={styles.marketTitle}>{market.displayBase}/{market.displayQuote}</div>
        <div className={styles.detailList}>
          <DetailRow label={<Trans>Last Price</Trans>} value={formatNumber(tickerState.data?.lastPrice)} />
          <DetailRow
            label={<Trans>24h Change</Trans>}
            value={
              Number.isFinite(changePercent)
                ? `${changePercent > 0 ? "+" : ""}${formatNumber(changePercent)}%`
                : "—"
            }
            tone={changeTone}
          />
          <DetailRow label={<Trans>24h High</Trans>} value={formatNumber(tickerState.data?.highPrice)} />
          <DetailRow label={<Trans>24h Low</Trans>} value={formatNumber(tickerState.data?.lowPrice)} />
          <DetailRow
            label={
              <Trans>
                24h Vol {market.displayBase}
              </Trans>
            }
            value={formatNumber(tickerState.data?.volume)}
          />
          <DetailRow
            label={
              <Trans>
                24h Vol {market.displayQuote}
              </Trans>
            }
            value={formatNumber(tickerState.data?.quoteVolume)}
          />
        </div>
      </section>

      <section className={styles.detailsCard}>
        <div className={styles.detailList}>
          <DetailRow label={<Trans>Market Name:</Trans>} value={`${market.displayBase}/${market.displayQuote}`} />
          <DetailRow label={<Trans>Price Steps:</Trans>} value={marketInfo?.tick_size || "—"} />
          <DetailRow
            label={<Trans>Minimum order size</Trans>}
            value={marketInfo ? `${marketInfo.min_qty} ${market.displayBase}` : "—"}
          />
          <DetailRow label={<Trans>Base asset</Trans>} value={market.displayBase} />
          <DetailRow label={<Trans>Quote asset</Trans>} value={market.displayQuote} />
        </div>
      </section>
    </div>
  );
}

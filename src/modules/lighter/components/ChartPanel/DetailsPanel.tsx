import { useMemo } from "react";

import { useChainId } from "lib/chains";
import { useApiMarketDetails } from "modules/cex/lib/api/hooks";
import { useX10000State } from "modules/cex/store/X10000StateContext";

import TokenIcon from "components/TokenIcon/TokenIcon";

import { buildDetailsViewModel } from "./detailsMock";
import styles from "./DetailsPanel.module.scss";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue}>{value}</span>
    </div>
  );
}

export function DetailsPanel() {
  const { chainId } = useChainId();
  const { selectedSymbol } = useX10000State();
  const { details } = useApiMarketDetails(chainId, selectedSymbol ?? undefined);
  const model = useMemo(() => buildDetailsViewModel(details), [details]);

  if (!model) {
    return (
      <div className={styles.root}>
        <section className={styles.card}>
          <div className={styles.description}>Loading…</div>
        </section>
        <section className={styles.card} />
      </div>
    );
  }

  const baseLabel = `Min ${model.assetSymbol} Amount:`;

  return (
    <div className={styles.root}>
      <section className={styles.card}>
        <div className={styles.assetHeader}>
          <TokenIcon symbol={model.assetSymbol} displaySize={24} className={styles.assetIcon} />
          <div className={styles.assetTitle}>
            <span className={styles.assetSymbol}>{model.assetSymbol}</span>
            <span className={styles.assetName}>{model.assetName}</span>
          </div>
        </div>

        <div className={styles.bodyDivider} />

        <p className={styles.description}>{model.description}</p>
      </section>

      <section className={styles.card}>
        <div className={styles.summaryList}>
          <SummaryRow label="Market Name:" value={model.summary.marketName} />
          <SummaryRow label={baseLabel} value={model.summary.minBtcAmount} />
          <SummaryRow label="Min USD Amount:" value={model.summary.minUsdAmount} />
          <SummaryRow label="Price Steps:" value={model.summary.priceSteps} />
          <SummaryRow label="Max Leverage:" value={model.summary.maxLeverage} />
          <SummaryRow label="Initial Margin Fraction:" value={model.summary.initialMarginFraction} />
          <SummaryRow label="Maintenance Margin Fraction:" value={model.summary.maintenanceMarginFraction} />
          <SummaryRow label="Close Out Margin Fraction:" value={model.summary.closeOutMarginFraction} />
          <SummaryRow label="Market Cap:" value={model.summary.marketCap} />
          <SummaryRow label="FDV:" value={model.summary.fdv} />
        </div>
      </section>
    </div>
  );
}

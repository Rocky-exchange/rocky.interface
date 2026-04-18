import cx from "classnames";
import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { FUNDING_RANGE_OPTIONS, type FundingHistoryPoint, type FundingRange } from "./fundingMock";
import { useFundingAdapter } from "../../adapters/useFundingAdapter";
import styles from "./FundingPanel.module.scss";

const AXIS_TICK = { fill: "#9FA3AE", fontSize: 11 };
const CHART_MARGIN = { top: 6, right: 16, bottom: 8, left: 10 };
const Y_AXIS_DOMAIN = [-0.003, 0.002] as const;

function formatRateTick(value: number) {
  if (Math.abs(value) < 0.0000001) return "0%";
  return `${value > 0 ? "" : "−"}${Math.abs(value * 100).toFixed(4)}%`;
}

function FundingTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: FundingHistoryPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label || "Funding"}</div>
      <div className={cx(styles.tooltipValue, point.rate >= 0 ? styles.positive : styles.negative)}>
        {point.rate >= 0 ? "+" : ""}
        {(point.rate * 100).toFixed(4)}%
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </div>
  );
}

export function FundingPanel() {
  const [range, setRange] = useState<FundingRange>("1W");
  const model = useFundingAdapter(range);

  return (
    <div className={styles.root}>
      <section className={styles.card}>
        <div className={styles.cardTitle}>Real-Time Funding Rate</div>
        <div className={styles.summaryValue}>{model.summary.realtimeFundingRate}</div>
        <div className={styles.infoList}>
          <InfoRow label="Interval" value={model.summary.interval} />
          <InfoRow label="Next Funding Countdown" value={model.summary.nextFundingCountdown} />
          <InfoRow label="Weekly Funding Rate" value={model.summary.weeklyFundingRate} />
          <InfoRow label="Monthly Funding Rate" value={model.summary.monthlyFundingRate} />
          <InfoRow label="Yearly Funding Rate" value={model.summary.yearlyFundingRate} />
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.chartHeader}>
          <div className={styles.cardTitle}>Funding Rate History</div>
          <div className={styles.rangeButtons}>
            {FUNDING_RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                className={option === range ? styles.rangeButtonActive : styles.rangeButton}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={model.history} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="fundingPositiveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#72e0a7" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#72e0a7" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="fundingNegativeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff6975" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="#ff6975" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2A2D35" vertical={false} strokeDasharray="0" />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis
                tick={AXIS_TICK}
                tickFormatter={formatRateTick}
                tickLine={false}
                axisLine={false}
                width={68}
                domain={Y_AXIS_DOMAIN}
              />
              <ReferenceLine y={0} stroke="#51545d" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="positiveRate"
                stroke="#72e0a7"
                fill="url(#fundingPositiveFill)"
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="negativeRate"
                stroke="#ff6975"
                fill="url(#fundingNegativeFill)"
                strokeWidth={2}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Tooltip content={<FundingTooltip />} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

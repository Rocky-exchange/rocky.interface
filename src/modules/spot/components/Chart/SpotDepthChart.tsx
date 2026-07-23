import { Trans } from "@lingui/macro";
import { useMemo, type CSSProperties } from "react";
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

import { LIGHTER_DEPTH_CHART_THEME } from "@/modules/lighter/components/ChartPanel/lighterDepthChartTheme";

import styles from "./SpotChartPanels.module.scss";
import { spotApi, type DepthResp } from "../../api/spotClient";
import { usePolling } from "../../hooks/usePolling";
import type { SpotMarket } from "../../model/spotMarkets";

const CHART_MARGIN = { top: 20, right: 24, bottom: 12, left: 8 };
const AXIS_TICK = { fill: LIGHTER_DEPTH_CHART_THEME.axisText, fontSize: 11 };
const Y_AXIS_DOMAIN: [number, (dataMax: number) => number] = [0, (dataMax) => dataMax * 1.08];
const TOOLTIP_CURSOR = { stroke: LIGHTER_DEPTH_CHART_THEME.reference, strokeDasharray: "2 2" };
const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: "#1c1c24",
  border: "1px solid #2b2b30",
  borderRadius: 4,
  color: "#f3f3f3",
  fontSize: 12,
};

export type SpotDepthPoint = {
  price: number;
  bid?: number;
  ask?: number;
  side: "bid" | "ask" | "mid";
  totalCost: number;
};

type NormalizedLevel = {
  price: number;
  size: number;
};

function normalizeLevels(levels: [string, string][]): NormalizedLevel[] {
  return levels
    .map(([price, size]) => ({ price: Number(price), size: Number(size) }))
    .filter((level) => Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.size) && level.size > 0);
}

export function buildSpotDepthPoints(depth: DepthResp): {
  points: SpotDepthPoint[];
  midPrice: number;
  priceRange: [number, number];
} {
  const bids = normalizeLevels(depth.bids).sort((a, b) => b.price - a.price);
  const asks = normalizeLevels(depth.asks).sort((a, b) => a.price - b.price);

  if (bids.length === 0 || asks.length === 0) {
    return { points: [], midPrice: 0, priceRange: [0, 0] };
  }

  let bidSize = 0;
  let bidCost = 0;
  const bidPoints = bids.map((level) => {
    bidSize += level.size;
    bidCost += level.price * level.size;
    return {
      price: level.price,
      bid: bidSize,
      side: "bid" as const,
      totalCost: bidCost,
    };
  });

  let askSize = 0;
  let askCost = 0;
  const askPoints = asks.map((level) => {
    askSize += level.size;
    askCost += level.price * level.size;
    return {
      price: level.price,
      ask: askSize,
      side: "ask" as const,
      totalCost: askCost,
    };
  });

  const midPrice = (bids[0].price + asks[0].price) / 2;
  const points: SpotDepthPoint[] = [
    ...bidPoints.reverse(),
    { price: midPrice, bid: 0, ask: 0, side: "mid", totalCost: 0 },
    ...askPoints,
  ];

  return {
    points,
    midPrice,
    priceRange: [points[0].price, points[points.length - 1].price],
  };
}

function formatAxisNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function SpotDepthChart({ market }: { market: SpotMarket }) {
  const { data, err } = usePolling<DepthResp>(() => spotApi.depth(market.apiSymbol, 100), 1000, [market.apiSymbol]);
  const model = useMemo(
    () => (data ? buildSpotDepthPoints(data) : { points: [], midPrice: 0, priceRange: [0, 0] as [number, number] }),
    [data],
  );

  if (err) return <div className={`${styles.panelState} ${styles.panelError}`}>{err}</div>;
  if (!data) {
    return (
      <div className={styles.panelState}>
        <Trans>Loading…</Trans>
      </div>
    );
  }
  if (model.points.length === 0) {
    return (
      <div className={styles.panelState}>
        <Trans>No depth data</Trans>
      </div>
    );
  }

  return (
    <div className={styles.depthRoot} data-testid="spot-depth-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={model.points} margin={CHART_MARGIN}>
          <defs>
            <linearGradient id="spotBidGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={LIGHTER_DEPTH_CHART_THEME.bidStroke} stopOpacity={0.3} />
              <stop offset="95%" stopColor={LIGHTER_DEPTH_CHART_THEME.bidStroke} stopOpacity={0.06} />
            </linearGradient>
            <linearGradient id="spotAskGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={LIGHTER_DEPTH_CHART_THEME.askStroke} stopOpacity={0.3} />
              <stop offset="95%" stopColor={LIGHTER_DEPTH_CHART_THEME.askStroke} stopOpacity={0.06} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={LIGHTER_DEPTH_CHART_THEME.grid} strokeDasharray="2 2" vertical={false} />
          <XAxis
            dataKey="price"
            type="number"
            domain={model.priceRange}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatAxisNumber}
            minTickGap={48}
          />
          <YAxis
            orientation={LIGHTER_DEPTH_CHART_THEME.yAxisOrientation}
            domain={Y_AXIS_DOMAIN}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={formatAxisNumber}
          />
          <Area
            dataKey="bid"
            type="stepBefore"
            name={`${market.displayBase} bids`}
            stroke={LIGHTER_DEPTH_CHART_THEME.bidStroke}
            strokeWidth={1.25}
            fill="url(#spotBidGradient)"
            isAnimationActive={false}
            connectNulls={false}
          />
          <Area
            dataKey="ask"
            type="stepAfter"
            name={`${market.displayBase} asks`}
            stroke={LIGHTER_DEPTH_CHART_THEME.askStroke}
            strokeWidth={1.25}
            fill="url(#spotAskGradient)"
            isAnimationActive={false}
            connectNulls={false}
          />
          <ReferenceLine
            x={model.midPrice}
            stroke={LIGHTER_DEPTH_CHART_THEME.reference}
            strokeDasharray="2 2"
          />
          <Tooltip
            cursor={TOOLTIP_CURSOR}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelFormatter={(value) => `${market.displayQuote} ${formatAxisNumber(Number(value))}`}
            formatter={(value) => [`${formatAxisNumber(Number(value))} ${market.displayBase}`, ""]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

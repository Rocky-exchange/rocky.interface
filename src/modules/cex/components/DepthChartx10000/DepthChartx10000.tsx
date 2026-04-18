import { t } from "@lingui/macro";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Text,
  TextProps,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";
import type { ImplicitLabelType } from "recharts/types/component/Label";
import type { CategoricalChartFunc } from "recharts/types/chart/generateCategoricalChart";
import type { Margin } from "recharts/types/util/types";
import BigNumber from "bignumber.js";

import { colors } from "config/colors";
import { useTheme } from "context/ThemeContext/ThemeContext";
import { useChainId } from "lib/chains";
import { useX10000State } from "@/modules/cex/store/X10000StateContext";
import { useApiOrderbook, useApiTicker } from "@/modules/cex/lib/api/hooks";
import { useOrderbookUpdates } from "@/modules/cex/lib/api";

import "./DepthChartx10000.scss";

const CHART_MARGIN: Margin = { bottom: 10, top: 20, right: 0, left: 0 };

const getMidPriceLabel = (): ImplicitLabelType => ({
  position: "bottom",
  offset: 28,
  value: t`MID PRICE`,
  fill: "var(--color-typography-primary)",
  opacity: 0.7,
  fontSize: 10,
});

type DepthDataPoint = {
  price: number;
  bidTotal: number | null;
  askTotal: number | null;
};

function formatPriceForAxis(value: number): string {
  if (!Number.isFinite(value)) return "--";
  if (value >= 10000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (value >= 100) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
  if (value >= 1) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatVolumeForAxis(value: number): string {
  if (!Number.isFinite(value)) return "--";
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(2);
}

function YAxisTick(props: Partial<TextProps & { payload: { value: number } }>) {
  const { x, y, payload, textAnchor, verticalAnchor } = props as Required<typeof props>;

  return (
    <Text
      x={x}
      y={y}
      textAnchor={textAnchor}
      verticalAnchor={verticalAnchor}
      fill="var(--color-typography-primary)"
      opacity={0.7}
      fontSize={11}
    >
      {formatVolumeForAxis(payload.value)}
    </Text>
  );
}

function XAxisTick(props: Partial<TextProps & { payload: { value: number }; index: number }> & { midPrice: number }) {
  const { x, y, payload, textAnchor, verticalAnchor, midPrice, index } = props as Required<typeof props>;
  const isMidPrice = Math.abs(payload.value - midPrice) / midPrice < 0.001;

  return (
    <Text
      x={x}
      y={y}
      textAnchor={textAnchor}
      verticalAnchor={verticalAnchor}
      fill="var(--color-typography-primary)"
      opacity={isMidPrice ? 1 : 0.7}
      fontWeight={isMidPrice ? "bold" : "normal"}
      fontSize={11}
    >
      {formatPriceForAxis(payload.value)}
    </Text>
  );
}

export const DepthChartx10000 = memo(() => {
  const { chainId } = useChainId();
  const { selectedSymbol } = useX10000State();
  const symbol = selectedSymbol || "BTC-USD";
  const theme = useTheme();

  const redColor = colors.red[500][theme.theme];
  const greenColor = colors.green[500][theme.theme];

  // REST: initial snapshot
  const { orderbook } = useApiOrderbook(chainId, symbol, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  // WS: incremental updates
  const { orderbook: wsOrderbook } = useOrderbookUpdates(chainId, symbol);

  // Ticker for last price
  const { ticker } = useApiTicker(chainId, symbol);

  // Convert orderbook formats to unified format
  const effectiveOrderbook = useMemo(() => {
    if (wsOrderbook) {
      return {
        bids: wsOrderbook.bids.map((b) => [b.price, b.size] as [string, string]),
        asks: wsOrderbook.asks.map((a) => [a.price, a.size] as [string, string]),
      };
    }
    if (orderbook) {
      return {
        bids: orderbook.bids,
        asks: orderbook.asks,
      };
    }
    return null;
  }, [wsOrderbook, orderbook]);

  // Process orderbook data into depth chart format (Binance/OKX style)
  // Bids: cumulative increases as price DECREASES (left side of chart)
  // Asks: cumulative increases as price INCREASES (right side of chart)
  const { bidData, askData, midPrice, priceRange } = useMemo(() => {
    if (!effectiveOrderbook) {
      return { bidData: [], askData: [], midPrice: 0, priceRange: [0, 0] as [number, number] };
    }

    const bids = effectiveOrderbook.bids || [];
    const asks = effectiveOrderbook.asks || [];

    if (bids.length === 0 && asks.length === 0) {
      return { bidData: [], askData: [], midPrice: 0, priceRange: [0, 0] as [number, number] };
    }

    // Parse and sort bids (descending by price - best bid first)
    const parsedBids = bids
      .map((level) => {
        const price = new BigNumber(level[0]);
        const size = new BigNumber(level[1]);
        return { price: price.toNumber(), size: size.toNumber() };
      })
      .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size) && l.size > 0)
      .sort((a, b) => b.price - a.price);

    // Parse and sort asks (ascending by price - best ask first)
    const parsedAsks = asks
      .map((level) => {
        const price = new BigNumber(level[0]);
        const size = new BigNumber(level[1]);
        return { price: price.toNumber(), size: size.toNumber() };
      })
      .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size) && l.size > 0)
      .sort((a, b) => a.price - b.price);

    // Calculate mid price
    const bestBid = parsedBids[0]?.price || 0;
    const bestAsk = parsedAsks[0]?.price || 0;
    const calculatedMidPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

    // Build bid data: cumulative from best bid outward (price decreasing)
    // For Binance style: X-axis is price, Y-axis is cumulative volume
    // Bids go from best bid (center) to lowest price (left edge)
    let bidCumulative = 0;
    const bidPoints: DepthDataPoint[] = [];

    // Add starting point at mid price
    bidPoints.push({
      price: calculatedMidPrice,
      bidTotal: 0,
      askTotal: null,
    });

    for (const bid of parsedBids) {
      bidCumulative += bid.size;
      bidPoints.push({
        price: bid.price,
        bidTotal: bidCumulative,
        askTotal: null,
      });
    }

    // Build ask data: cumulative from best ask outward (price increasing)
    let askCumulative = 0;
    const askPoints: DepthDataPoint[] = [];

    // Add starting point at mid price
    askPoints.push({
      price: calculatedMidPrice,
      bidTotal: null,
      askTotal: 0,
    });

    for (const ask of parsedAsks) {
      askCumulative += ask.size;
      askPoints.push({
        price: ask.price,
        bidTotal: null,
        askTotal: askCumulative,
      });
    }

    // Sort bid data by price ascending (for proper chart rendering)
    bidPoints.sort((a, b) => a.price - b.price);
    // Ask data is already sorted by price ascending

    // Calculate price range (centered on mid price)
    const minBidPrice = parsedBids[parsedBids.length - 1]?.price || calculatedMidPrice;
    const maxAskPrice = parsedAsks[parsedAsks.length - 1]?.price || calculatedMidPrice;
    const priceSpread = Math.max(calculatedMidPrice - minBidPrice, maxAskPrice - calculatedMidPrice);
    const rangeMin = calculatedMidPrice - priceSpread * 1.05;
    const rangeMax = calculatedMidPrice + priceSpread * 1.05;

    return {
      bidData: bidPoints,
      askData: askPoints,
      midPrice: calculatedMidPrice,
      priceRange: [rangeMin, rangeMax] as [number, number],
    };
  }, [effectiveOrderbook]);

  // Merge bid and ask data for single chart rendering
  const data = useMemo(() => {
    const allPoints = [...bidData, ...askData];
    allPoints.sort((a, b) => a.price - b.price);
    return allPoints;
  }, [bidData, askData]);

  const [tickCount, setTickCount] = useState(9);

  const handleResize = useCallback((width: number) => {
    setTickCount(Math.max(5, Math.round(width / 100)));
  }, []);

  const xAxisTicks = useMemo(() => {
    if (!midPrice || priceRange[0] === priceRange[1]) return [];

    const ticks: number[] = [];
    const step = (priceRange[1] - priceRange[0]) / (tickCount - 1);

    for (let i = 0; i < tickCount; i++) {
      ticks.push(priceRange[0] + step * i);
    }

    // Ensure mid price is included
    const hasMidPrice = ticks.some((t) => Math.abs(t - midPrice) / midPrice < 0.01);
    if (!hasMidPrice) {
      // Replace closest tick with mid price
      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < ticks.length; i++) {
        const dist = Math.abs(ticks[i] - midPrice);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }
      ticks[closestIdx] = midPrice;
    }

    return ticks;
  }, [midPrice, priceRange, tickCount]);

  const midPriceLabel = useMemo(() => getMidPriceLabel(), []);

  const tooltipRef = useRef<HTMLDivElement>(null);

  const CustomTooltip = useCallback(
    ({ active, payload }: { active?: boolean; payload?: Array<{ payload: DepthDataPoint }> }) => {
      if (!active || !payload || payload.length === 0) return null;

      const point = payload[0].payload;
      const isBid = point.bidTotal !== null && point.bidTotal > 0;
      const isAsk = point.askTotal !== null && point.askTotal > 0;
      const total = isBid ? point.bidTotal : isAsk ? point.askTotal : 0;

      return (
        <div
          ref={tooltipRef}
          className="DepthChartx10000-tooltip rounded-4 bg-slate-600 p-8 shadow-md"
        >
          <div className="text-body-small">
            <div className="mb-4">
              <span className="text-typography-secondary">{t`Price`}: </span>
              <span className="text-typography-primary font-medium">
                {formatPriceForAxis(point.price)}
              </span>
            </div>
            <div>
              <span className="text-typography-secondary">{t`Cumulative`}: </span>
              <span
                className={isBid ? "text-green-400" : isAsk ? "text-red-400" : "text-typography-primary"}
              >
                {formatVolumeForAxis(total || 0)}
              </span>
            </div>
          </div>
        </div>
      );
    },
    []
  );

  if (data.length === 0) {
    return (
      <div className="DepthChartx10000 flex h-full w-full items-center justify-center">
        <span className="text-typography-secondary">{t`No orderbook data available`}</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer
      onResize={handleResize}
      className="DepthChartx10000"
      width="100%"
      height="100%"
    >
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id="colorBid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={greenColor} stopOpacity={0.6} />
            <stop offset="95%" stopColor={greenColor} stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="colorAsk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={redColor} stopOpacity={0.6} />
            <stop offset="95%" stopColor={redColor} stopOpacity={0.1} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="2 2"
          stroke="var(--color-typography-primary)"
          opacity={0.07}
        />

        <XAxis
          dataKey="price"
          type="number"
          domain={priceRange}
          axisLine={false}
          tickLine={false}
          ticks={xAxisTicks}
          interval={0}
          tickMargin={7}
          tick={<XAxisTick midPrice={midPrice} />}
        />

        <YAxis
          orientation="right"
          axisLine={false}
          tickLine={false}
          tickMargin={2}
          tick={<YAxisTick />}
          domain={[0, "auto"]}
          interval="preserveStart"
          minTickGap={25}
          allowDecimals={true}
          width={60}
        />

        <Area
          dataKey="bidTotal"
          type="stepBefore"
          stroke={greenColor}
          strokeWidth={1.5}
          fill="url(#colorBid)"
          isAnimationActive={false}
          connectNulls={false}
        />

        <Area
          dataKey="askTotal"
          type="stepAfter"
          stroke={redColor}
          strokeWidth={1.5}
          fill="url(#colorAsk)"
          isAnimationActive={false}
          connectNulls={false}
        />

        <ReferenceLine
          x={midPrice}
          label={midPriceLabel}
          stroke="var(--color-typography-primary)"
          opacity={0.6}
          strokeDasharray="2 2"
        />

        <RechartsTooltip
          cursor={{ stroke: "var(--color-typography-primary)", strokeOpacity: 0.3 }}
          content={<CustomTooltip />}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

export default DepthChartx10000;

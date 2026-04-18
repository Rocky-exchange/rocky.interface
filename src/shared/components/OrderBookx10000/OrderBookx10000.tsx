import { Trans } from "@lingui/macro";
import cx from "classnames";
import { useEffect, useMemo, useRef, useState } from "react";

import { useX10000State } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import { useApiOrderbook, useApiTicker, useApiTrades } from "@/modules/cex/lib/api/hooks";
import { useOrderbookUpdates, useTradesUpdates } from "@/modules/cex/lib/api";
import { useChainId } from "lib/chains";
import BigNumber from "bignumber.js";


import "./OrderBookx10000.scss";

type Side = "bids" | "asks";

function formatDepthValue(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "0.01";
  // Avoid scientific notation for common tick sizes and trim trailing zeros
  const fixed = v >= 1 ? v.toFixed(0) : v.toFixed(8);
  return fixed.replace(/\.?0+$/, "");
}

/**
 * Format quantity with dynamic decimal places based on value size
 * - Very large values (>= 1M): abbreviated (e.g., 1.23M)
 * - Large values (>= 1000): abbreviated (e.g., 1.23K)
 * - Medium values (>= 1): 2 decimals
 * - Small values (< 1): 4 decimals
 */
function formatQty(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "0.00";

  // Abbreviate large numbers to prevent overflow
  if (v >= 1_000_000_000) {
    return (v / 1_000_000_000).toFixed(2) + "B";
  }
  if (v >= 1_000_000) {
    return (v / 1_000_000).toFixed(2) + "M";
  }
  if (v >= 1000) {
    return (v / 1000).toFixed(2) + "K";
  }
  if (v >= 1) {
    return v.toFixed(2);
  }
  return v.toFixed(4);
}

/**
 * Format total (cumulative quantity) with abbreviation for large values
 */
function formatTotal(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "0.00";

  if (v >= 1_000_000_000) {
    return (v / 1_000_000_000).toFixed(2) + "B";
  }
  if (v >= 1_000_000) {
    return (v / 1_000_000).toFixed(2) + "M";
  }
  if (v >= 1000) {
    return (v / 1000).toFixed(2) + "K";
  }
  if (v >= 1) {
    return v.toFixed(2);
  }
  return v.toFixed(4);
}

function formatTradeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "--:--:--";
  // Handle both seconds (10 digits) and milliseconds (13 digits) timestamps
  const ms = timestamp < 1e10 ? timestamp * 1000 : timestamp;
  const date = new Date(ms);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Format price with appropriate decimal places based on value magnitude
 * - Large prices (>= 1000): 2 decimals with commas
 * - Medium prices (>= 1): 4 decimals
 * - Small prices (>= 0.01): 6 decimals
 * - Very small prices (< 0.01): up to 8 decimals, preserving significant digits
 */
function formatPriceWithComma(value: number | string, decimals?: number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num) || num === 0) return "--";

  // Auto-detect appropriate decimal places based on price magnitude
  let effectiveDecimals: number;
  if (decimals !== undefined) {
    effectiveDecimals = decimals;
  } else if (num >= 1000) {
    effectiveDecimals = 2;
  } else if (num >= 1) {
    effectiveDecimals = 4;
  } else if (num >= 0.01) {
    effectiveDecimals = 6;
  } else {
    // For very small prices, find the first significant digit and show 4 more
    const str = num.toFixed(10);
    const match = str.match(/^0\.0*[1-9]/);
    if (match) {
      effectiveDecimals = Math.min(match[0].length + 3, 10);
    } else {
      effectiveDecimals = 8;
    }
  }

  // For large numbers, use commas; for small numbers, just format decimals
  if (num >= 1000) {
    return num.toLocaleString("en-US", {
      minimumFractionDigits: effectiveDecimals,
      maximumFractionDigits: effectiveDecimals,
    });
  }

  return num.toFixed(effectiveDecimals);
}

function roundToTick(price: string, tick: string, side: Side): string {
  const p = new BigNumber(price);
  const t = new BigNumber(tick);
  const n = p.dividedBy(t);

  const rounded =
    side === "asks"
      ? n.integerValue(BigNumber.ROUND_UP)
      : n.integerValue(BigNumber.ROUND_DOWN);

  return rounded.multipliedBy(t).toFixed();
}

function aggregateLevelsByTick(levels: unknown, side: Side, tick: number): [string, string][] {
  if (!Array.isArray(levels)) return [];

  const tickStr = String(tick);
  const map = new Map<string, BigNumber>();

  for (const raw of levels) {
    let priceStr: string | undefined;
    let sizeStr: string | undefined;

    if (Array.isArray(raw) && raw.length >= 2) {
      priceStr = String(raw[0]);
      sizeStr = String(raw[1]);
    } else if (raw && typeof raw === "object") {
      const obj = raw as { price?: string; size?: string; amount?: string };
      priceStr = obj.price;
      sizeStr = obj.size ?? obj.amount;
    }

    if (!priceStr || !sizeStr) continue;

    const priceBN = new BigNumber(priceStr);
    const sizeBN = new BigNumber(sizeStr);
    if (!priceBN.isFinite() || !sizeBN.isFinite()) continue;

    const bucketPrice = roundToTick(priceStr, tickStr, side);
    const existing = map.get(bucketPrice) ?? new BigNumber(0);
    map.set(bucketPrice, existing.plus(sizeBN));
  }

  const sorted = Array.from(map.entries()).sort((a, b) => {
    const aBN = new BigNumber(a[0]);
    const bBN = new BigNumber(b[0]);
    return side === "asks" ? aBN.comparedTo(bBN) : bBN.comparedTo(aBN);
  });

  return sorted.map(([p, s]) => [p, s.toFixed(6)]);
}

const ALLOWED_DEPTH_VALUES = [
  "0.000001",
  "0.00001",
  "0.0001",
  "0.001",
  "0.01",
  "0.1",
  "1",
  "10",
  "100",
  "1000",
  "10000",
] as const;

const ALLOWED_DEPTH_NUMBERS = ALLOWED_DEPTH_VALUES.map((s) => Number.parseFloat(s));

function snapUpToAllowedDepth(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return Number.parseFloat(ALLOWED_DEPTH_VALUES[0]);
  for (const a of ALLOWED_DEPTH_NUMBERS) {
    if (a >= value) return a;
  }
  return ALLOWED_DEPTH_NUMBERS[ALLOWED_DEPTH_NUMBERS.length - 1];
}

function computeDepthOptionsFromOrderbook(
  orderbook: { bids?: unknown; asks?: unknown } | null | undefined
): string[] {
  // Requirement: only allow values from ALLOWED_DEPTH_VALUES and keep exactly 4 tiers.
  const fallback = ["0.01", "0.1", "1", "10"];
  const collectPrices = (levels: unknown) => {
    if (!Array.isArray(levels)) return [] as number[];
    const out: number[] = [];
    for (const raw of levels) {
      const priceStr = Array.isArray(raw) ? String(raw[0]) : (raw as any)?.price;
      const price = Number.parseFloat(priceStr);
      if (Number.isFinite(price)) out.push(price);
    }
    return out;
  };

  const bids = collectPrices(orderbook?.bids);
  const asks = collectPrices(orderbook?.asks);
  const all = [...bids, ...asks].filter((x) => Number.isFinite(x));
  if (all.length < 4) return fallback;

  const diffs: number[] = [];
  const pushDiffs = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const d = sorted[i] - sorted[i - 1];
      if (d > 0 && Number.isFinite(d)) diffs.push(d);
    }
  };
  pushDiffs(bids);
  pushDiffs(asks);

  const minDiff = Math.min(...diffs.filter((d) => d > 0));
  if (!Number.isFinite(minDiff) || minDiff <= 0) return fallback;

  const base = snapUpToAllowedDepth(minDiff);

  // Prefer 4 log-scaled tiers starting from base.
  const desired = [base, base * 10, base * 100, base * 1000].map(snapUpToAllowedDepth);
  const uniq = Array.from(new Set(desired)).sort((a, b) => a - b);

  if (uniq.length >= 4) {
    return uniq.slice(0, 4).map((n) => ALLOWED_DEPTH_VALUES[ALLOWED_DEPTH_NUMBERS.indexOf(n)] ?? formatDepthValue(n));
  }

  // If snapping collapsed tiers, pick 4 consecutive allowed values around base.
  const baseIdx = Math.max(0, ALLOWED_DEPTH_NUMBERS.findIndex((n) => n === base));
  const start = Math.max(0, Math.min(baseIdx, ALLOWED_DEPTH_VALUES.length - 4));
  return ALLOWED_DEPTH_VALUES.slice(start, start + 4) as unknown as string[];
}

type NormalizedLevel = {
  price: number;
  size: number;
  total: number;
  priceStr: string;
  sizeStr: string;
  totalStr: string;

   // 计算用（新增）
  priceBN: BigNumber;
  sizeBN: BigNumber;
  totalBN: BigNumber;
};

// function normalizeLevels(
//   levels: unknown,
//   side: Side
// ): NormalizedLevel[] {
//   if (!Array.isArray(levels)) return [];

//   let total = 0;

//   // Support both [[price, size], ...] and [{ price, size }, ...] formats
//   return levels
//     .map((raw) => {
//       let priceStr: string | undefined;
//       let sizeStr: string | undefined;

//       if (Array.isArray(raw) && raw.length >= 2) {
//         priceStr = String(raw[0]);
//         sizeStr = String(raw[1]);
//       } else if (raw && typeof raw === "object") {
//         const obj = raw as { price?: string; size?: string; amount?: string };
//         priceStr = obj.price;
//         sizeStr = obj.size ?? obj.amount;
//       }

//       if (!priceStr || !sizeStr) return null;

//       const price = Number.parseFloat(priceStr);
//       const size = Number.parseFloat(sizeStr);
//       if (!Number.isFinite(price) || !Number.isFinite(size)) return null;

//       total += size;

//       return {
//         price,
//         size,
//         total,
//         priceStr,
//         sizeStr: formatQty(size),
//         totalStr: total.toFixed(4),
//       } as NormalizedLevel;
//     })
//     .filter((x): x is NormalizedLevel => x !== null)
//     // For asks we want best (lowest) price at top; for bids highest at top
//     .sort((a, b) => (side === "asks" ? a.price - b.price : b.price - a.price));
// }

function normalizeLevels(
  levels: unknown,
  side: Side
): NormalizedLevel[] {
  if (!Array.isArray(levels)) return [];

  const normalized: Omit<
    NormalizedLevel,
    "total" | "totalBN" | "totalStr"
  >[] = [];

  for (const raw of levels) {
    let priceStr: string | undefined;
    let sizeStr: string | undefined;

    if (Array.isArray(raw) && raw.length >= 2) {
      priceStr = String(raw[0]);
      sizeStr = String(raw[1]);
    } else if (raw && typeof raw === "object") {
      const obj = raw as { price?: string; size?: string; amount?: string };
      priceStr = obj.price;
      sizeStr = obj.size ?? obj.amount;
    }

    if (!priceStr || !sizeStr) continue;

    const priceBN = new BigNumber(priceStr);
    const sizeBN = new BigNumber(sizeStr);

    if (!priceBN.isFinite() || !sizeBN.isFinite() || sizeBN.lte(0)) continue;

    normalized.push({
      // number（UI / 兼容）
      price: priceBN.toNumber(),
      size: sizeBN.toNumber(),

      // BigNumber（逻辑）
      priceBN,
      sizeBN,

      priceStr: formatPriceWithComma(priceBN.toNumber()),
      sizeStr: formatQty(sizeBN.toNumber()),
    });
  }

  normalized.sort((a, b) => {
  if (!a.priceBN.isFinite() || !b.priceBN.isFinite()) return 0;

  return side === "asks"
    ? a.priceBN.comparedTo(b.priceBN)!
    : b.priceBN.comparedTo(a.priceBN)!;
  });

  let totalBN = new BigNumber(0);

  return normalized.map((lvl) => {
    totalBN = totalBN.plus(lvl.sizeBN);
    const totalNum = totalBN.toNumber();

    return {
      ...lvl,
      totalBN,
      total: totalNum,
      totalStr: formatTotal(totalNum),
    };
  });
}


export function OrderBookx10000() {
  const { chainId } = useChainId();
  const { selectedSymbol } = useX10000State();

  const symbol = selectedSymbol || "BTC-USD";

  const [activeTab, setActiveTab] = useState<"orderbook" | "trades">("orderbook");
  const [depth, setDepth] = useState<string>("0.01");

  // REST: initial snapshot（仅获取一次，不轮询，实时更新由 WebSocket 提供）
  const { orderbook } = useApiOrderbook(chainId, symbol, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const { trades } = useApiTrades(chainId, symbol, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const { ticker } = useApiTicker(chainId, symbol);

  // WS: incremental updates
  const { orderbook: wsOrderbook } = useOrderbookUpdates(chainId, symbol);
  const { lastTrade } = useTradesUpdates(chainId, symbol);

  // Convert orderbook formats to unified format
  // WsOrderbookUpdate: { bids: Array<{ price, size }>, asks: Array<{ price, size }> }
  // Orderbook: { bids: [string, string][], asks: [string, string][] }
  const effectiveOrderbook = useMemo(() => {
    if (wsOrderbook) {
      // Convert WsOrderbookUpdate format to array format
      return {
        bids: wsOrderbook.bids.map((b) => [b.price, b.size] as [string, string]),
        asks: wsOrderbook.asks.map((a) => [a.price, a.size] as [string, string]),
      };
    }
    if (orderbook) {
      // Orderbook already in array format
      return {
        bids: orderbook.bids,
        asks: orderbook.asks,
      };
    }
    return null;
  }, [wsOrderbook, orderbook]);

  const effectiveTicker = ticker || null;

  const depthOptions = useMemo(() => computeDepthOptionsFromOrderbook(effectiveOrderbook), [effectiveOrderbook]);
  const depthTick = useMemo(() => {
    const n = Number.parseFloat(depth);
    return Number.isFinite(n) && n > 0 ? n : Number.parseFloat(depthOptions[0] ?? "0.01");
  }, [depth, depthOptions]);

  const prevOptionsKeyRef = useRef(depthOptions.join(","));
  useEffect(() => {
    const key = depthOptions.join(",");
    if (key !== prevOptionsKeyRef.current) {
      // depthOptions changed (market switch or real data arrived) → reset to minimum
      prevOptionsKeyRef.current = key;
      setDepth(depthOptions[0] ?? "0.01");
    } else if (!depthOptions.includes(depth)) {
      // Same options but current depth invalid → correct it
      setDepth(depthOptions[0] ?? "0.01");
    }
  }, [depthOptions, depth]);

  const bids = useMemo(
    () => {
      const aggregated = aggregateLevelsByTick(effectiveOrderbook?.bids, "bids", depthTick);
      const normalized = normalizeLevels(aggregated, "bids");
      return normalized;
    },
    [effectiveOrderbook?.bids, depthTick]
  );
  const asks = useMemo(
    () => {
      const aggregated = aggregateLevelsByTick(effectiveOrderbook?.asks, "asks", depthTick);
      const normalized = normalizeLevels(aggregated, "asks");
      return normalized;
    },
    [effectiveOrderbook?.asks, depthTick]
  );

  const [lastTrades, setLastTrades] = useState<Array<{ id: string; price: string; amount: string; side: "buy" | "sell"; timestamp: number }>>(
    []
  );

  // Initialize / reset from REST snapshot when symbol changes.
  useEffect(() => {
    setLastTrades(trades?.trades ?? []);
  }, [symbol, trades?.trades]);

  // Append WS pushed trades on top.
  useEffect(() => {
    if (!lastTrade) return;

    const id = lastTrade.id ?? `${lastTrade.symbol}:${lastTrade.timestamp}:${lastTrade.price}:${lastTrade.amount}:${lastTrade.side}`;

    setLastTrades((prev) => {
      // Dedup by id (and guard against duplicates from reconnect / resubscribe)
      if (prev.some((t) => t.id === id)) {
        return prev;
      }

      const next = [{ ...lastTrade, id }, ...prev];
      // Keep list bounded for performance (UI shows latest rows only)
      return next.slice(0, 50);
    });
  }, [lastTrade]);

  const lastPrice = effectiveTicker?.last_price ? Number.parseFloat(effectiveTicker.last_price) : undefined;
  const volume24h = effectiveTicker?.volume_24h ? Number.parseFloat(effectiveTicker.volume_24h) : undefined;

  // Get last trade side for price color
  const lastTradeSide = useMemo(() => {
    if (lastTrades.length === 0) return undefined;
    return lastTrades[0]?.side; // First item is the most recent trade
  }, [lastTrades]);

  // Calculate reference price (mid price) and spread ratio
  const referencePrice = useMemo(() => {
    if (asks.length === 0 || bids.length === 0) return undefined;
    const ask1 = asks[0]?.price;
    const bid1 = bids[0]?.price;
    if (ask1 === undefined || bid1 === undefined || !Number.isFinite(ask1) || !Number.isFinite(bid1)) {
      return undefined;
    }
    return (ask1 + bid1) / 2;
  }, [asks, bids]);

  const spreadRatio = useMemo(() => {
    if (asks.length === 0 || bids.length === 0 || referencePrice === undefined) return undefined;
    const ask1 = asks[0]?.price;
    const bid1 = bids[0]?.price;
    if (ask1 === undefined || bid1 === undefined || !Number.isFinite(ask1) || !Number.isFinite(bid1) || referencePrice === 0) {
      return undefined;
    }
    return ((ask1 - bid1) / referencePrice) * 100;
  }, [asks, bids, referencePrice]);

  // Fixed number of rows to display for each side
  const FIXED_ROWS = 10;

  // Fill asks and bids to fixed rows
  const filledAsks = useMemo(() => {
    const filled = [...asks];
    while (filled.length < FIXED_ROWS) {
      filled.push({
        price: 0,
        size: 0,
        total: 0,
        priceStr: "--",
        sizeStr: "--",
        totalStr: "--",
      } as NormalizedLevel);
    }
    return filled.slice(0, FIXED_ROWS);
  }, [asks]);

  const filledBids = useMemo(() => {
    const filled = [...bids];
    while (filled.length < FIXED_ROWS) {
      filled.push({
        price: 0,
        size: 0,
        total: 0,
        priceStr: "--",
        sizeStr: "--",
        totalStr: "--",
      } as NormalizedLevel);
    }
    return filled.slice(0, FIXED_ROWS);
  }, [bids]);

  // Calculate max total for depth visualization
  const maxAskTotal = useMemo(() => {
    if (asks.length === 0) return 1;
    return Math.max(...asks.map((a) => a.total));
  }, [asks]);

  const maxBidTotal = useMemo(() => {
    if (bids.length === 0) return 1;
    return Math.max(...bids.map((b) => b.total));
  }, [bids]);

  const renderOrderbook = () => (
    <div className="OrderBookx10000-book flex flex-col overflow-hidden h-full">
      {/* 标题行 */}
      <div className="grid grid-cols-3 gap-8 px-12 py-4 text-11 text-typography-secondary shrink-0">
        <span className="text-right truncate">
          <Trans>Price(USDT)</Trans>
        </span>
        <span className="text-right truncate">
          <Trans>Qty</Trans>
        </span>
        <span className="text-right truncate">
          <Trans>Total</Trans>
        </span>
      </div>

      {/* 做空列表（asks）, 在上方 - 固定高度，使用 flex-1 自动填充 */}
      <div className="OrderBookx10000-asks flex flex-col-reverse px-12 overflow-y-auto flex-1 min-h-0">
        {filledAsks.map((level, idx) => {
          const isEmpty = level.price === 0 && level.size === 0;
          const widthPercent = isEmpty || maxAskTotal === 0 ? 0 : (level.total / maxAskTotal) * 100;
          const barWidth = `${widthPercent}%`;
          return (
            <div
              key={`ask-${idx}-${level.priceStr}-${level.sizeStr}`}
              className="OrderBookx10000-row relative grid grid-cols-3 gap-8 py-2"
            >
              {/* 背景条 - 红色，从右侧开始 */}
              {!isEmpty && (
                <div
                  className="absolute right-0 top-0 h-full bg-red-500/20"
                  style={{ width: barWidth }}
                />
              )}
              <span className={cx("relative text-right numbers z-10 truncate", {
                "text-red-400": !isEmpty,
                "text-typography-secondary": isEmpty,
              })}>{level.priceStr}</span>
              <span className={cx("relative text-right numbers z-10 truncate", {
                "text-typography-primary": !isEmpty,
                "text-typography-secondary": isEmpty,
              })}>{level.sizeStr}</span>
              <span className={cx("relative text-right numbers z-10 truncate", {
                "text-typography-secondary": true,
              })}>{level.totalStr}</span>
            </div>
          );
        })}
      </div>

      {/* 中间一行：最新成交价、参考价、价差比例（只显示数值）- 固定在中间，与顶部Tab对齐 */}
      <div className="OrderBookx10000-mid grid grid-cols-3 gap-8 px-12 py-8 border-y border-slate-800 shrink-0">
        <span
          className={cx("numbers text-13 font-medium text-right truncate", {
            "text-green-400": lastTradeSide === "buy",
            "text-red-400": lastTradeSide === "sell",
            "text-typography-primary": lastTradeSide === undefined,
          })}
        >
          {lastPrice !== undefined ? formatPriceWithComma(lastPrice) : "--"}
        </span>
        <span className="numbers text-13 font-medium text-typography-primary text-right truncate">
          {referencePrice !== undefined ? formatPriceWithComma(referencePrice) : "--"}
        </span>
        <span className="numbers text-13 font-medium text-typography-primary text-right truncate">
          {spreadRatio !== undefined ? `${spreadRatio.toFixed(4)}%` : "--"}
        </span>
      </div>

      {/* 做多列表（bids）, 在下方 - 固定高度，使用 flex-1 自动填充 */}
      <div className="OrderBookx10000-bids px-12 pb-8 overflow-y-auto flex-1 min-h-0">
        {filledBids.map((level, idx) => {
          const isEmpty = level.price === 0 && level.size === 0;
          const widthPercent = isEmpty || maxBidTotal === 0 ? 0 : (level.total / maxBidTotal) * 100;
          const barWidth = `${widthPercent}%`;
          return (
            <div
              key={`bid-${idx}-${level.priceStr}-${level.sizeStr}`}
              className="OrderBookx10000-row relative grid grid-cols-3 gap-8 py-2"
            >
              {/* 背景条 - 绿色，从右侧开始 */}
              {!isEmpty && (
                <div
                  className="absolute right-0 top-0 h-full bg-green-500/20"
                  style={{ width: barWidth }}
                />
              )}
              <span className={cx("relative text-right numbers z-10 truncate", {
                "text-green-400": !isEmpty,
                "text-typography-secondary": isEmpty,
              })}>{level.priceStr}</span>
              <span className={cx("relative text-right numbers z-10 truncate", {
                "text-typography-primary": !isEmpty,
                "text-typography-secondary": isEmpty,
              })}>{level.sizeStr}</span>
              <span className={cx("relative text-right numbers z-10 truncate", {
                "text-typography-secondary": true,
              })}>{level.totalStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTrades = () => (
    <>
      <div className="grid grid-cols-3 gap-8 px-12 py-4 text-11 text-typography-secondary">
        <span className="text-right truncate">
          <Trans>Price(USDT)</Trans>
        </span>
        <span className="text-right truncate">
          <Trans>Qty</Trans>
        </span>
        <span className="text-right truncate">
          <Trans>Time</Trans>
        </span>
      </div>
      <div className="OrderBookx10000-trades px-12 pb-8">
        {lastTrades.length > 0 ? lastTrades.map((trade) => {
          const price = Number.parseFloat(trade.price);
          const amount = Number.parseFloat(trade.amount);
          const isBuy = trade.side === "buy";

          return (
            <div
              key={trade.id}
              className="grid grid-cols-3 gap-8 py-1"
            >
              <span
                className={cx("text-right numbers truncate", {
                  "text-green-400": isBuy,
                  "text-red-400": !isBuy,
                })}
              >
                {Number.isFinite(price) ? formatPriceWithComma(price) : trade.price}
              </span>
              <span className="text-right numbers text-typography-primary truncate">
                {Number.isFinite(amount) ? formatQty(amount) : trade.amount}
              </span>
              <span className="text-right numbers text-typography-secondary truncate">
                {formatTradeTime(trade.timestamp)}
              </span>
            </div>
          );
        }) : (
          <div className="py-8 text-center text-typography-secondary text-11">
            <Trans>No trades data</Trans>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="OrderBookx10000 rounded-8 bg-slate-900 text-12 text-typography-primary overflow-hidden min-w-0 w-full">
      {/* 顶部 Tabs：Order book / Last trades */}
      <div className="OrderBookx10000-tabs flex items-center gap-12 px-12 py-8 border-b border-slate-700">
        <button
          type="button"
          className={cx(
            "text-12 font-medium",
            activeTab === "orderbook" ? "text-typography-primary" : "text-typography-secondary"
          )}
          onClick={() => setActiveTab("orderbook")}
        >
          <Trans>Order book</Trans>
        </button>
        <button
          type="button"
          className={cx(
            "text-12 font-medium",
            activeTab === "trades" ? "text-typography-primary" : "text-typography-secondary"
          )}
          onClick={() => setActiveTab("trades")}
        >
          <Trans>Last trades</Trans>
        </button>
      </div>

      {/* 第二行：深度选择下拉框 */}
      <div className="OrderBookx10000-depth flex items-center justify-end gap-4 px-12 py-4 border-b border-slate-800 text-11">
        <span className="text-typography-secondary">
          <Trans>Depth</Trans>
        </span>
        <select
          className="rounded-4 bg-slate-800 px-8 py-4 text-11 text-typography-primary outline-none border border-slate-700"
          value={depth}
          onChange={(e) => setDepth(e.target.value)}
        >
          {depthOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {activeTab === "orderbook" ? renderOrderbook() : renderTrades()}
    </div>
  );
}

export default OrderBookx10000;


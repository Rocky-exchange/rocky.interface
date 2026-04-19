/**
 * Demo-only fake trading logic for the CCUSDT pair.
 *
 * All other pairs keep going to api.primit.io via the standard client.
 * This module is injected at the top of each relevant `client.ts` export so
 * that when symbol === CCUSDT we short-circuit the network call and return
 * deterministic (for market data) or in-memory (for user data) results.
 *
 * Price is a deterministic function of wall clock time so that ticker /
 * orderbook / candles all agree without needing shared state. Positions and
 * orders are kept in a module-level store that survives until page reload.
 */
import type {
  AccountBalance,
  Market,
  Order,
  Orderbook,
  Position,
  Ticker,
  Trade,
} from "../types";
import type {
  BalancesResponse,
  Candle,
  CandlesResponse,
  CreateOrderResponse,
  GetCandlesParams,
  MarketsResponse,
  OrdersResponse,
  PositionsResponse,
  TradesResponse,
} from "./client";

export const CC_SYMBOL = "CCUSDT";
const CC_ID_PREFIX = "cc-";
const CC_BASELINE_PRICE = 2.5;

export function isCcSymbol(symbol: string | undefined | null): boolean {
  if (!symbol) return false;
  const s = symbol.toUpperCase();
  return s === "CCUSDT" || s === "CC-USD" || s === "CC";
}

export function isCcId(id: string | undefined | null): boolean {
  return !!id && id.startsWith(CC_ID_PREFIX);
}

// -----------------------------------------------------------------------------
// Deterministic price oracle — function of wall clock time
// -----------------------------------------------------------------------------
function priceAt(timeMs: number): number {
  const t = timeMs / 1000;
  const drift =
    0.07 * Math.sin(t / 720) +
    0.035 * Math.sin(t / 91 + 1.3) +
    0.012 * Math.sin(t / 13 + 0.4);
  const noise = 0.004 * Math.sin(t * 1.7 + 2.1);
  return CC_BASELINE_PRICE * (1 + drift + noise);
}

function currentPrice(): number {
  return priceAt(Date.now());
}

function fmt(value: number, decimals = 4): string {
  return value.toFixed(decimals);
}

// -----------------------------------------------------------------------------
// In-memory user state (positions + orders created while the tab is open)
// -----------------------------------------------------------------------------
type FakePosition = Position;
type FakeOrder = Order;

const store = {
  positions: [] as FakePosition[],
  orders: [] as FakeOrder[],
};

let idCounter = 1;
function nextId(prefix: string): string {
  return `${CC_ID_PREFIX}${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

// -----------------------------------------------------------------------------
// Market / ticker / orderbook / trades / candles generators
// -----------------------------------------------------------------------------
export function fakeMarket(): Market {
  const price = currentPrice();
  const priceOpen = priceAt(Date.now() - 24 * 3600 * 1000);
  const change = price - priceOpen;
  const changePct = (change / priceOpen) * 100;
  return {
    symbol: CC_SYMBOL,
    base_asset: "CC",
    quote_asset: "USDT",
    last_price: fmt(price),
    price_change_24h: fmt(change),
    price_change_percent_24h: fmt(changePct, 3),
    high_24h: fmt(price * 1.025, 4),
    low_24h: fmt(price * 0.97, 4),
    volume_24h: "1834521.48",
    volume_24h_usd: fmt(price * 1834521.48, 2),
    rank: 999,
    type: "demo",
    leverage: 10,
    price_decimals: 4,
    size_decimals: 2,
    status: "active",
  };
}

export function fakeTicker(): Ticker {
  const m = fakeMarket();
  return {
    symbol: CC_SYMBOL,
    last_price: m.last_price,
    price_change_24h: m.price_change_24h,
    price_change_percent_24h: m.price_change_percent_24h,
    high_24h: m.high_24h,
    low_24h: m.low_24h,
    volume_24h: m.volume_24h,
    open_interest: "284512.30",
    funding_rate: "0.00012",
    next_funding_time: Date.now() + 3600_000,
  };
}

export function fakeOrderbook(): Orderbook {
  const mid = currentPrice();
  const tick = 0.0005;
  const bids: [string, string][] = [];
  const asks: [string, string][] = [];
  for (let i = 1; i <= 20; i++) {
    const bidPx = mid - tick * i;
    const askPx = mid + tick * i;
    const bidQty = 80 + Math.abs(Math.sin(Date.now() / 1000 + i)) * 420;
    const askQty = 80 + Math.abs(Math.cos(Date.now() / 1000 + i * 1.3)) * 420;
    bids.push([fmt(bidPx), fmt(bidQty, 2)]);
    asks.push([fmt(askPx), fmt(askQty, 2)]);
  }
  return { symbol: CC_SYMBOL, bids, asks, timestamp: Date.now() };
}

export function fakeTrades(count = 40): TradesResponse {
  const now = Date.now();
  const trades: Trade[] = [];
  for (let i = 0; i < count; i++) {
    const ts = now - i * (1500 + (i * 97) % 2200);
    const px = priceAt(ts);
    const isBuy = ((i * 31 + 7) % 5) > 1;
    const qty = 5 + ((i * 13 + 3) % 47);
    trades.push({
      id: `${CC_ID_PREFIX}t-${ts}-${i}`,
      symbol: CC_SYMBOL,
      price: fmt(px),
      amount: fmt(qty, 2),
      side: isBuy ? "buy" : "sell",
      timestamp: ts,
    });
  }
  return { symbol: CC_SYMBOL, trades };
}

function periodToMs(period: string): number {
  const table: Record<string, number> = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "6h": 21_600_000,
    "12h": 43_200_000,
    "1d": 86_400_000,
    "1w": 604_800_000,
  };
  return table[period] ?? 300_000;
}

export function fakeCandles(params: GetCandlesParams): CandlesResponse {
  const step = periodToMs(params.period);
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 2000);
  const now = Date.now();
  const end = params.end ?? now;
  // Always produce at most `limit` candles, from latest backward.
  const startFloor = end - step * (limit - 1);
  const startRequested = params.start != null ? params.start : startFloor;
  const effectiveStart = Math.max(startRequested, startFloor);
  const firstBucket = Math.floor(effectiveStart / step) * step;
  const lastBucket = Math.floor(end / step) * step;

  const candles: Candle[] = [];
  for (let t = firstBucket; t <= lastBucket && candles.length < limit; t += step) {
    const openPx = priceAt(t);
    const closePx = priceAt(t + step - 1);
    const highPx = Math.max(openPx, closePx) * (1 + 0.003 * Math.abs(Math.sin(t / 71)));
    const lowPx = Math.min(openPx, closePx) * (1 - 0.003 * Math.abs(Math.cos(t / 53)));
    const vol = 600 + 800 * Math.abs(Math.sin(t / 137));
    candles.push({
      time: t,
      open: fmt(openPx),
      high: fmt(highPx),
      low: fmt(lowPx),
      close: fmt(closePx),
      volume: fmt(vol, 2),
      quote_volume: fmt(vol * (openPx + closePx) * 0.5, 2),
      trade_count: Math.round(40 + 80 * Math.abs(Math.sin(t / 41))),
      is_final: t + step <= now,
    });
  }

  return { symbol: CC_SYMBOL, period: params.period, candles };
}

// -----------------------------------------------------------------------------
// User-state actions (triggered by createOrder / closePosition / cancelOrder)
// -----------------------------------------------------------------------------
export function recordFakeOrder(request: {
  symbol: string;
  side: "buy" | "sell";
  order_type: string;
  amount: string;
  price?: string;
  leverage: number;
}): CreateOrderResponse {
  const now = Date.now();
  const size = Number(request.amount) || 0;
  const fillPrice = request.order_type === "market" || !request.price
    ? currentPrice()
    : Number(request.price);
  const orderId = nextId("ord");

  const order: FakeOrder = {
    id: orderId,
    client_order_id: orderId,
    symbol: CC_SYMBOL,
    side: request.side,
    order_type: request.order_type as FakeOrder["order_type"],
    size: fmt(size, 2),
    price: request.price ?? fmt(fillPrice),
    filled_size: fmt(size, 2),
    filled_amount: fmt(size, 2),
    average_price: fmt(fillPrice),
    mark_price: fmt(currentPrice()),
    status: "filled",
    reduce_only: false,
    time_in_force: "GTC",
    created_at: now,
    updated_at: now,
  };
  store.orders.unshift(order);
  if (store.orders.length > 80) store.orders.length = 80;

  // open a position for the filled order
  const positionSide = request.side === "buy" ? "long" : "short";
  const notional = size * fillPrice;
  const collateral = notional / Math.max(1, request.leverage);
  const posId = nextId("pos");
  const position: FakePosition = {
    position_id: posId,
    id: posId,
    symbol: CC_SYMBOL,
    side: positionSide,
    size: fmt(notional, 2),
    amount: fmt(size, 2),
    entry_price: fmt(fillPrice),
    mark_price: fmt(fillPrice),
    liquidation_price: fmt(fillPrice * (positionSide === "long" ? 0.85 : 1.15)),
    unrealized_pnl: "0",
    unrealized_pnl_percent: "0",
    realized_pnl: "0",
    collateral_amount: fmt(collateral, 2),
    margin: fmt(collateral, 2),
    leverage: request.leverage,
    margin_ratio: "0.02",
    status: "open",
    created_at: now,
    updated_at: now,
  };
  store.positions.unshift(position);

  return {
    order_id: orderId,
    status: "filled",
    filled_amount: fmt(size, 2),
    remaining_amount: "0",
    average_price: fmt(fillPrice),
    created_at: new Date(now).toISOString(),
  };
}

export function closeFakePosition(positionId: string): CreateOrderResponse {
  const idx = store.positions.findIndex((p) => p.position_id === positionId || p.id === positionId);
  const now = Date.now();
  let closedSize = "0";
  let closedPrice = fmt(currentPrice());
  if (idx >= 0) {
    const p = store.positions[idx];
    closedSize = p.amount;
    closedPrice = fmt(currentPrice());
    store.positions.splice(idx, 1);
  }
  return {
    order_id: nextId("close"),
    status: "filled",
    filled_amount: closedSize,
    remaining_amount: "0",
    average_price: closedPrice,
    created_at: new Date(now).toISOString(),
  };
}

export function cancelFakeOrder(orderId: string): { order_id: string; status: string } {
  const idx = store.orders.findIndex((o) => o.id === orderId);
  if (idx >= 0) {
    store.orders[idx] = { ...store.orders[idx], status: "cancelled", updated_at: Date.now() };
  }
  return { order_id: orderId, status: "cancelled" };
}

// -----------------------------------------------------------------------------
// Read helpers: inject fake user state into real responses
// -----------------------------------------------------------------------------
function refreshPositionPnl(p: FakePosition): FakePosition {
  const mark = currentPrice();
  const entry = Number(p.entry_price);
  const amount = Number(p.amount);
  const diff = p.side === "long" ? mark - entry : entry - mark;
  const pnl = diff * amount;
  const pnlPct = entry > 0 ? (diff / entry) * 100 : 0;
  return {
    ...p,
    mark_price: fmt(mark),
    unrealized_pnl: fmt(pnl, 2),
    unrealized_pnl_percent: fmt(pnlPct / 100, 4),
    updated_at: Date.now(),
  };
}

export function injectFakePositions(resp: PositionsResponse): PositionsResponse {
  const fakes = store.positions.map(refreshPositionPnl);
  if (!fakes.length) return resp;
  const extraPnl = fakes.reduce((acc, p) => acc + (Number(p.unrealized_pnl) || 0), 0);
  const extraCollateral = fakes.reduce((acc, p) => acc + (Number(p.collateral_amount) || 0), 0);
  return {
    positions: [...fakes, ...resp.positions],
    total_unrealized_pnl: fmt((Number(resp.total_unrealized_pnl) || 0) + extraPnl, 2),
    total_collateral: fmt((Number(resp.total_collateral) || 0) + extraCollateral, 2),
  };
}

export function injectFakeOrders(resp: OrdersResponse): OrdersResponse {
  if (!store.orders.length) return resp;
  return { orders: [...store.orders, ...resp.orders] };
}

export function injectFakeMarket(resp: MarketsResponse): MarketsResponse {
  const already = resp.markets.some((m) => m.symbol === CC_SYMBOL);
  if (already) return resp;
  return { markets: [fakeMarket(), ...resp.markets], total: resp.total + 1 };
}

export function injectFakeBalance(resp: BalancesResponse): BalancesResponse {
  // Optionally surface a "CC" holding so the UI shows non-zero balance for demo
  const ccBalance: AccountBalance = {
    token: "CC",
    symbol: "CC",
    available: "10000",
    frozen: "0",
    total: "10000",
  };
  const already = resp.balances.some((b) => b.symbol === "CC");
  if (already) return resp;
  return { balances: [...resp.balances, ccBalance] };
}

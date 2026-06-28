# Activate app.rocky.exchange on rocky-backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the original Vite UI at app.rocky.exchange fully functional on the demo's rocky-backend — MetaMask removed, Loop/Console wallet login in the top-right, real-balance trading — without changing the UI's look.

**Architecture:** Add **additive `/api/v1/*` compatibility routes inside the demo's Next.js app** (`mtc-exchange`) that proxy to rocky-backend `/v1/*` (reusing the existing `passthrough*` BFF that forwards the session bearer), mapping symbols and reshaping responses into the exact primit shapes the original UI already consumes. The original UI (`rocky.interface`) keeps its data layer; we only swap web3 login → Canton wallet login, point it at same-origin, and switch the chart to polling. nginx on the shared host serves the UI's static build and proxies `/api/*`,`/auth/*` to the demo app.

**Tech Stack:** `rocky.interface` (Vite + React + TS, vitest); `mtc-exchange` (Next.js 16, vitest); nginx + EC2 `13.231.118.218`; wallet SDKs `@fivenorth/loop-sdk`, `@console-wallet/dapp-sdk`.

## Global Constraints

- Local Mac is **code-only**. Never run rocky-backend / Docker / Daml / Java / Canton / `next start` locally. **Vitest unit tests run locally** (pure JS, allowed). All builds + deploys + service runs happen on EC2 `13.231.118.218` (key `~/.ssh/rocky-canton-sandbox.pem`).
- Two repos: UI = `/Users/ubuntu/Desktop/Rocky/rocky.interface` (branch `main`); demo = `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange` (branch `main`). Commit directly to `main` in each; do not create feature branches.
- Demo changes must be **additive** (new routes/files only). Do not alter demo pages/behavior. The sole non-additive demo edit allowed: unsetting `AUTH0_WALLET_REDIRECT_URI` (Task 15).
- Symbol formats: UI internal `BTC-USD`; UI→API `BTCUSDT`; rocky-backend `BTC-PERP`. Mapping lives server-side in compat routes.
- Session token: browser holds `rocky_exchange_session` (from Canton login); it is sent as `Authorization: Bearer <token>` and forwarded unchanged to rocky-backend.
- Vite build output dir is `build` (not `dist`); env vars are `import.meta.env.VITE_*`.
- app.rocky.exchange and demo.rocky.exchange both resolve to `13.231.118.218` and share the demo Next.js instance on `:8080` and rocky-backend on `:18080`.

---

## File Structure

**Demo repo (`mtc-exchange`) — new files:**
- `src/lib/compat/symbol.ts` — symbol mapping (primit ↔ rocky-backend).
- `src/lib/compat/shape.ts` — reshape rocky-backend `/v1/*` JSON → primit shapes.
- `src/app/api/v1/markets/route.ts`
- `src/app/api/v1/markets/[symbol]/orderbook/route.ts`
- `src/app/api/v1/markets/[symbol]/trades/route.ts`
- `src/app/api/v1/markets/[symbol]/ticker/route.ts`
- `src/app/api/v1/markets/[symbol]/candles/route.ts`
- `src/app/api/v1/klines/[symbol]/candles/latest/route.ts`
- `src/app/api/v1/account/{balances,positions,orders,trades}/route.ts`
- `src/app/api/v1/orders/route.ts` (POST), `src/app/api/v1/orders/[orderId]/route.ts` (DELETE)
- `src/app/api/v1/positions/[positionId]/close/route.ts`
- tests under `tests/compat/`.

**UI repo (`rocky.interface`) — new/modified:**
- New: `src/shared/lib/canton-wallet/{types,session,loop,console,index}.ts` (ported), `src/shared/lib/canton-wallet/useCantonWallet.ts`, `src/shared/components/AppHeader/CantonWalletButton.tsx`.
- Modify: `src/shared/components/AppHeader/AppHeaderUser.tsx`, `src/app/App.tsx` (drop WagmiProvider), `src/shared/config/backend.ts`, `src/modules/cex/lib/api/custom/client.ts` (token source + symbol), `src/modules/dex/domain/tradingview/X10000KlineDataFeed.ts` (polling), `vite.config.ts` (dev proxy), `deploy.sh` (host), `.env.local`.

---

## Task 1: Symbol mapping util (demo)

**Files:**
- Create: `src/lib/compat/symbol.ts`
- Test: `tests/compat/symbol.test.ts`

**Interfaces:**
- Produces: `toRockySymbol(input: string): string` — any of `BTCUSDT|BTC-USD|BTC/USD|BTC-PERP|BTC` → `BTC-PERP`. `fromRockySymbol(sym: string): string` — `BTC-PERP` → `BTCUSDT`.

- [ ] **Step 1: Write the failing test**
```ts
// tests/compat/symbol.test.ts
import { describe, it, expect } from "vitest";
import { toRockySymbol, fromRockySymbol } from "@/lib/compat/symbol";

describe("symbol mapping", () => {
  it("maps UI/API formats to rocky-backend PERP", () => {
    for (const s of ["BTCUSDT", "BTC-USD", "BTC/USD", "BTC-PERP", "BTC"]) {
      expect(toRockySymbol(s)).toBe("BTC-PERP");
    }
    expect(toRockySymbol("ethusdt")).toBe("ETH-PERP");
  });
  it("maps rocky-backend PERP back to USDT form", () => {
    expect(fromRockySymbol("BTC-PERP")).toBe("BTCUSDT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange && npx vitest run tests/compat/symbol.test.ts`
Expected: FAIL — cannot find module `@/lib/compat/symbol`.

- [ ] **Step 3: Write minimal implementation**
```ts
// src/lib/compat/symbol.ts
// Extract the base asset from any supported notation, then format.
function baseAsset(input: string): string {
  const s = (input || "").trim().toUpperCase();
  if (s.includes("-PERP")) return s.replace("-PERP", "");
  if (s.includes("-") || s.includes("/")) return s.split(/[-/]/)[0];
  if (s.endsWith("USDT")) return s.slice(0, -4);
  if (s.endsWith("USD")) return s.slice(0, -3);
  return s;
}
export function toRockySymbol(input: string): string {
  return `${baseAsset(input)}-PERP`;
}
export function fromRockySymbol(sym: string): string {
  return `${baseAsset(sym)}USDT`;
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/compat/symbol.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
git add src/lib/compat/symbol.ts tests/compat/symbol.test.ts
git commit -m "feat(compat): symbol mapping for primit↔rocky-backend"
```

---

## Task 2: Capture live rocky-backend `/v1/*` shapes (fixtures)

Reshapers (Task 3+) must be written against real upstream shapes. Capture the **public** ones live; record **private** ones from a logged-in session token.

**Files:**
- Create: `tests/compat/fixtures/` (JSON captures).

- [ ] **Step 1: Capture public market shapes from the demo BFF (no auth)**
Run:
```bash
H=13.231.118.218; K=~/.ssh/rocky-canton-sandbox.pem
ssh -i $K ubuntu@$H 'for p in \
  /v1/markets \
  /v1/markets/BTC-PERP/orderbook \
  /v1/markets/BTC-PERP/ticker \
  /v1/markets/BTC-PERP/recent-trades?limit=5 \
  "/v1/markets/BTC-PERP/candles?interval=1m&limit=3"; do \
  echo "=== $p ==="; curl -s "http://127.0.0.1:18080$p" | head -c 1200; echo; done'
```
Expected: JSON bodies. Save each into `tests/compat/fixtures/<name>.json`.

- [ ] **Step 2: Record private-route shapes**
For `/v1/positions`, `/v1/orders-me?status=open`, `/v1/trades`, `/v1/account/USDC`: these need a valid `Authorization: Bearer <session>`. Obtain one by logging into demo.rocky.exchange with a wallet, copy `localStorage.rocky_exchange_session`, then:
```bash
ssh -i $K ubuntu@$H 'curl -s -H "authorization: Bearer <SESSION>" http://127.0.0.1:18080/v1/positions | head -c 1200'
```
Save to fixtures. If a session is not yet available, record the field names from `src/lib/perp/api.ts` types and the OrderForm payload (documented in Task 5/6) and refine after first login.

- [ ] **Step 3: Commit fixtures**
```bash
git add tests/compat/fixtures
git commit -m "test(compat): capture rocky-backend /v1 response fixtures"
```

---

## Task 3: Reshape helpers + market compat routes (demo)

**Files:**
- Create: `src/lib/compat/shape.ts`, the four `src/app/api/v1/markets/...` routes.
- Test: `tests/compat/shape.test.ts`

**Interfaces:**
- Consumes: `toRockySymbol` (Task 1); `passthroughGET` from `@/lib/perp/bff`.
- Produces in `shape.ts`:
  - `reshapeMarkets(raw): {symbol,baseAsset,quoteAsset,minOrderSize,maxLeverage,makerFee,takerFee}[]`
  - `reshapeOrderbook(symbol, raw): {symbol,bids:[string,string][],asks:[string,string][],timestamp:number}`
  - `reshapeTicker(symbol, raw): {symbol,lastPrice,priceChange24h,priceChangePercent24h,high24h,low24h,volume24h,openInterest,fundingRate,nextFundingTime}`
  - `reshapeRecentTrades(symbol, raw): {symbol,trades:{id,price,amount,side,timestamp}[]}`
  - `ok<T>(data:T)` → `{success:true,data,error:null,timestamp:number}` (the UI's `ApiResponse<T>` envelope).

- [ ] **Step 1: Write the failing test** (use captured fixtures)
```ts
// tests/compat/shape.test.ts
import { describe, it, expect } from "vitest";
import { reshapeOrderbook, reshapeTicker, ok } from "@/lib/compat/shape";
import obRaw from "./fixtures/orderbook.json";
import tkRaw from "./fixtures/ticker.json";

describe("reshape", () => {
  it("orderbook → primit shape", () => {
    const r = reshapeOrderbook("BTCUSDT", obRaw);
    expect(r.symbol).toBe("BTCUSDT");
    expect(Array.isArray(r.bids)).toBe(true);
    expect(r.bids[0]).toHaveLength(2);
    expect(typeof r.timestamp).toBe("number");
  });
  it("ticker maps last_price → lastPrice", () => {
    const r = reshapeTicker("BTCUSDT", tkRaw);
    expect(r.lastPrice).toBe(String((tkRaw as any).last_price));
  });
  it("ok() wraps in ApiResponse envelope", () => {
    expect(ok({ a: 1 })).toMatchObject({ success: true, data: { a: 1 }, error: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/compat/shape.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write `shape.ts`** (field names: confirm against fixtures; rocky-backend is snake_case)
```ts
// src/lib/compat/shape.ts
type J = Record<string, any>;
const num = (v: any, d = 0) => (v == null || v === "" ? d : Number(v));

export function ok<T>(data: T) {
  return { success: true as const, data, error: null, timestamp: Date.now() };
}

export function reshapeMarkets(raw: J[]): J[] {
  return (raw || []).map((m) => ({
    symbol: String(m.symbol ?? "").replace("-PERP", "USDT"),
    baseAsset: String(m.base ?? m.symbol ?? "").replace("-PERP", ""),
    quoteAsset: "USDT",
    minOrderSize: String(m.min_qty ?? m.min_order_size ?? "0"),
    maxLeverage: num(m.max_leverage, 10),
    makerFee: String(m.maker_fee ?? "0"),
    takerFee: String(m.taker_fee ?? "0"),
  }));
}
export function reshapeOrderbook(symbol: string, raw: J) {
  const lvl = (a: any[]): [string, string][] =>
    (a || []).map((x) => (Array.isArray(x) ? [String(x[0]), String(x[1])] : [String(x.price), String(x.qty ?? x.size)]));
  return { symbol, bids: lvl(raw.bids), asks: lvl(raw.asks), timestamp: Date.now() };
}
export function reshapeTicker(symbol: string, raw: J) {
  return {
    symbol,
    lastPrice: String(raw.last_price ?? raw.last ?? "0"),
    priceChange24h: String(raw.price_change_24h ?? "0"),
    priceChangePercent24h: String(raw.price_change_pct_24h ?? raw.change_pct ?? "0"),
    high24h: String(raw.high_24h ?? "0"),
    low24h: String(raw.low_24h ?? "0"),
    volume24h: String(raw.volume_24h ?? raw.volume ?? "0"),
    openInterest: String(raw.open_interest ?? "0"),
    fundingRate: String(raw.funding_rate ?? "0"),
    nextFundingTime: num(raw.next_funding_ts_ms, 0),
  };
}
export function reshapeRecentTrades(symbol: string, raw: J[]) {
  return {
    symbol,
    trades: (raw || []).map((t, i) => ({
      id: String(t.id ?? t.trade_id ?? i),
      price: String(t.price),
      amount: String(t.qty ?? t.amount ?? t.size),
      side: String(t.side ?? "").toLowerCase().includes("sell") ? "sell" : "buy",
      timestamp: num(t.ts_ms ?? t.timestamp, 0),
    })),
  };
}
```
**Note:** after capturing fixtures (Task 2) adjust the right-hand source keys to match real field names; the test asserting `last_price → lastPrice` guards this.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/compat/shape.test.ts` → PASS.

- [ ] **Step 5: Write the four market routes**
```ts
// src/app/api/v1/markets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { reshapeMarkets, ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function GET() {
  const r = await fetch(`${process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080"}/v1/markets`, { headers: { accept: "application/json" } });
  const raw = await r.json().catch(() => []);
  return NextResponse.json(ok(reshapeMarkets(raw)));
}
```
```ts
// src/app/api/v1/markets/[symbol]/orderbook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { toRockySymbol } from "@/lib/compat/symbol";
import { reshapeOrderbook, ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const depth = new URL(req.url).searchParams.get("depth") || "50";
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const r = await fetch(`${base}/v1/markets/${toRockySymbol(symbol)}/orderbook?depth=${depth}`, { headers: { accept: "application/json" } });
  const raw = await r.json().catch(() => ({ bids: [], asks: [] }));
  return NextResponse.json(ok(reshapeOrderbook(symbol, raw)));
}
```
```ts
// src/app/api/v1/markets/[symbol]/ticker/route.ts
import { NextRequest, NextResponse } from "next/server";
import { toRockySymbol } from "@/lib/compat/symbol";
import { reshapeTicker, ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function GET(_req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const r = await fetch(`${base}/v1/markets/${toRockySymbol(symbol)}/ticker`, { headers: { accept: "application/json" } });
  const raw = await r.json().catch(() => ({}));
  return NextResponse.json(ok(reshapeTicker(symbol, raw)));
}
```
```ts
// src/app/api/v1/markets/[symbol]/trades/route.ts
import { NextRequest, NextResponse } from "next/server";
import { toRockySymbol } from "@/lib/compat/symbol";
import { reshapeRecentTrades, ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const limit = new URL(req.url).searchParams.get("limit") || "50";
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const r = await fetch(`${base}/v1/markets/${toRockySymbol(symbol)}/recent-trades?limit=${limit}`, { headers: { accept: "application/json" } });
  const raw = await r.json().catch(() => []);
  return NextResponse.json(ok(reshapeRecentTrades(symbol, raw)));
}
```

- [ ] **Step 6: Commit**
```bash
git add src/lib/compat/shape.ts src/app/api/v1/markets tests/compat/shape.test.ts
git commit -m "feat(compat): market /api/v1 compat routes + reshapers"
```

---

## Task 4: Candles compat routes (demo)

**Files:**
- Create: `src/app/api/v1/markets/[symbol]/candles/route.ts`, `src/app/api/v1/klines/[symbol]/candles/latest/route.ts`
- Modify: `src/lib/compat/shape.ts` (add candle reshapers); Test: `tests/compat/candles.test.ts`

**Interfaces (add to shape.ts):**
- `PRIMIT_PERIOD_TO_INTERVAL: Record<string,string>` mapping `"1m"|"5m"|"15m"|"1h"|"4h"|"1d"` (passthrough) and tolerating `"1","5","15","60","240","1D"`.
- `reshapeCandles(raw): {time,open,high,low,close,volume,quote_volume?,trade_count?,is_final?}[]` — `time` in **ms**.
- `reshapeLatestCandle(symbol, period, raw): {symbol,period,candle,is_final}`.

- [ ] **Step 1: Write failing test**
```ts
// tests/compat/candles.test.ts
import { describe, it, expect } from "vitest";
import { reshapeCandles } from "@/lib/compat/shape";
import raw from "./fixtures/candles.json";
it("candles → {time(ms),open,high,low,close,volume}", () => {
  const c = reshapeCandles(raw as any);
  expect(c[0]).toHaveProperty("time");
  expect(typeof c[0].time).toBe("number");
  expect(c[0]).toMatchObject({ open: expect.anything(), close: expect.anything() });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run tests/compat/candles.test.ts`

- [ ] **Step 3: Implement reshapers + routes**
```ts
// append to src/lib/compat/shape.ts
export function reshapeCandles(raw: J[]): J[] {
  return (raw || []).map((k) => {
    // rocky-backend may return arrays [openTime,o,h,l,c,v,...] or objects.
    if (Array.isArray(k)) {
      return { time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) };
    }
    const t = Number(k.time ?? k.open_time ?? k.ts_ms ?? k.t);
    return {
      time: t < 1e12 ? t * 1000 : t, // normalize sec → ms
      open: Number(k.open ?? k.o), high: Number(k.high ?? k.h),
      low: Number(k.low ?? k.l), close: Number(k.close ?? k.c),
      volume: Number(k.volume ?? k.v ?? 0),
      is_final: k.is_final ?? k.closed ?? true,
    };
  });
}
export function reshapeLatestCandle(symbol: string, period: string, raw: J[]) {
  const arr = reshapeCandles(raw);
  const candle = arr[arr.length - 1] || null;
  return { symbol, period, candle, is_final: candle?.is_final ?? true };
}
```
```ts
// src/app/api/v1/markets/[symbol]/candles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { toRockySymbol } from "@/lib/compat/symbol";
import { reshapeCandles, ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const interval = q.get("period") || q.get("interval") || "1m";
  const limit = q.get("limit") || "500";
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const r = await fetch(`${base}/v1/markets/${toRockySymbol(symbol)}/candles?interval=${interval}&limit=${limit}`, { headers: { accept: "application/json" } });
  const raw = await r.json().catch(() => []);
  return NextResponse.json(ok({ symbol, period: interval, candles: reshapeCandles(raw) }));
}
```
```ts
// src/app/api/v1/klines/[symbol]/candles/latest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { toRockySymbol } from "@/lib/compat/symbol";
import { reshapeLatestCandle, ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const interval = new URL(req.url).searchParams.get("period") || "1m";
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const r = await fetch(`${base}/v1/markets/${toRockySymbol(symbol)}/candles?interval=${interval}&limit=2`, { headers: { accept: "application/json" } });
  const raw = await r.json().catch(() => []);
  return NextResponse.json(ok(reshapeLatestCandle(symbol, interval, raw)));
}
```

- [ ] **Step 4: Run → PASS** (`npx vitest run tests/compat/candles.test.ts`)

- [ ] **Step 5: Commit**
```bash
git add src/lib/compat/shape.ts src/app/api/v1/markets/*/candles src/app/api/v1/klines tests/compat/candles.test.ts
git commit -m "feat(compat): candles + latest-candle compat routes"
```

---

## Task 5: Private account compat routes (demo)

These forward the user's bearer to rocky-backend and reshape. Reuse `passthroughGET` semantics but reshape the body.

**Files:**
- Create: `src/app/api/v1/account/{balances,positions,orders,trades}/route.ts`
- Modify: `src/lib/compat/shape.ts` (add `reshapeBalances`, `reshapePositions`, `reshapeOrders`, `reshapeTrades`)
- Test: `tests/compat/account.test.ts`

**Interfaces (UI-expected shapes, from the survey):**
- `Balance{token,available,frozen,total}`; `Position{positionId,symbol,side,size,entryPrice,markPrice,leverage,liquidationPrice,margin,unrealizedPnl,unrealizedPnlPercent,realizedPnl}`; `Order{orderId,symbol,side,orderType,price,amount,filledAmount,leverage,status,createdAt}`; `Trade{id,symbol,side,price,amount,fee,realizedPnl,timestamp}`.

- [ ] **Step 1: Write failing test** (positions/orders snake→camel + symbol back-map)
```ts
// tests/compat/account.test.ts
import { describe, it, expect } from "vitest";
import { reshapePositions, reshapeOrders } from "@/lib/compat/shape";
it("position maps entry_price→entryPrice and BTC-PERP→BTCUSDT", () => {
  const r = reshapePositions([{ symbol: "BTC-PERP", side: "BUY", qty: "1", entry_price: "100", mark_price: "110", leverage: "5", unrealized_pnl: "10" }]);
  expect(r[0]).toMatchObject({ symbol: "BTCUSDT", entryPrice: "100", markPrice: "110", unrealizedPnl: "10" });
});
it("order maps order_id→orderId and status passthrough", () => {
  const r = reshapeOrders([{ order_id: "abc", symbol: "BTC-PERP", side: "SELL", type: "limit", price: "100", qty: "2", filled_qty: "0", status: "open", created_at_ms: 1 }]);
  expect(r[0]).toMatchObject({ orderId: "abc", symbol: "BTCUSDT", orderType: "limit", amount: "2", status: "open" });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/compat/account.test.ts`)

- [ ] **Step 3: Implement reshapers + routes**
```ts
// append to src/lib/compat/shape.ts
import { fromRockySymbol } from "./symbol";
export function reshapeBalances(raw: J[]): J[] {
  return (raw || []).map((b) => {
    const total = num(b.available) + num(b.locked ?? b.frozen);
    return { token: String(b.asset ?? b.token ?? "USDC"), available: String(b.available ?? "0"), frozen: String(b.locked ?? b.frozen ?? "0"), total: String(total) };
  });
}
export function reshapePositions(raw: J[]): J[] {
  return (raw || []).map((p) => ({
    positionId: String(p.position_id ?? p.id ?? `${p.symbol}`),
    symbol: fromRockySymbol(String(p.symbol ?? "")),
    side: String(p.side ?? "").toUpperCase().includes("SELL") ? "SELL" : "BUY",
    size: String(p.qty ?? p.size ?? "0"),
    entryPrice: String(p.entry_price ?? "0"),
    markPrice: String(p.mark_price ?? "0"),
    leverage: num(p.leverage, 1),
    liquidationPrice: String(p.liq_price ?? p.liquidation_price ?? "0"),
    margin: String(p.margin ?? p.locked_margin ?? "0"),
    unrealizedPnl: String(p.unrealized_pnl ?? "0"),
    unrealizedPnlPercent: String(p.unrealized_pnl_pct ?? "0"),
    realizedPnl: String(p.realized_pnl ?? "0"),
  }));
}
export function reshapeOrders(raw: J[]): J[] {
  return (raw || []).map((o) => ({
    orderId: String(o.order_id ?? o.id),
    symbol: fromRockySymbol(String(o.symbol ?? "")),
    side: String(o.side ?? "").toUpperCase().includes("SELL") ? "SELL" : "BUY",
    orderType: String(o.type ?? o.order_type ?? "limit"),
    price: String(o.price ?? "0"),
    amount: String(o.qty ?? o.amount ?? "0"),
    filledAmount: String(o.filled_qty ?? o.filled ?? "0"),
    leverage: num(o.leverage, 1),
    status: String(o.status ?? "open"),
    createdAt: num(o.created_at_ms ?? o.created_at, 0),
  }));
}
export function reshapeTrades(raw: J[]): J[] {
  return (raw || []).map((t, i) => ({
    id: String(t.trade_id ?? t.id ?? i),
    symbol: fromRockySymbol(String(t.symbol ?? "")),
    side: String(t.side ?? "").toUpperCase().includes("SELL") ? "SELL" : "BUY",
    price: String(t.price ?? "0"),
    amount: String(t.qty ?? t.amount ?? "0"),
    fee: String(t.fee ?? "0"),
    realizedPnl: String(t.realized_pnl ?? "0"),
    timestamp: num(t.ts_ms ?? t.timestamp, 0),
  }));
}
```
```ts
// src/app/api/v1/account/positions/route.ts  (others identical pattern w/ their reshaper+upstream)
import { NextRequest, NextResponse } from "next/server";
import { reshapePositions, ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const auth = req.headers.get("authorization") || "";
  const r = await fetch(`${base}/v1/positions`, { headers: { accept: "application/json", authorization: auth } });
  if (!r.ok) return NextResponse.json({ success: false, data: null, error: { code: String(r.status), message: await r.text() }, timestamp: Date.now() }, { status: r.status });
  return NextResponse.json(ok(reshapePositions(await r.json().catch(() => []))));
}
```
Repeat for: `balances` → upstream `/v1/account/USDC` (or `/v1/balances`) → `reshapeBalances`; `orders` → upstream `/v1/orders-me?status=open` → `reshapeOrders`; `trades` → upstream `/v1/trades` → `reshapeTrades`. Each route is the same 8 lines with its own upstream path + reshaper. Confirm exact upstream paths against Task 2 fixtures.

- [ ] **Step 4: Run → PASS** (`npx vitest run tests/compat/account.test.ts`)

- [ ] **Step 5: Commit**
```bash
git add src/lib/compat/shape.ts src/app/api/v1/account tests/compat/account.test.ts
git commit -m "feat(compat): private account compat routes (balances/positions/orders/trades)"
```

---

## Task 6: Order create / cancel / close compat routes (demo)

The UI posts `POST /orders` with `{symbol, side, orderType, price?, amount, leverage, signature, timestamp}` and expects `{order_id|orderId, status, ...}`. Rocky-backend wants `{symbol:"BTC-PERP", side, leverage, price, qty, idempotency_key, reduceOnly?}` at `/v1/orders` (the demo OrderForm payload). Map and drop the web3 `signature`.

**Files:**
- Create: `src/app/api/v1/orders/route.ts`, `src/app/api/v1/orders/[orderId]/route.ts`, `src/app/api/v1/positions/[positionId]/close/route.ts`
- Modify: `src/lib/compat/shape.ts` (`toRockyOrderBody`)
- Test: `tests/compat/order.test.ts`

- [ ] **Step 1: Write failing test**
```ts
// tests/compat/order.test.ts
import { describe, it, expect } from "vitest";
import { toRockyOrderBody } from "@/lib/compat/shape";
it("maps UI order → rocky-backend body", () => {
  const b = toRockyOrderBody({ symbol: "BTCUSDT", side: "buy", orderType: "limit", price: "100", amount: "2", leverage: 5 }, "idem-1");
  expect(b).toMatchObject({ symbol: "BTC-PERP", side: "BUY", price: "100", qty: "2", leverage: 5, idempotency_key: "idem-1" });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/compat/order.test.ts`)

- [ ] **Step 3: Implement**
```ts
// append to src/lib/compat/shape.ts
import { toRockySymbol } from "./symbol";
export function toRockyOrderBody(ui: J, idem: string): J {
  const body: J = {
    symbol: toRockySymbol(String(ui.symbol)),
    side: String(ui.side ?? "buy").toUpperCase().includes("SELL") ? "SELL" : "BUY",
    leverage: num(ui.leverage, 1),
    qty: String(ui.amount ?? ui.qty ?? "0"),
    idempotency_key: idem,
  };
  if ((ui.orderType ?? ui.type) === "market") body.type = "market";
  else { body.type = "limit"; body.price = String(ui.price ?? "0"); }
  if (ui.reduceOnly) body.reduceOnly = true;
  return body;
}
```
```ts
// src/app/api/v1/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { toRockyOrderBody, ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const auth = req.headers.get("authorization") || "";
  const ui = await req.json().catch(() => ({}));
  const idem = req.headers.get("x-idempotency-key") || `ui-${Date.now()}-${Math.round(Number(ui.price||0))}`;
  const r = await fetch(`${base}/v1/orders`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", authorization: auth }, body: JSON.stringify(toRockyOrderBody(ui, idem)) });
  const raw = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ success: false, data: null, error: { code: String(r.status), message: JSON.stringify(raw) }, timestamp: Date.now() }, { status: r.status });
  return NextResponse.json(ok({ orderId: raw.order_id ?? raw.orderId, order_id: raw.order_id ?? raw.orderId, status: raw.status ?? "open", createdAt: Date.now() }));
}
```
```ts
// src/app/api/v1/orders/[orderId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const auth = req.headers.get("authorization") || "";
  const r = await fetch(`${base}/v1/orders/${orderId}`, { method: "DELETE", headers: { accept: "application/json", authorization: auth } });
  if (!r.ok) return NextResponse.json({ success: false, data: null, error: { code: String(r.status), message: await r.text() }, timestamp: Date.now() }, { status: r.status });
  return NextResponse.json(ok({ orderId, status: "cancelled", createdAt: Date.now() }));
}
```
```ts
// src/app/api/v1/positions/[positionId]/close/route.ts
// Close = place a reduce-only market order for the position's full size.
// positionId carries the symbol (see reshapePositions). Body: { size, side } from UI.
import { NextRequest, NextResponse } from "next/server";
import { toRockySymbol } from "@/lib/compat/symbol";
import { ok } from "@/lib/compat/shape";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest, ctx: { params: Promise<{ positionId: string }> }) {
  const { positionId } = await ctx.params;
  const base = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";
  const auth = req.headers.get("authorization") || "";
  const ui = await req.json().catch(() => ({}));
  const body = {
    symbol: toRockySymbol(String(ui.symbol ?? positionId)),
    side: String(ui.side ?? "").toUpperCase().includes("BUY") ? "SELL" : "BUY", // opposite side
    type: "market", qty: String(ui.size ?? ui.qty ?? "0"),
    reduceOnly: true, idempotency_key: `close-${positionId}-${Date.now()}`,
  };
  const r = await fetch(`${base}/v1/orders`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", authorization: auth }, body: JSON.stringify(body) });
  const raw = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ success: false, data: null, error: { code: String(r.status), message: JSON.stringify(raw) }, timestamp: Date.now() }, { status: r.status });
  return NextResponse.json(ok({ orderId: raw.order_id, status: raw.status ?? "open", createdAt: Date.now() }));
}
```
**Note:** confirm the close-position UI call site (survey: `closePosition()` POST `/positions/{id}/close`) passes size+side; if it passes nothing, derive size by first GETting `/v1/positions` server-side. Adjust after wiring (Task 11/verify).

- [ ] **Step 4: Run → PASS** (`npx vitest run tests/compat/order.test.ts`)

- [ ] **Step 5: Commit**
```bash
git add src/lib/compat/shape.ts src/app/api/v1/orders src/app/api/v1/positions tests/compat/order.test.ts
git commit -m "feat(compat): order create/cancel + position close compat routes"
```

---

## Task 7: Deploy compat routes to demo :8080 + smoke

**Files:** none (deploy only).

- [ ] **Step 1: Rebase + deploy demo** (per project_mtc_exchange_deploy memory)
Run:
```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
git pull --rebase origin main
./deploy-mainnet.sh
```
Expected: build exit=0, `:8080` restarts, wallet providers smoke passes.

- [ ] **Step 2: Smoke the new compat routes via the demo origin**
Run:
```bash
for p in /api/v1/markets /api/v1/markets/BTCUSDT/orderbook /api/v1/markets/BTCUSDT/ticker "/api/v1/markets/BTCUSDT/candles?period=1m&limit=3"; do
  echo "== $p =="; curl -s "https://demo.rocky.exchange$p" | head -c 400; echo; done
```
Expected: each returns `{"success":true,"data":...}`.

- [ ] **Step 3: Commit** — n/a (deploy). Record result in progress notes.

---

## Task 8: UI deps + Vite dev proxy

**Files:**
- Modify: `package.json` (add deps), `vite.config.ts` (dev proxy)

- [ ] **Step 1: Add wallet SDK deps**
Run:
```bash
cd /Users/ubuntu/Desktop/Rocky/rocky.interface
yarn add @fivenorth/loop-sdk@^0.13.1 @console-wallet/dapp-sdk@^2.2.2
```

- [ ] **Step 2: Add dev proxy** so `import.meta.env.VITE_API_BASE_URL=/api/v1` works locally against demo
Modify `vite.config.ts` server.proxy: add
```ts
"/api": { target: "https://demo.rocky.exchange", changeOrigin: true, secure: true },
"/auth": { target: "https://demo.rocky.exchange", changeOrigin: true, secure: true },
```

- [ ] **Step 3: Commit**
```bash
git add package.json yarn.lock vite.config.ts
git commit -m "chore(ui): add Canton wallet SDKs + dev proxy to demo"
```

---

## Task 9: Port Canton wallet lib into the UI

Port the demo's wallet client verbatim, swapping `process.env.NEXT_PUBLIC_*` → `import.meta.env.VITE_*` and dropping the `rocky` (Auth0) adapter (we only expose Loop + Console).

**Files:**
- Create: `src/shared/lib/canton-wallet/{types,session,loop,console,index}.ts`
- Test: `tests/canton-wallet/session.test.ts`

**Interfaces:**
- Produces: `connectLoopWallet()`, `connectConsoleWallet()`, `createExchangeSession(connection, signMessage)`, `getExchangeSessionToken()`, `exchangeSessionHeaders()`, `persistExchangeSession()`, types `WalletConnectionResult`, `WalletProviderId`.

- [ ] **Step 1: Copy the four source files** from `…/mtc-exchange/src/lib/wallet/{types.ts,session.ts,loop.ts,console.ts}` into `src/shared/lib/canton-wallet/`. In `console.ts`, change `process.env.NEXT_PUBLIC_CONSOLE_WALLET_TARGET` → `import.meta.env.VITE_CONSOLE_WALLET_TARGET`. In `session.ts`, the fetch URLs (`/api/wallet/challenge|verify`) stay the same (same-origin via nginx/proxy). Create `index.ts` re-exporting `connectLoopWallet, loopWalletAdapter, connectConsoleWallet, consoleWalletAdapter` and the session helpers (omit `rocky`).

- [ ] **Step 2: Write a unit test for session persistence**
```ts
// tests/canton-wallet/session.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { persistExchangeSession, getExchangeSessionToken, exchangeSessionHeaders } from "@/shared/lib/canton-wallet/session";
beforeEach(() => localStorage.clear());
it("persists session token and emits bearer header", () => {
  persistExchangeSession({ user_id: "u", binding_id: "b", provider: "loop", party_id: "p", session_token: "T", expires_at: "" } as any, { displayName: "x" } as any);
  expect(getExchangeSessionToken()).toBe("T");
  expect(exchangeSessionHeaders()).toMatchObject({ Authorization: "Bearer T" });
});
```
(Use jsdom env — `vitest.config.ts` in the UI repo already sets jsdom; confirm `environment: "jsdom"`.)

- [ ] **Step 3: Run → PASS**
Run: `npx vitest run tests/canton-wallet/session.test.ts`

- [ ] **Step 4: Commit**
```bash
git add src/shared/lib/canton-wallet tests/canton-wallet
git commit -m "feat(ui): port Loop/Console Canton wallet client from demo"
```

---

## Task 10: `useCantonWallet` hook + connect UI

**Files:**
- Create: `src/shared/lib/canton-wallet/useCantonWallet.ts`, `src/shared/components/AppHeader/CantonWalletButton.tsx`
- Modify: `src/shared/components/AppHeader/AppHeaderUser.tsx`

**Interfaces:**
- `useCantonWallet()` → `{ connected: boolean, party: string|null, username: string|null, connect(provider: "loop"|"console"): Promise<void>, disconnect(): void, connecting: boolean, error: string|null }`. On connect: call adapter `connect()` → `createExchangeSession()` → also push the session token into the CEX client token store (Task 11 wires `setStoredToken`). Reads initial state from localStorage (`rocky_exchange_session`, `mtc_party`, `mtc_username`).

- [ ] **Step 1: Write the hook**
```tsx
// src/shared/lib/canton-wallet/useCantonWallet.ts
import { useCallback, useState } from "react";
import { connectLoopWallet, connectConsoleWallet } from "./index";
import { createExchangeSession, getExchangeSessionToken } from "./session";

export function useCantonWallet() {
  const [connected, setConnected] = useState(() => !!getExchangeSessionToken());
  const [party, setParty] = useState<string | null>(() => localStorage.getItem("mtc_party"));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("mtc_username"));
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (provider: "loop" | "console") => {
    setConnecting(true); setError(null);
    try {
      const w = provider === "loop" ? await connectLoopWallet() : await connectConsoleWallet();
      await createExchangeSession(w.connection, w.signMessage);
      setConnected(true);
      setParty(localStorage.getItem("mtc_party"));
      setUsername(localStorage.getItem("mtc_username"));
    } catch (e: any) { setError(e?.message || "connect failed"); throw e; }
    finally { setConnecting(false); }
  }, []);

  const disconnect = useCallback(() => {
    ["rocky_exchange_session","rocky_user_id","rocky_binding_id","mtc_party","mtc_username","mtc_email","mtc_login_method"].forEach((k) => localStorage.removeItem(k));
    setConnected(false); setParty(null); setUsername(null);
  }, []);

  return { connected, party, username, connect, disconnect, connecting, error };
}
```

- [ ] **Step 2: Build the connect control** (matches existing `ConnectWalletButton` styling; shows a small Loop/Console chooser)
```tsx
// src/shared/components/AppHeader/CantonWalletButton.tsx
import { useState } from "react";
import { ConnectWalletButton } from "../ConnectWalletButton/ConnectWalletButton";
import { useCantonWallet } from "../../lib/canton-wallet/useCantonWallet";

export function CantonWalletButton() {
  const { connected, username, party, connect, disconnect, connecting } = useCantonWallet();
  const [open, setOpen] = useState(false);
  if (connected) {
    return <ConnectWalletButton onClick={disconnect}>{username || `${party?.slice(0,8)}…`}</ConnectWalletButton>;
  }
  return (
    <div style={{ position: "relative" }}>
      <ConnectWalletButton onClick={() => setOpen((v) => !v)}>{connecting ? "Connecting…" : "Connect Wallet"}</ConnectWalletButton>
      {open && (
        <div className="canton-wallet-menu">
          <button disabled={connecting} onClick={() => connect("loop").then(() => setOpen(false))}>Loop Wallet</button>
          <button disabled={connecting} onClick={() => connect("console").then(() => setOpen(false))}>Console Wallet</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Swap it into `AppHeaderUser.tsx`** — replace the RainbowKit `useConnectModal`/`openConnectModal` + `useWallet()` connect branch with `<CantonWalletButton />`. Remove the `useConnectModal` import and the `handleConnectWallet` that calls `openConnectModal()`.

- [ ] **Step 4: Typecheck**
Run: `cd /Users/ubuntu/Desktop/Rocky/rocky.interface && npx tsc --noEmit`
Expected: no errors in the touched files (pre-existing unrelated errors, if any, unchanged).

- [ ] **Step 5: Commit**
```bash
git add src/shared/lib/canton-wallet/useCantonWallet.ts src/shared/components/AppHeader/CantonWalletButton.tsx src/shared/components/AppHeader/AppHeaderUser.tsx
git commit -m "feat(ui): Loop/Console connect control in header (replaces RainbowKit)"
```

---

## Task 11: Remove wagmi/RainbowKit provider + wire session token into the CEX client

**Files:**
- Modify: `src/app/App.tsx` (drop `WalletProvider`/WagmiProvider wrapping, keep `QueryClientProvider`), `src/modules/cex/lib/api/custom/client.ts` (token source), `src/modules/cex/lib/api/custom/useZtdxAuth.ts` (use Canton session), and any `useWallet()` callers that block on `isConnected`.

**Interfaces:**
- The CEX client's `getStoredToken()` must return `localStorage.rocky_exchange_session` (the Canton session). "Authenticated" = token present.

- [ ] **Step 1: Point the CEX token store at the Canton session.** In `src/modules/cex/lib/api/custom/client.ts`, change `getStoredToken()` to read `rocky_exchange_session` (fallback to its old key). Remove `setStoredToken`/web3 `login` usage paths, or have `setStoredToken` write `rocky_exchange_session`.

- [ ] **Step 2: Replace `useZtdxAuth` web3 login** with a thin wrapper over `useCantonWallet` exposing the same `{ isAuthenticated, login, logout }` surface its consumers expect (so call sites in `useEarn.ts`, `ReferralDashboard.tsx`, etc. keep compiling). `isAuthenticated = !!getExchangeSessionToken()`.

- [ ] **Step 3: Drop the Wagmi/RainbowKit provider** in `src/app/App.tsx`: remove `<WalletProvider>` wrapper (line ~71) and its import. Keep `QueryClientProvider`. Delete `src/shared/lib/wallets/WalletProvider.tsx` and `rainbowKitConfig.ts` only after confirming no remaining imports (`grep -rn "WalletProvider\|rainbowKitConfig\|useConnectModal\|wagmi" src`). Replace remaining `useWallet()` reads of `account`/`active` with `useCantonWallet()` (`party`/`connected`).

- [ ] **Step 4: Typecheck + unit tests**
Run: `npx tsc --noEmit && npx vitest run`
Expected: passes (resolve any straggler wagmi imports surfaced here).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "refactor(ui): remove wagmi/RainbowKit; CEX client uses Canton session token"
```

---

## Task 12: Point UI data layer at same-origin compat routes

**Files:**
- Modify: `src/shared/config/backend.ts`, `src/shared/lib/sdk/api/rest/client.ts`, `.env.local`

- [ ] **Step 1: Same-origin base URLs.** In `backend.ts`, set the X10000 API domain to `""` (same origin) so `getServerBaseUrl()` returns `""` and the CEX client hits `/api/v1/*` on app.rocky.exchange. Remove `api.primit.xyz` defaults. In `rest/client.ts`, default `baseUrl` to `/api/v1`.

- [ ] **Step 2: `.env.local`** — set:
```
VITE_API_BASE_URL=/api/v1
VITE_PROXY_API_URL=
VITE_CONSOLE_WALLET_TARGET=combined
```
(WS vars unused after Task 13.)

- [ ] **Step 3: Typecheck**
Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**
```bash
git add src/shared/config/backend.ts src/shared/lib/sdk/api/rest/client.ts .env.local
git commit -m "feat(ui): point data layer at same-origin /api/v1 compat routes"
```

---

## Task 13: Chart datafeed → polling (remove WS)

**Files:**
- Modify: `src/modules/dex/domain/tradingview/X10000KlineDataFeed.ts`
- Remove/stub: `src/modules/cex/lib/api/custom/websocket.ts`, `src/shared/lib/sdk/api/websocket/client.ts`, `src/modules/dex/lib/sdk/api/websocket/client.ts`

- [ ] **Step 1: Replace `subscribeBars` WS subscription with polling.** In `X10000KlineDataFeed.ts`, instead of subscribing to `kline:{sym}:{period}`, start a `setInterval` (cadence by resolution: 1m→2s, 5m→5s, ≥15m→15s) calling `getLatestCandle(chainId, symbol, { period })` and invoking `onTick(bar)` when the bar advances or its close changes. Track the interval in `subscriptions[listenerGuid]`; clear it in `unsubscribeBars`.

- [ ] **Step 2: Remove WS imports.** Delete the WS client files and any imports (`grep -rn "websocket/client\|custom/websocket\|new WebSocket" src`). Ensure nothing constructs `wss://api.primit.xyz`.

- [ ] **Step 3: Typecheck + run**
Run: `npx tsc --noEmit && npx vitest run`

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat(ui): chart live updates via candle polling; drop primit WS"
```

---

## Task 14: Auth0 host-derived redirect (demo) + whitelist

**Files (demo):**
- Modify: `deploy-mainnet.sh` (remove the `upsert_env AUTH0_WALLET_REDIRECT_URI ...` line); on the server, unset it from `~/mtc-exchange-mainnet/.env.local`.

- [ ] **Step 1: Remove the hardcode in the deploy script.** In `…/mtc-exchange/deploy-mainnet.sh`, delete the line `upsert_env AUTH0_WALLET_REDIRECT_URI https://demo.rocky.exchange/api/wallet/preapproval/callback`. (With it unset, `walletRedirectUri(origin)` derives `${origin}/api/wallet/preapproval/callback` from `x-forwarded-host` — correct for both demo and app domains.)

- [ ] **Step 2: Unset on the server + restart**
Run:
```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "cd ~/mtc-exchange-mainnet && sed -i '/^AUTH0_WALLET_REDIRECT_URI=/d' .env.local && fuser -k -TERM 8080/tcp; sleep 3; setsid bash -c 'npm exec -- next start -H 0.0.0.0 -p 8080 > mainnet.log 2>&1 < /dev/null &'"
```
Verify `:8080` pid changed + `curl -s localhost:8080/api/wallet/providers` ok.

- [ ] **Step 3: USER ACTION — Auth0 dashboard.** Add `https://app.rocky.exchange/api/wallet/preapproval/callback` to the Auth0 app (client `4UQdTwvEetobvugcypZX5mV3YgnSxjal`) Allowed Callback URLs. Confirm before relying on app-domain wallet login.

- [ ] **Step 4: Commit (demo)**
```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
git add deploy-mainnet.sh
git commit -m "fix(demo): derive wallet preapproval redirect from request host (multi-domain)"
```

---

## Task 15: nginx — serve UI + proxy /api,/auth on app.rocky.exchange

**Files:** server `/etc/nginx/conf.d/rocky.conf` (back up first).

- [ ] **Step 1: Update the server block** to keep the static SPA root AND proxy API to the demo app:
```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/app.rocky.exchange/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.rocky.exchange/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    server_name app.rocky.exchange;
    root /var/www/rocky;
    index index.html;

    location /api/ { proxy_pass http://127.0.0.1:8080; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Forwarded-Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_read_timeout 60s; }
    location /auth/ { proxy_pass http://127.0.0.1:8080; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Forwarded-Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
    location /fapi/ { proxy_pass http://127.0.0.1:18080; proxy_http_version 1.1; proxy_set_header Host $host; }

    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location / { try_files $uri $uri/ /index.html; }
    gzip on; gzip_types text/plain text/css application/json application/javascript image/svg+xml; gzip_min_length 256;
}
```

- [ ] **Step 2: Apply**
Run:
```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "sudo cp /etc/nginx/conf.d/rocky.conf /etc/nginx/conf.d/rocky.conf.bak.$(date +%s) && sudo tee /etc/nginx/conf.d/rocky.conf >/dev/null <<'CONF'
<block above>
CONF
sudo nginx -t && sudo systemctl reload nginx"
```
Expected: `nginx -t` ok; reload succeeds.

- [ ] **Step 3: Smoke** (still serving old static UI, but API proxy live)
Run: `curl -s https://app.rocky.exchange/api/v1/markets | head -c 200`
Expected: `{"success":true,...}`.

---

## Task 16: Fix deploy.sh target + build + deploy UI

**Files (UI):** `deploy.sh`.

- [ ] **Step 1: Repoint `deploy.sh`** — `SERVER="ubuntu@13.231.118.218"`, `SSH_KEY="$HOME/.ssh/rocky-canton-sandbox.pem"`, `DEPLOY_DIR="/var/www/rocky"`. (Build output dir is `build` — already correct.)

- [ ] **Step 2: Build + deploy** (build runs locally via Vite — pure JS, allowed; or build on EC2 if toolchain differs)
Run:
```bash
cd /Users/ubuntu/Desktop/Rocky/rocky.interface && ./deploy.sh
```
Expected: build produces `build/index.html`; rsync to `13.231.118.218:/var/www/rocky`; verify step prints "Deployment verified".

- [ ] **Step 3: Commit**
```bash
git add deploy.sh
git commit -m "chore(ui): deploy to 13.231.118.218:/var/www/rocky (shared host)"
```

---

## Task 17: End-to-end verification

- [ ] **Step 1: Load app** — `https://app.rocky.exchange` shows the original UI (not the demo Next.js page). No MetaMask anywhere; top-right shows "Connect Wallet" → Loop / Console.
- [ ] **Step 2: Market data live** — chart renders historical bars and updates by polling; orderbook + recent trades populate for BTC.
- [ ] **Step 3: Login** — connect Loop (or Console) wallet; OAuth/popup completes on app.rocky.exchange (Task 14 callback whitelisted); header shows the party/username; `localStorage.rocky_exchange_session` set.
- [ ] **Step 4: Real balance** — account/balances panel shows the logged-in account's real USDC.
- [ ] **Step 5: Trade** — place a small limit order → appears in open orders; cancel it → disappears; place + close a position → position opens then closes; values match demo.rocky.exchange for the same account.
- [ ] **Step 6: Regression** — demo.rocky.exchange still fully works (shared `:8080`/`:18080`); its wallet login still completes (host-derived redirect).
- [ ] **Step 7: Record** outcomes in `progress.md`; update the project memory `project_mtc_exchange_deploy.md` with the final app.rocky.exchange topology.

---

## Self-Review

- **Spec coverage:** scope (market data ✓ T3/T4/T13; auth Loop/Console ✓ T9/T10/T14; trading ✓ T5/T6/T11; real balances ✓ T5/T17). Approach A compat-route refinement ✓ T3–T7. Remove MetaMask ✓ T10/T11. Same-origin ✓ T12/T15. Auth0 ✓ T14. Deploy host fix ✓ T16. Polling ✓ T13. Symbol map ✓ T1. Risks: shape drift mitigated by fixtures+tests (T2/T3/T5); Auth0 external action called out (T14 Step 3).
- **Placeholders:** none unresolved; the two "confirm against fixtures/call-site" notes (T3 keys, T6 close payload) are guarded by tests and the Task 2 capture, not blockers.
- **Type consistency:** reshapers' output field names match the survey's UI shapes (`entryPrice`, `orderId`, `lastPrice`, `{token,available,frozen,total}`); `toRockySymbol/fromRockySymbol` names consistent across tasks; `ok()` envelope matches `ApiResponse<T>`.

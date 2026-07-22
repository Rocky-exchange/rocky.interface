# Spot ZTDX Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/spot/CBTC-USDA` as a ZTDX-style three-column spot workspace that uses the `/trade` theme and exposes every capability supported by the current backend.

**Architecture:** Centralize the public USDA identity and current USDCx API identity in a `SpotMarket` model, resolve it once at the route, and pass the resolved market into isolated chart, order-book, form, and account/order panels. Keep the existing polling and signed-request layers; add only client-side view filtering, account-derived percentage sizing, and disabled shells for backend capabilities that do not exist yet.

**Tech Stack:** React 18, TypeScript 5, React Router 5, SCSS modules, TradingView Charting Library, Vitest 2, Testing Library 11.

---

## File Structure

### New files

- `src/modules/spot/model/spotMarkets.ts` — single source of truth for USDA route/display symbols and current USDCx API symbols.
- `src/modules/spot/model/spotMarkets.spec.ts` — route resolution, API mapping, asset-label mapping, and safe fallback tests.
- `src/modules/spot/hooks/useSpotAccount.ts` — reusable wallet-gated account polling hook.
- `src/modules/spot/components/OrderForm/orderFormMath.ts` — pure percentage, total, and fee calculations.
- `src/modules/spot/components/OrderForm/orderFormMath.spec.ts` — boundary tests for order calculations.
- `src/modules/spot/pages/SpotTradePage.spec.tsx` — route-market propagation and workspace-region tests.
- `src/modules/lighter/components/TopNav/TopNav.spec.tsx` — USDA Spot navigation-link test.

### Modified files

- `src/app/MainRoutes.tsx` — keep the parameterized spot route and update USDA documentation.
- `src/modules/lighter/components/TopNav/TopNav.tsx` — navigate Spot to `/spot/CBTC-USDA`.
- `src/modules/spot/api/spotClient.ts` and `.spec.ts` — keep transport API-only and move market metadata to the model.
- `src/modules/spot/pages/SpotTradePage.tsx` and `.module.scss` — resolve `SpotMarket` and implement the ZTDX workspace grid.
- `src/modules/spot/components/SymbolBar/*` — hierarchical ticker header and USDA market selector.
- `src/modules/spot/components/Chart/SpotChart.tsx`, `.module.scss`, `SpotDataFeed.ts`, and `.spec.ts` — USDA chart identity with unchanged BTCUSDT/ETHUSDT chart sourcing.
- `src/modules/spot/components/OrderBook/*` — view modes, USDA labels, and ZTDX book hierarchy.
- `src/modules/spot/components/OrderForm/*` — complete limit form, account balance, slider, total, and fee UI.
- `src/modules/spot/components/Accounts/*` — embedded Assets-tab presentation and USDA labels.
- `src/modules/spot/components/BottomTabs/*` — functional Assets/Open Orders tabs plus disabled history tabs.

## Task 1: Centralize USDA Market Identity

**Files:**
- Create: `src/modules/spot/model/spotMarkets.ts`
- Create: `src/modules/spot/model/spotMarkets.spec.ts`

- [ ] **Step 1: Write the failing market-model tests**

```ts
import { describe, expect, it } from "vitest";

import { SPOT_MARKETS, resolveSpotMarket, toSpotDisplayAsset } from "./spotMarkets";

describe("spot market identity", () => {
  it("publishes USDA routes while preserving current API symbols", () => {
    expect(SPOT_MARKETS.map(({ routeSymbol, apiSymbol }) => ({ routeSymbol, apiSymbol }))).toEqual([
      { routeSymbol: "CBTC-USDA", apiSymbol: "CBTC-USDCX" },
      { routeSymbol: "CETH-USDA", apiSymbol: "CETH-USDCX" },
    ]);
  });

  it("resolves route symbols case-insensitively and falls back safely", () => {
    expect(resolveSpotMarket("cbtc-usda").apiSymbol).toBe("CBTC-USDCX");
    expect(resolveSpotMarket("unknown").routeSymbol).toBe("CBTC-USDA");
    expect(resolveSpotMarket(undefined).routeSymbol).toBe("CBTC-USDA");
  });

  it("maps backend quote labels to USDA without renaming other assets", () => {
    expect(toSpotDisplayAsset("USDCx")).toBe("USDA");
    expect(toSpotDisplayAsset("USDCX")).toBe("USDA");
    expect(toSpotDisplayAsset("CBTC")).toBe("CBTC");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module is the failure**

Run: `yarn test:ci src/modules/spot/model/spotMarkets.spec.ts`

Expected: FAIL because `./spotMarkets` does not exist.

- [ ] **Step 3: Implement the market model**

```ts
export type SpotMarket = {
  routeSymbol: string;
  apiSymbol: string;
  displayBase: string;
  displayQuote: "USDA";
  apiBase: string;
  apiQuote: "USDCx";
  chartSymbol: "BTCUSDT" | "ETHUSDT";
};

export const SPOT_MARKETS: readonly SpotMarket[] = [
  {
    routeSymbol: "CBTC-USDA",
    apiSymbol: "CBTC-USDCX",
    displayBase: "CBTC",
    displayQuote: "USDA",
    apiBase: "CBTC",
    apiQuote: "USDCx",
    chartSymbol: "BTCUSDT",
  },
  {
    routeSymbol: "CETH-USDA",
    apiSymbol: "CETH-USDCX",
    displayBase: "cETH",
    displayQuote: "USDA",
    apiBase: "cETH",
    apiQuote: "USDCx",
    chartSymbol: "ETHUSDT",
  },
] as const;

export function resolveSpotMarket(routeSymbol?: string): SpotMarket {
  const normalized = routeSymbol?.trim().toUpperCase();
  return SPOT_MARKETS.find((market) => market.routeSymbol === normalized) ?? SPOT_MARKETS[0];
}

export function toSpotDisplayAsset(asset: string): string {
  return asset.trim().toUpperCase() === "USDCX" ? "USDA" : asset;
}
```

Keep the existing transport-layer market export untouched in this first commit
so current UI imports remain executable. Task 3 migrates the selector to the
model and removes the legacy export and assertion in the same commit.

- [ ] **Step 4: Run model and transport tests**

Run: `yarn test:ci src/modules/spot/model/spotMarkets.spec.ts`

Expected: PASS with three market-identity tests.

- [ ] **Step 5: Commit the identity layer**

```bash
git add src/modules/spot/model/spotMarkets.ts src/modules/spot/model/spotMarkets.spec.ts
git commit -m "feat(spot): add USDA market identity mapping"
```

## Task 2: Preserve USDA Identity Through TradingView

**Files:**
- Modify: `src/modules/spot/components/Chart/SpotDataFeed.spec.ts`
- Modify: `src/modules/spot/components/Chart/SpotDataFeed.ts`

- [ ] **Step 1: Change chart tests to require USDA presentation and chart-symbol mapping**

```ts
it("presents USDA while requesting the mapped Binance chart symbol", async () => {
  const { urls } = stubFetch([]);
  const feed = new SpotDataFeed();
  const info = await new Promise<LibrarySymbolInfo>((resolve) =>
    feed.resolveSymbol("CBTC-USDA", resolve as never)
  );

  expect(info.name).toBe("CBTC-USDA");
  expect(info.description).toBe("CBTC/USDA");
  expect(info.currency_code).toBe("USDA");

  await new Promise<void>((resolve) => {
    feed.getBars(info, "5" as ResolutionString, period(0, 1_000_000, 200), () => resolve(), () => resolve());
  });
  expect(urls[0]).toContain("symbol=BTCUSDT");
});
```

Update the existing default `symbolInfo()` helper to use `CBTC-USDA`.

- [ ] **Step 2: Run the chart test and verify it fails on USDCX assumptions**

Run: `yarn test:ci src/modules/spot/components/Chart/SpotDataFeed.spec.ts`

Expected: FAIL because the datafeed does not yet resolve USDA to BTCUSDT.

- [ ] **Step 3: Resolve chart symbols through the market model**

Import `resolveSpotMarket` in `SpotDataFeed.ts` and replace the hard-coded API-symbol map:

```ts
function toBinanceSymbol(routeSymbol: string): string {
  const market = resolveSpotMarket(routeSymbol);
  return market.routeSymbol === routeSymbol.trim().toUpperCase()
    ? market.chartSymbol
    : routeSymbol.replace("-", "");
}
```

In `resolveSymbol`, use the resolved market's display fields for `name`,
`ticker`, `description`, and `currency_code`. Keep `SpotChart`'s current
`symbol` prop in this commit; Task 3 migrates all page-child props together.

- [ ] **Step 4: Run chart tests**

Run: `yarn test:ci src/modules/spot/components/Chart/SpotDataFeed.spec.ts`

Expected: PASS, including polling and historical bar tests.

- [ ] **Step 5: Commit chart identity**

```bash
git add src/modules/spot/components/Chart/SpotDataFeed.ts src/modules/spot/components/Chart/SpotDataFeed.spec.ts
git commit -m "feat(spot): present USDA in TradingView"
```

## Task 3: Build the ZTDX Workspace Shell and Market Header

**Files:**
- Create: `src/modules/spot/pages/SpotTradePage.spec.tsx`
- Create: `src/modules/lighter/components/TopNav/TopNav.spec.tsx`
- Modify: `src/modules/spot/pages/SpotTradePage.tsx`
- Modify: `src/modules/spot/pages/SpotTradePage.module.scss`
- Modify: `src/modules/spot/components/SymbolBar/SymbolBar.tsx`
- Modify: `src/modules/spot/components/SymbolBar/SymbolBar.module.scss`
- Modify: `src/modules/spot/components/SymbolBar/MarketDropdown.tsx`
- Modify: `src/modules/spot/components/SymbolBar/MarketDropdown.module.scss`
- Modify: `src/modules/spot/components/Chart/SpotChart.module.scss`
- Modify: `src/modules/spot/components/Chart/SpotChart.tsx`
- Modify: `src/modules/spot/api/spotClient.ts`
- Modify: `src/modules/spot/api/spotClient.spec.ts`
- Modify: `src/modules/lighter/components/TopNav/TopNav.tsx`
- Modify: `src/app/MainRoutes.tsx`

- [ ] **Step 1: Write a page test for route resolution and region order**

Mock `TopNav`, `useSpotSession`, and the five spot panels so each panel renders
its name and received market fields. Render the real page at
`/spot/CBTC-USDA`, then assert:

```ts
expect(screen.getByTestId("spot-market-workspace")).not.toBeNull();
expect(screen.getByTestId("spot-orderbook-region")).not.toBeNull();
expect(screen.getByTestId("spot-orderform-region")).not.toBeNull();
expect(screen.getAllByText("CBTC-USDA").length).toBeGreaterThan(0);
expect(screen.queryByTestId("spot-standalone-account")).toBeNull();
```

Create `TopNav.spec.tsx`, mock `BonusBadge`, `CantonFundsModal`,
`useCantonSession`, and `useLingui`, render `TopNav` inside a `MemoryRouter`,
and require the USDA destination:

```ts
const spotLink = screen.getByRole("link", { name: "Spot" });
expect(spotLink.getAttribute("href")).toBe("/spot/CBTC-USDA");
```

- [ ] **Step 2: Run the page test and verify the old layout fails**

Run: `yarn test:ci src/modules/spot/pages/SpotTradePage.spec.tsx`

Expected: FAIL because the new region test IDs and `SpotMarket` propagation do not exist.

- [ ] **Step 3: Implement the route coordinator and workspace regions**

Resolve the market once:

```tsx
const params = useParams<{ symbol?: string }>();
const market = resolveSpotMarket(params.symbol);

return (
  <div className={`lighter-root ${styles.page}`}>
    <div className={styles.topnav}><TopNav /></div>
    <main className={styles.workspace}>
      <section className={styles.marketWorkspace} data-testid="spot-market-workspace">
        <SpotSymbolBar market={market} />
        <div className={styles.chartPanel}>
          <div className={styles.chartTabs} role="tablist" aria-label="Market view">
            <button type="button" role="tab" aria-selected="true" className={styles.chartTabActive}>Chart</button>
            <button type="button" role="tab" aria-selected="false" disabled className={styles.chartTab}>Market Info</button>
          </div>
          <div className={styles.chart}><SpotChart market={market} /></div>
        </div>
        <SpotBottomTabs market={market} />
      </section>
      <aside className={styles.orderbook} data-testid="spot-orderbook-region">
        <SpotOrderBookPanel market={market} />
      </aside>
      <aside className={styles.orderform} data-testid="spot-orderform-region">
        <SpotOrderForm market={market} />
      </aside>
    </main>
  </div>
);
```

Update child prop types from `symbol: string` to `market: SpotMarket`; continue
passing `market.apiSymbol` to every existing backend call. Remove the separate
`SpotAccountsPanel` import and lower-right page region.

Mechanically update existing OrderBook, OrderForm, and BottomTabs test renders
to pass `market={resolveSpotMarket("CBTC-USDA")}` before adding their later
behavior assertions. This keeps every intermediate commit executable.

- [ ] **Step 4: Implement the desktop grid and responsive stacking**

Use the `/trade` structural variables:

```scss
.page {
  --spot-side-col: var(--ltr-side-col, 321px);
  height: 100vh;
  padding: 4px;
  display: grid;
  grid-template-rows: var(--ltr-topnav-h, 56px) minmax(0, 1fr);
  gap: 4px;
  overflow: hidden;
  background: var(--ltr-bg-root);
}

.workspace {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--spot-side-col) var(--spot-side-col);
  gap: 4px;
}

.marketWorkspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 64px minmax(0, 1fr) var(--ltr-bottom-h, 220px);
  gap: 4px;
}
```

At `max-width: 1024px`, change `.page` to document flow and `.workspace` to a
vertical flex layout with explicit chart, order-book, form, and bottom-panel
minimum heights. At `max-width: 640px`, reduce gaps to `2px` and constrain all
regions to `calc(100dvw - 4px)`.

- [ ] **Step 5: Implement the USDA market header and selector**

Make `SpotSymbolBar` use `market.apiSymbol` for ticker requests and
`market.displayBase`/`market.displayQuote` for text. The header must render a
leading market selector, dominant last price, and labeled 24h statistic cells.
Make `SpotMarketDropdown` iterate over the model `SPOT_MARKETS`, request each
entry's `apiSymbol`, and navigate to `/spot/${market.routeSymbol}`.

Remove the legacy `SPOT_MARKETS` export from `spotClient.ts` after the selector
is migrated. Remove its old transport-suite list assertion because
`spotMarkets.spec.ts` now owns that contract.

Update `TopNav` to `/spot/CBTC-USDA` and update the route comment in
`MainRoutes.tsx` to describe USDA public routes with USDCx API mapping.

- [ ] **Step 6: Run page, route, and affected component tests**

Run: `yarn test:ci src/modules/spot src/modules/lighter/components/TopNav/TopNav.spec.tsx src/app/MainRoutes.spec.tsx`

Expected: PASS with USDA props and new workspace regions.

- [ ] **Step 7: Commit the workspace shell**

```bash
git add src/app/MainRoutes.tsx src/modules/lighter/components/TopNav src/modules/spot/api/spotClient.ts src/modules/spot/api/spotClient.spec.ts src/modules/spot/pages src/modules/spot/components
git commit -m "feat(spot): build ZTDX workspace shell"
```

## Task 4: Add Functional Order-Book View Modes

**Files:**
- Modify: `src/modules/spot/components/OrderBook/OrderBook.spec.tsx`
- Modify: `src/modules/spot/components/OrderBook/OrderBook.tsx`
- Modify: `src/modules/spot/components/OrderBook/OrderBook.module.scss`

- [ ] **Step 1: Write failing behavior tests for labels and view filters**

After mocking at least one unique ask price and bid price, assert:

```ts
expect(await screen.findByText("Price (USDA)")).not.toBeNull();
expect(screen.getByText("Amount (CBTC)")).not.toBeNull();

fireEvent.click(screen.getByRole("button", { name: "Show asks only" }));
expect(screen.getByText("65,010.00")).not.toBeNull();
expect(screen.queryByText("64,990.00")).toBeNull();

fireEvent.click(screen.getByRole("button", { name: "Show bids only" }));
expect(screen.queryByText("65,010.00")).toBeNull();
expect(screen.getByText("64,990.00")).not.toBeNull();
```

Update all renders to pass `market={resolveSpotMarket("CBTC-USDA")}`.

- [ ] **Step 2: Run the order-book suite and verify missing controls fail**

Run: `yarn test:ci src/modules/spot/components/OrderBook/OrderBook.spec.tsx`

Expected: FAIL because USDA labels and view-mode buttons are absent.

- [ ] **Step 3: Implement client-side modes and the ZTDX header**

Add `type BookView = "all" | "asks" | "bids"` and state defaulting to `all`.
Render three icon buttons with visible selected state and these accessible
labels: `Show full order book`, `Show asks only`, `Show bids only`.

Keep one fetched `DepthResp`. Render ask rows only for `all`/`asks`, bid rows
only for `all`/`bids`, and keep the mid-price/spread row in every mode. Rename
the tabs to `Order Book` and `Recent Trades`. Derive column labels from the
market display fields while every request uses `market.apiSymbol`.

- [ ] **Step 4: Style depth controls and preserve row density**

Use the existing token palette. Keep depth rows at `var(--ltr-row-h)`, use
absolute right-aligned depth bars, give the current mode a border and tokenized
surface, and allow only the row collections to scroll.

- [ ] **Step 5: Run the order-book suite**

Run: `yarn test:ci src/modules/spot/components/OrderBook/OrderBook.spec.tsx`

Expected: PASS for empty, depth, spread, trades, labels, and three view modes.

- [ ] **Step 6: Commit the order book**

```bash
git add src/modules/spot/components/OrderBook
git commit -m "feat(spot): add ZTDX order book controls"
```

## Task 5: Add Reusable Account Polling and Safe Order Math

**Files:**
- Create: `src/modules/spot/hooks/useSpotAccount.ts`
- Create: `src/modules/spot/components/OrderForm/orderFormMath.ts`
- Create: `src/modules/spot/components/OrderForm/orderFormMath.spec.ts`

- [ ] **Step 1: Write failing pure calculation tests**

```ts
import { describe, expect, it } from "vitest";
import { calculateOrderSummary, quantityForPercent } from "./orderFormMath";

describe("quantityForPercent", () => {
  it("sizes buys from quote balance and entered price", () => {
    expect(quantityForPercent({ side: "BUY", percent: 25, price: "50000", baseFree: "0.4", quoteFree: "1000" }))
      .toBe("0.005");
  });

  it("sizes sells directly from base balance", () => {
    expect(quantityForPercent({ side: "SELL", percent: 25, price: "", baseFree: "0.4", quoteFree: "1000" }))
      .toBe("0.1");
  });

  it("returns an empty quantity for invalid buy prices", () => {
    expect(quantityForPercent({ side: "BUY", percent: 100, price: "0", baseFree: "0", quoteFree: "1000" }))
      .toBe("");
  });
});

describe("calculateOrderSummary", () => {
  it("computes total and the 0.1 percent fee cap", () => {
    expect(calculateOrderSummary("50000", "0.01")).toEqual({ total: "500", fee: "0.5" });
  });
  it("never returns NaN or Infinity", () => {
    expect(calculateOrderSummary("bad", "0.01")).toEqual({ total: "", fee: "" });
  });
});
```

- [ ] **Step 2: Run the math tests and verify the missing module fails**

Run: `yarn test:ci src/modules/spot/components/OrderForm/orderFormMath.spec.ts`

Expected: FAIL because `orderFormMath.ts` does not exist.

- [ ] **Step 3: Implement deterministic calculation helpers**

Parse only finite positive values. Clamp percentage to `[0, 100]`. Format
calculated input values to at most eight decimals and strip trailing zeroes.
Use `0.001` as the fee-cap multiplier. Return empty strings when an input is
invalid or when a buy percentage cannot be converted without a positive price.

- [ ] **Step 4: Implement the wallet-gated account hook**

```ts
export function useSpotAccount() {
  const ready = useSpotAuthReady();
  const polling = usePolling<Account>(() => spotApi.account(), 2500, [], { enabled: ready });
  return { ready, account: polling.data, err: polling.err, refetch: polling.refetch };
}
```

The hook must not alter authentication or cache semantics.

- [ ] **Step 5: Run the math suite**

Run: `yarn test:ci src/modules/spot/components/OrderForm/orderFormMath.spec.ts`

Expected: PASS for buy, sell, invalid, total, and fee cases.

- [ ] **Step 6: Commit account and math primitives**

```bash
git add src/modules/spot/hooks/useSpotAccount.ts src/modules/spot/components/OrderForm/orderFormMath.ts src/modules/spot/components/OrderForm/orderFormMath.spec.ts
git commit -m "feat(spot): add account sizing primitives"
```

## Task 6: Rebuild the Limit Order Form

**Files:**
- Modify: `src/modules/spot/components/OrderForm/OrderForm.spec.tsx`
- Modify: `src/modules/spot/components/OrderForm/OrderForm.tsx`
- Modify: `src/modules/spot/components/OrderForm/OrderForm.module.scss`

- [ ] **Step 1: Add failing tests for the full supported form**

Mock `useSpotAccount` with USDA-equivalent free balance `1000` and CBTC free
balance `0.4`. Render with `market={resolveSpotMarket("CBTC-USDA")}` and assert:

```ts
expect(screen.getByText("Available")).not.toBeNull();
expect(screen.getByText("1,000 USDA")).not.toBeNull();
expect(screen.getByRole("button", { name: "Market" })).toBeDisabled();
expect(screen.getByRole("button", { name: "Limit Order" })).toBeDisabled();

fireEvent.change(screen.getByLabelText("Price"), { target: { value: "50000" } });
fireEvent.change(screen.getByLabelText("Order percentage"), { target: { value: "25" } });
expect(screen.getByLabelText("Amount")).toHaveValue("0.005");
expect(screen.getByLabelText("Total")).toHaveValue("250");
expect(screen.getByText(/0.25 USDA/)).not.toBeNull();
```

Retain tests for wallet connect, disabled submit, mapped `LIMIT` payload,
successful reset, and `SpotApiError` display.

- [ ] **Step 2: Run the form suite and verify the new fields fail**

Run: `yarn test:ci src/modules/spot/components/OrderForm/OrderForm.spec.tsx`

Expected: FAIL because available balance, order-type tabs, slider, Total, and fee are missing.

- [ ] **Step 3: Build the functional form state**

Use `market.apiSymbol` in `spotApi.placeOrder`. Read balances by API asset name
from `useSpotAccount`. Switch available balance with Buy/Sell. Recalculate
quantity when the percentage slider changes. Recalculate the read-only Total
and fee from price/quantity. Preserve the existing busy/message/reset behavior.

Render:

1. Buy/Sell primary tabs.
2. Limit active plus disabled Market and Limit Order buttons.
3. Available balance row.
4. Labeled Price and Amount fields with USDA/base suffixes.
5. Range input with `aria-label="Order percentage"` and 0/25/50/75/100 labels.
6. Read-only Total field.
7. Submit/connect action.
8. Fee cap and estimated fee row.

- [ ] **Step 4: Apply `/trade` form styling**

Use tokenized panel backgrounds, active tabs, input surfaces, focus rings,
buy/sell gradients, numeric tabular figures, and disabled opacity. Keep labels
visible above inputs and ensure the form scrolls internally rather than
expanding the right column.

- [ ] **Step 5: Run form and math suites**

Run: `yarn test:ci src/modules/spot/components/OrderForm/OrderForm.spec.tsx src/modules/spot/components/OrderForm/orderFormMath.spec.ts`

Expected: PASS with mapped limit payloads and safe percentage calculations.

- [ ] **Step 6: Commit the form**

```bash
git add src/modules/spot/components/OrderForm
git commit -m "feat(spot): rebuild the limit order form"
```

## Task 7: Merge Assets and Open Orders Into the Bottom Panel

**Files:**
- Modify: `src/modules/spot/components/Accounts/Accounts.spec.tsx`
- Modify: `src/modules/spot/components/Accounts/Accounts.tsx`
- Modify: `src/modules/spot/components/Accounts/Accounts.module.scss`
- Modify: `src/modules/spot/components/BottomTabs/BottomTabs.spec.tsx`
- Modify: `src/modules/spot/components/BottomTabs/BottomTabs.tsx`
- Modify: `src/modules/spot/components/BottomTabs/BottomTabs.module.scss`

- [ ] **Step 1: Write failing tab and USDA balance tests**

Update account tests to expect `USDA` instead of `USDCx`. In BottomTabs tests,
mock `SpotAccountsPanel`, render the resolved market, and assert:

```ts
expect(screen.getByRole("tab", { name: "Assets" })).toHaveAttribute("aria-selected", "true");
expect(screen.getByTestId("spot-assets-panel")).not.toBeNull();
expect(screen.getByRole("tab", { name: "Order History" })).toBeDisabled();
expect(screen.getByRole("tab", { name: "Trade History" })).toBeDisabled();

fireEvent.click(screen.getByRole("tab", { name: "Open Orders" }));
await screen.findByText("No open orders");
expect(mOpen).toHaveBeenCalledWith("CBTC-USDCX");
```

- [ ] **Step 2: Run Assets and BottomTabs tests and verify they fail**

Run: `yarn test:ci src/modules/spot/components/Accounts/Accounts.spec.tsx src/modules/spot/components/BottomTabs/BottomTabs.spec.tsx`

Expected: FAIL because Assets is not a tab and balances still expose USDCx.

- [ ] **Step 3: Reuse the account hook and map display labels**

Change `SpotAccountsPanel` to call `useSpotAccount`, use
`toSpotDisplayAsset(balance.asset)` for every asset label, and render the total
quote row as `USDA (free + locked)`. Preserve connect, loading, error, faucet,
and balance formatting behavior.

- [ ] **Step 4: Implement functional bottom tabs**

Add local active state `"assets" | "open"` with Assets as default. Render the
real Accounts panel for Assets and the existing OpenOrders table for Open
Orders. Render Order History and Trade History as disabled buttons with no
handlers. Pass `market.apiSymbol` into open/cancel requests and display the
market's public labels in headings.

- [ ] **Step 5: Style the reference bottom panel**

Keep the tab strip fixed, body scrollable, headers sticky, and disabled tabs
visibly muted. Convert the Assets panel to a compact horizontal/table layout at
desktop widths and a three-column balance grid on narrow screens.

- [ ] **Step 6: Run account and bottom-panel suites**

Run: `yarn test:ci src/modules/spot/components/Accounts/Accounts.spec.tsx src/modules/spot/components/BottomTabs/BottomTabs.spec.tsx`

Expected: PASS for connect, balance, faucet, default Assets, Open Orders, cancellation, and disabled history tabs.

- [ ] **Step 7: Commit the bottom panel**

```bash
git add src/modules/spot/components/Accounts src/modules/spot/components/BottomTabs
git commit -m "feat(spot): merge assets and orders panel"
```

## Task 8: Verify the Complete Workspace and Polish Visual Regressions

**Files:**
- Modify if verification exposes a defect: only the spot files listed above.

- [ ] **Step 1: Run every affected spot test**

Run: `yarn test:ci src/modules/spot src/app/MainRoutes.spec.tsx`

Expected: all affected tests PASS with zero failures.

- [ ] **Step 2: Run TypeScript checking**

Run: `yarn tscheck`

Expected: exit code 0 with no spot prop/type errors.

- [ ] **Step 3: Run lint on affected source**

Run: `yarn eslint src/modules/spot src/modules/lighter/components/TopNav/TopNav.tsx src/app/MainRoutes.tsx`

Expected: exit code 0 with no new warnings or errors.

- [ ] **Step 4: Build production assets**

Run: `yarn build`

Expected: Vite exits 0 and creates the production build without a spot-related warning.

- [ ] **Step 5: Start the app and inspect the target viewport**

Run: `yarn start`

Open: `http://localhost:3012/spot/CBTC-USDA`

At a desktop viewport matching the supplied screenshot, verify:

- Rocky TopNav and `/trade` theme remain unchanged.
- Left market/chart/bottom region, full-height middle book, and full-height
  right form align without page overflow.
- Every public quote label is USDA.
- Order Book, Recent Trades, Assets, Open Orders, slider, and Limit Buy/Sell are
  interactive.
- Market Info, Market, Limit Order, Order History, and Trade History are visibly
  disabled.
- Loading, empty, and disconnected states do not collapse panels.

Capture a desktop screenshot for side-by-side comparison with the supplied
ZTDX and current Rocky references.

- [ ] **Step 6: Re-run focused verification after any polish edit**

Run: `yarn test:ci src/modules/spot && yarn tscheck && yarn build`

Expected: all commands exit 0 after the final CSS or markup adjustment.

- [ ] **Step 7: Commit final polish**

```bash
git add src/modules/spot src/modules/lighter/components/TopNav/TopNav.tsx src/app/MainRoutes.tsx
git commit -m "fix(spot): polish ZTDX workspace layout"
```

## Completion Checklist

- [ ] USDA route/display mapping is centralized and covered by tests.
- [ ] Current USDCx API symbols are preserved for every backend request.
- [ ] The desktop workspace matches the approved three-column hierarchy.
- [ ] Order Book, Recent Trades, Assets, Open Orders, cancellation, Limit
      Buy/Sell, percentage sizing, total, and fee estimate work.
- [ ] Unsupported controls are visible, disabled, accessible, and request-free.
- [ ] The standalone account card is gone and Assets is the default bottom tab.
- [ ] Responsive layouts avoid horizontal page overflow.
- [ ] Focused tests, TypeScript, lint, production build, and visual inspection
      have fresh passing evidence.

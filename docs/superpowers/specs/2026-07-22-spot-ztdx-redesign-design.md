# Spot ZTDX Workspace Redesign

**Date:** 2026-07-22

**Status:** Approved for implementation

**Target:** `/spot/CBTC-USDA` in `rocky.interface`

## Context

The current spot page is a reduced frontend over Rocky's Binance-compatible
`/api/v3` endpoints. It already imports the `/trade` global styles and tokens,
but its component styling and page grid do not reproduce the information
hierarchy of the supplied ZTDX spot-trading reference.

The redesigned page will use the existing Rocky `/trade` visual theme while
adopting the ZTDX desktop workspace structure. The frontend will expose every
interaction supported by the checked-in `rocky-backend`. Controls whose APIs
do not exist yet will retain their reference-layout positions in an explicitly
disabled state.

## Goals

- Rebuild `/spot/CBTC-USDA` as a dense, three-column ZTDX-style trading
  workspace.
- Reuse `/trade` theme tokens, navigation, typography, borders, trading colors,
  form primitives, and button treatments.
- Display `USDA` consistently in the spot UI and public routes.
- Preserve the existing `USDCx` backend contract through one centralized
  display-to-API market mapping.
- Make all capabilities supported by the current backend usable: market data,
  recent trades, limit orders, order cancellation, open orders, balances, and
  account-derived order sizing.
- Preserve loading, disconnected-wallet, API-error, empty, and disabled states.
- Keep the workspace usable below desktop width through the existing `/trade`
  responsive conventions.

## Non-goals

- No `rocky-backend` changes.
- No fake market-order requests or fabricated order/trade history.
- No new Market Info content beyond currently available ticker statistics.
- No websocket or caching rewrite; existing polling behavior remains.
- No change to spot authentication or Canton session-key issuance.
- No redesign of `/trade`, portfolio, bonus, or wallet flows.

## Verified Backend Capability Matrix

| Area | Current source support | Frontend behavior |
| --- | --- | --- |
| Depth | `GET /api/v3/depth` | Functional order book |
| Recent trades | `GET /api/v3/trades` | Functional Recent Trades tab |
| Klines | `GET /api/v3/klines` | Functional TradingView chart |
| 24h ticker | `GET /api/v3/ticker/24hr` | Functional symbol-bar statistics |
| Account | `GET /api/v3/account` | Functional Assets tab and available balances |
| Limit order | `POST /api/v3/order`, type `LIMIT` | Functional Buy/Sell form |
| Cancel order | `DELETE /api/v3/order` | Functional cancel action |
| Open orders | `GET /api/v3/openOrders` | Functional Open Orders tab |
| Market order | Rejected by current `routes_orders.rs` | Visible but disabled |
| Order history | No collection endpoint | Visible but disabled |
| User trade history | No `/api/v3/myTrades` endpoint | Visible but disabled |

The current T1 spot taker fee is 10 bps, so the form may show an upper-bound
fee hint of `0.1%`. This is informational and does not alter order payloads.

## Market Identity and USDA Display

The display/API distinction must be centralized instead of scattered across
components. Introduce a spot-market view model with at least these fields:

- `routeSymbol`: public route symbol, for example `CBTC-USDA`.
- `apiSymbol`: current backend symbol, for example `CBTC-USDCX`.
- `displayBase` and `displayQuote`: user-facing labels (`CBTC`, `USDA`).
- `apiBase` and `apiQuote`: backend asset labels (`CBTC`, `USDCx`).

The supported mappings are:

| Route/display | Current API |
| --- | --- |
| `CBTC-USDA` | `CBTC-USDCX` |
| `CETH-USDA` | `CETH-USDCX` |

Top navigation, market selection, headings, form units, totals, balances, and
public URLs use display labels. API calls, TradingView datafeed requests,
authentication, order payloads, and balance lookup use API labels. Unknown
route symbols fall back to `CBTC-USDA` without issuing unsupported API calls.

When the backend migrates to USDA-native identifiers, only this mapping layer
and its tests should need adjustment.

## Page Architecture

`SpotTradePage` remains the route-level coordinator. It resolves the route to a
market view model once and passes that model to spot components. It does not
own market data, order data, or form state.

Below the existing `TopNav`, the desktop workspace is one three-column grid:

1. **Market workspace:** symbol/ticker header, chart navigation, TradingView
   chart, and the bottom account/order tabs.
2. **Order book:** Order Book/Recent Trades tabs, view-mode controls, depth
   columns, mid-price, and spread. It spans the full workspace height.
3. **Order entry:** Buy/Sell and order-type navigation plus the limit-order
   form. It spans the full workspace height.

The side-column width and page gutters continue to derive from `/trade`
layout variables. The left column consumes remaining width. Panel borders,
radii, backgrounds, typography, hover states, and separators use existing
`--ltr-*` and Rocky theme tokens rather than literal replacement palettes.

## Market Workspace

### Symbol and ticker header

The header becomes taller and more hierarchical than the current single row:

- Token icon, `CBTC/USDA`, and the market selector form the leading block.
- Last price is visually dominant.
- 24h change, high, low, base volume, and USDA volume are compact statistic
  groups.
- Numeric values use tabular figures and the existing up/down colors.

The market selector lists `CBTC/USDA` and `cETH/USDA`, navigates to their USDA
routes, and continues requesting the mapped backend symbols.

### Chart area

A ZTDX-style navigation row sits above TradingView:

- `Chart` is active.
- `Market Info` is visible but disabled because the agreed scope does not add a
  new information panel.
- The existing TradingView widget remains responsible for interval, indicator,
  drawing, camera, and chart interactions.
- Chart colors are aligned to `/trade` tokens where the TradingView API accepts
  static resolved values; no separate spot palette is introduced.

### Bottom account and order area

The bottom panel belongs to the left column, matching the reference layout.
Its tab order is:

1. `Assets` — functional and active by default; shows spot balances.
2. `Open Orders` — functional; retains cancellation.
3. `Order History` — disabled.
4. `Trade History` — disabled.

The standalone lower-right account card is removed. Its existing account
content moves into the functional Assets tab, so no account capability is lost.

## Order Book

The panel keeps existing depth and trade polling while adopting the reference
hierarchy:

- Top tabs: `Order Book` and `Recent Trades`.
- Three client-side view modes: combined book, asks only, and bids only.
- Column labels display user-facing units: `Price (USDA)`, `Amount (CBTC)`, and
  `Total (USDA)`.
- Rows retain depth bars, tabular numbers, and current ask/bid colors.
- The middle row emphasizes the latest midpoint and shows absolute and
  percentage spread.
- Empty, loading, and request-error states remain inside the panel without
  changing its geometry.

View modes only filter already-fetched rows and do not create new API calls.
Recent Trades keeps its current price, amount, and time data.

## Order Entry

The panel uses two navigation levels:

- Primary: `Buy CBTC` and `Sell CBTC`.
- Secondary: `Limit` active; `Market` and `Limit Order` visible but disabled
  until backend endpoints and semantics are available.

The functional limit form contains:

- Available balance for the relevant side (`USDA` when buying, `CBTC` when
  selling).
- Price input with USDA suffix.
- Amount input with base-asset suffix.
- A 0/25/50/75/100% slider.
- A read-only Total/notional field with USDA suffix.
- Submit CTA styled with existing `/trade` buy/sell tokens.
- Fee hint showing the current upper-bound `0.1%` and an estimated USDA amount
  when price and amount are valid.

The percentage slider is derived entirely from existing account data:

- Buy amount = selected percentage of free USDA-equivalent balance divided by
  entered price.
- Sell amount = selected percentage of free base balance.
- Invalid, zero, or missing prices do not produce `Infinity`, `NaN`, or a
  submit-ready quantity.

The order payload remains a mapped backend `LIMIT` request with price and
quantity. Existing success reset, busy state, wallet gate, and error messaging
are preserved.

## Data Flow and Isolation

- `SpotTradePage` resolves route identity and owns only layout.
- Symbol bar, chart, order book, order form, and bottom tabs receive the same
  resolved market object.
- Existing `usePolling` calls and intervals remain local to their panels.
- A reusable `useSpotAccount` hook exposes account data to Assets and order
  sizing while keeping the same endpoint and wallet-ready gate.
- Public display formatting is performed at the component boundary; raw API
  response objects are not mutated.
- Disabled controls never call the API and expose `disabled`/`aria-disabled`
  semantics.

## Error Handling and Accessibility

- Disconnected users see the existing connect-wallet action in private panels.
- API failures remain visible near the affected panel or form.
- Empty order book, recent trades, balances, and open orders have distinct
  empty states.
- Tabs use buttons with selected/disabled state, keyboard focus styles, and
  meaningful accessible labels.
- Order-book view controls expose text through `aria-label` even when rendered
  as icons.
- Form inputs retain labels, decimal input modes, and disabled-submit rules.
- Color is not the sole indicator for selected tabs, disabled controls, or
  errors; borders, text, and state attributes also convey status.

## Responsive Behavior

Desktop fidelity is the primary acceptance target. At narrower widths, follow
the existing `/trade` breakpoints:

- At tablet widths, columns stack in the order market workspace, order book,
  order entry.
- Panels receive explicit minimum heights so TradingView and scrollable order
  rows remain usable.
- At mobile widths, page gutters and gaps reduce without horizontal overflow.
- Tabs and symbol statistics may scroll horizontally rather than wrap into
  unreadable multi-line headers.

No separate mobile interaction model is introduced in this change.

## Test Strategy

Implementation follows test-first red/green cycles.

1. Market mapping tests prove USDA routes and labels map to current USDCx API
   symbols and that unknown symbols fall back safely.
2. Route/navigation tests prove the Spot link and default page use
   `/spot/CBTC-USDA`.
3. Order-book component tests prove tab behavior, all three view modes, spread,
   cumulative totals, and USDA column labels.
4. Order-form tests prove available-balance selection, percentage sizing,
   total/fee calculation, disabled unsupported order types, limit submission,
   wallet gating, and API errors.
5. Bottom-panel tests prove Assets/Open Orders work and history tabs cannot
   trigger requests.
6. Page-level tests prove the ZTDX region order and absence of the old separate
   account column.
7. Fresh verification runs targeted Vitest suites, the broader affected test
   set, TypeScript checking, lint, production build, and a desktop browser
   screenshot comparison against the supplied references.

## Acceptance Criteria

- `/spot/CBTC-USDA` renders with the `/trade` theme and the approved ZTDX
  three-column hierarchy.
- All visible user-facing spot quote labels say `USDA`; no `USDCx` leaks into
  the spot UI.
- Current backend calls still use `CBTC-USDCX`/`CETH-USDCX` and continue to
  function.
- Order Book, Recent Trades, Assets, Open Orders, Limit Buy/Sell, cancellation,
  percentage sizing, and fee estimation work.
- Unsupported Market, Limit Order, Market Info, Order History, and Trade History
  controls are visibly disabled and produce no network requests.
- The old standalone account card is replaced by the Assets bottom tab.
- The page has no desktop overflow at the supplied reference viewport and no
  horizontal page overflow at supported responsive breakpoints.
- Automated checks and the production build pass with no new warnings caused
  by this change.

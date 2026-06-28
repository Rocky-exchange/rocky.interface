# Activate app.rocky.exchange on the demo's rocky-backend

**Date:** 2026-06-28
**Repo:** `rocky.interface` (the Vite/React "renance" app served at app.rocky.exchange)
**Status:** Design — approved in principle, pending spec review

## Problem

`app.rocky.exchange` is dead: it serves a stale static Vite build whose entire data
layer points at `https://api.primit.xyz` (the `primit-avax-backend`), which is down and
**deprecated — not coming back**. The new functionality lives in the Next.js `mtc-exchange`
app at `demo.rocky.exchange`, running on the live **rocky-backend** (Canton CLOB) stack on
EC2 `13.231.118.218`.

Goal: keep the original Vite UI's look and shell, but make it fully functional by driving
it from the **same backend the demo uses**, with **real-balance trading**.

## Scope

In scope (full trading parity with the demo, on the original UI shell):
- Market data: candles/chart, orderbook, recent trades, ticker — live.
- Auth: log in with the demo's **two wallets** (Loop Wallet, Console Wallet). Remove MetaMask.
- Trading: place / cancel / close orders, positions, open orders, trade history.
- Account: real balances from the logged-in Canton account.

Out of scope:
- Any on-chain / web3 / EVM trading paths, bridges, chain switching (GMX-fork leftovers).
- The deprecated SIWE `/auth/*` and `primit /v1/*` contracts.
- Functional changes to the demo (`mtc-exchange`) or rocky-backend. We **reuse** them as-is.
  - **One exception (config only):** because app.rocky.exchange proxies the *same* `:8080`
    demo instance, the wallet-preapproval redirect must be host-derived. This means
    **unsetting the hardcoded `AUTH0_WALLET_REDIRECT_URI`** in the mtc-exchange mainnet env
    and its `deploy-mainnet.sh` upsert, so origin comes from `x-forwarded-host`. This is
    backward-compatible for demo.rocky.exchange (still derives its own callback) and touches
    no demo UI/logic.

## Approach (chosen: A — reuse the demo's BFF)

Keep the original UI as a Vite SPA. Repoint its data/auth/order layer from the primit
`/v1/*` contract to the demo's already-working, same-origin Next.js BFF (`/api/perp/*`,
`/api/wallet/*`). The demo's BFF holds the HMAC keys / operator token server-side and
forwards to rocky-backend; the browser only ever holds a session bearer token.

Rejected — B (standalone adapter BFF): re-implements the demo's wallet+trade glue
independently. Duplicates proven logic, more code, more risk. No upside here.

### Why this fits the constraints
- "Don't touch the original UI" → we change only the top-right wallet area and the SDK
  internals; the layout/chart/orderbook/trade-panel shells stay.
- "Same backend as demo / real balances" → we literally call the demo's BFF, so identity,
  balances, margin, CLOB are exactly the demo's.
- "No new backend" → zero server code; reuse `mtc-exchange` + rocky-backend.

## Architecture

```
Browser (original Vite UI @ app.rocky.exchange)
  │  static assets  ── nginx (13.231.118.218) /var/www/rocky
  │  /api/*         ── nginx reverse-proxy ─▶ demo Next.js  127.0.0.1:8080  (BFF)
  │                                              └─ HMAC-signs ─▶ rocky-backend 127.0.0.1:18080
  └─ wallet SDKs (Loop / Console) run client-side for login only
```

- **Same-origin** is the key enabler: app.rocky.exchange serves the SPA AND proxies
  `/api/*` to the demo's Next.js. The SPA's `fetch("/api/perp/...")` and the session cookie
  / bearer token then work without CORS.
- Static build stays at `13.231.118.218:/var/www/rocky` (where app.rocky.exchange already
  points). The repo's `deploy.sh` targets the wrong host (`54.150.245.195`) and must be
  fixed to deploy here.

## Components & changes (in `rocky.interface`)

1. **Backend config** (`src/shared/config/backend.ts`, `src/shared/lib/sdk/api/rest/client.ts`,
   `.../websocket/client.ts`, `src/modules/dex/lib/sdk/api/websocket/client.ts`):
   drop `api.primit.xyz` defaults; base all data calls at same-origin `/api/perp` and
   `/api/wallet`. Remove chain-keyed URL maps (Arbitrum/Avalanche/Sepolia).

2. **Auth / login** (replace SIWE):
   - Delete the SIWE flow (`src/shared/lib/sdk/api/rest/auth.ts` nonce/login,
     `useAuth.ts` web3 path) and the MetaMask/wagmi connect in the header.
   - Port the demo's wallet login: client wallet SDKs (`@fivenorth/loop-sdk`,
     `@console-wallet/dapp-sdk`) + calls to `/api/wallet/{providers,challenge,verify,session}`.
   - Session storage mirrors the demo: on success store `rocky_exchange_session`,
     `rocky_user_id`, `rocky_binding_id`, `mtc_party`, `mtc_login_method`. All private
     requests send `Authorization: Bearer <rocky_exchange_session>`
     (the demo's `exchangeSessionHeaders()`).

3. **Top-right wallet UI** (the header connect area): replace MetaMask/ConnectButton with a
   Loop/Console connect control matching the original UI's styling. Logged-in state shows
   party/username + real balance (via `/api/wallet/rocky/balance` and/or
   `/api/perp/account/{asset}`).

4. **Data/trade SDK rewrite** (`src/shared/lib/sdk/api/rest/{orders,account,market}.ts`,
   plus `src/modules/cex/lib/api/*`): map the original UI's call sites and response shapes
   to the demo BFF (table below). Keep the original components' expected return shapes by
   adapting inside the SDK, so component code changes stay minimal.

5. **Market-data streaming (decided: polling)**: the original UI's TradingView datafeed
   expects streaming (`kline_snapshot`/`kline` over WS). The demo BFF exposes REST
   candles/ticker, so we drive the datafeed by **polling** `/api/perp/markets/{symbol}/candles`
   for the current bar (interval-appropriate cadence, e.g. ~2–5s) plus ticker for last price.
   All WS clients (`src/shared/lib/sdk/api/websocket/client.ts`,
   `src/modules/dex/lib/sdk/api/websocket/client.ts`) are removed or stubbed; nothing connects
   to `wss://api.primit.xyz`.

6. **Symbol mapping**: original UI uses `BTCUSDT`-style; demo uses `BTC-PERP`. Add a single
   mapping util used by the SDK layer.

7. **Deploy**: fix `deploy.sh` to rsync the build to `13.231.118.218:/var/www/rocky`
   (key `~/.ssh/rocky-canton-sandbox.pem`); add an nginx `location /api/` (and `/fapi/` if
   needed) → `127.0.0.1:8080` block in `/etc/nginx/conf.d/rocky.conf`, keeping the static
   `root /var/www/rocky` + SPA fallback.

## Endpoint / contract mapping

| Concern        | Original UI (primit `/v1`)              | Demo BFF (target)                                  |
|----------------|------------------------------------------|----------------------------------------------------|
| Auth           | `GET /auth/nonce/{addr}`, `POST /auth/login` (SIWE → JWT) | wallet SDK + `/api/wallet/{challenge,verify,session}` → `rocky_exchange_session` |
| Markets list   | `GET /markets`                           | `GET /api/perp/markets`                             |
| Orderbook      | `GET /markets/{sym}/orderbook`           | `GET /api/perp/markets/{sym}/orderbook?depth=`     |
| Recent trades  | `GET /markets/{sym}/trades`              | `GET /api/perp/markets/{sym}/recent-trades?limit=` |
| Ticker         | `GET /markets/{sym}/ticker`              | `GET /api/perp/markets/{sym}/ticker`               |
| Candles        | WS `kline:{SYM}:{tf}` + REST candles     | `GET /api/perp/markets/{sym}/candles?interval=&limit=` (+ polling) |
| Balances       | `GET /account/balances`                  | `GET /api/perp/account/{asset}` / `/api/wallet/rocky/balance` |
| Positions      | `GET /account/positions`                 | `GET /api/perp/positions`                          |
| Open orders    | `GET /account/orders`                    | `GET /api/perp/orders-me?status=open`              |
| Trade history  | `GET /account/trades`                    | `GET /api/perp/trades`                             |
| Place order    | `POST /orders`                           | `POST /api/perp/orders` `{symbol,side,leverage,price,qty,idempotency_key,reduceOnly?}` |
| Cancel order   | `DELETE /orders/{id}`                     | `DELETE /api/perp/orders/{id}`                     |

## Data flow (trade)

1. User connects Loop/Console wallet → session token in localStorage.
2. UI renders markets/orderbook/chart from public `/api/perp/markets/*` (polling for live).
3. UI loads balances/positions/orders with `Authorization: Bearer <session>`.
4. Order submit → `POST /api/perp/orders` → BFF HMAC-signs → rocky-backend CLOB. Real margin
   is locked against the account's real USDC balance.

## Risks & dependencies

- **Auth0 callback whitelist (decided):** the user will add
  `https://app.rocky.exchange/api/wallet/preapproval/callback` to the Auth0 app's Allowed
  Callback URLs (client `4UQdTwvEetobvugcypZX5mV3YgnSxjal`). On the server, the wallet
  preapproval origin must derive from the request (`x-forwarded-host`) rather than the
  hardcoded `AUTH0_WALLET_REDIRECT_URI=demo.rocky.exchange`, so the app-domain callback is
  used when login starts on app.rocky.exchange. nginx already forwards `X-Forwarded-*`.
- **Response-shape drift**: most effort/risk is in mapping demo shapes back to what the
  original components consume; mitigate by adapting inside the SDK and adding contract tests.
- **Funding**: real trading needs the account to hold USDC; deposits are gated behind HMAC
  on `:18080`. Funding path is the demo's existing wallet deposit flow — unchanged here.
- Local Mac is code-only; all runtime/deploy is on EC2.

## Testing

- Unit/contract tests on the SDK mapping layer (request shapes + response normalization),
  using recorded demo BFF responses as fixtures.
- Manual end-to-end on app.rocky.exchange after deploy: connect each wallet, see real
  balance, view chart/orderbook live, place a small limit order, see it in open orders,
  cancel it, place + close a position.
- Regression: confirm demo.rocky.exchange is unaffected (shared backend, separate static UI).

## Done criteria

app.rocky.exchange serves the original UI; MetaMask is gone; top-right offers Loop + Console
login; a logged-in user sees their real balance and can place/cancel/close real orders that
settle on rocky-backend; demo.rocky.exchange remains fully working.

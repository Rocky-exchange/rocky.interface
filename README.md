# Rocky Interface

Web trading interface for the Rocky perpetuals exchange, served at
**app.rocky.exchange**. A React + [Vite](https://vitejs.dev/) single-page app
(a GMX/Lighter-derived UI migrated to the [Canton](https://www.canton.network/)
wallet + the `rocky-backend` API). The trade page renders a TradingView Charting
Library chart fed by the exchange's candle API.

Markets are BTC-PERP, ETH-PERP, and CC-PERP (Canton Coin), all USDC-margined,
1–100x leverage.

## Getting Started

Install dependencies:

```
yarn
```

Run the dev server (defaults to http://localhost:3012; Vite picks the next free
port, e.g. 3013, if it's taken):

```
yarn start
```

In dev, `vite.config.ts` proxies `/v1` and `/fapi` to `https://api.rocky.exchange`
(override with `VITE_PROXY_API_URL`), so the browser talks to the backend
same-origin and there's no CORS to configure.

## Scripts

- `yarn start` — Vite dev server on `:3012`
- `yarn build` — production build into `build/` (`--mode production`, loads `.env.production`)
- `yarn test` / `yarn test:ci` — unit tests (vitest)
- `yarn lint` — ESLint over `src`
- `yarn tscheck` — TypeScript type-check (no emit)

## Backend / API

The UI talks to **`rocky-backend`** at `api.rocky.exchange`, which exposes two
surfaces:

- `/v1/*` — Rocky-native (wallet-session Bearer auth; Rocky symbols like
  `BTC-PERP`). Markets, orderbook, ticker, candles, orders, positions, and the
  wallet session (`/v1/wallet/challenge` + `/v1/wallet/verify`).
- `/fapi/*` — Binance-Futures-compatible (HMAC-signed; `BTCUSDT` symbols). Used
  by the volume bot and a few balance/position reads.

**There is no WebSocket backend** — the client streams via SWR REST polling
(orderbook / ticker / trades / candles). `VITE_WS_ENABLED=true` re-enables the WS
code path if a WS server is ever added.

### Same-origin proxy (production)

In production the browser must not fetch `api.rocky.exchange` cross-origin, so
`.env.production` sets `VITE_USE_SAME_ORIGIN_PROXY=true` → the app calls `/v1`
and `/fapi` on its own origin (`app.rocky.exchange`), and that host's nginx
reverse-proxies them to `api.rocky.exchange`. This mirrors the dev proxy and
removes any CORS dependency. If you flip this flag, keep the app-nginx `/v1`
+ `/fapi` proxy in sync or data loading breaks.

## Env config

`.env.local` (dev) and `.env.production` (build) — both tracked, non-secret:

- `VITE_USE_SAME_ORIGIN_PROXY` — `true` to call `/v1`,`/fapi` same-origin (prod).
- `VITE_PROXY_API_URL` / `VITE_PROXY_WS_URL` — override the backend origin (dev
  proxy target / cross-origin build); default `https://api.rocky.exchange`.
- `VITE_WALLET_CONNECT_PROJECT_ID` — WalletConnect Cloud project id.
- `VITE_CONSOLE_WALLET_TARGET` — Canton console-wallet target (`combined`).
- `VITE_SENTRY_DSN` — optional Sentry DSN (monitoring off when unset).

## Chart / candle data

The trade chart (TradingView Charting Library) is driven by `TradingKlineDataFeed`
(`src/modules/lighter/domain/tradingview`), which fetches OHLCV from
`/v1/markets/{SYMBOL}/candles?period=…&limit=…` on rocky-backend and normalizes
the `bucket_ms` rows into TradingView bars.

## Wallet

Auth is via the Canton **console wallet** (`src/shared/lib/canton-wallet`), not
MetaMask/EVM — connecting signs a `/v1/wallet/challenge` message and exchanges it
at `/v1/wallet/verify` for a session token stored in `localStorage`
(`rocky_exchange_session`). Any `Failed to connect to MetaMask` console noise
comes from a MetaMask-compatible browser extension probing the page, not this app.

## Deploy

Pushing to `main` triggers CI/CD. For a manual deploy, `./deploy.sh` builds
locally and uploads `build/` to the frontend host (`/var/www/rocky`, served at
app.rocky.exchange).

See [CHANGELOG.md](./CHANGELOG.md) for notable changes.

# Rocky Interface

Web trading interface for the Rocky perpetuals exchange (app.rocky.exchange).
A React + [Vite](https://vitejs.dev/) single-page app; the trade page renders a
TradingView Charting Library chart fed by the exchange's candle API.

## Getting Started

Install dependencies:

```
yarn
```

At first install you may need to set up pre-commit hooks: `yarn husky install`.

Run the dev server (http://localhost:3012):

```
yarn start
```

The page reloads on edits and surfaces lint errors in the console.

## Scripts

- `yarn start` — Vite dev server on `:3012`
- `yarn build` — production build into `build/`
- `yarn test` — unit tests (vitest)
- `yarn lint` — ESLint over `src`
- `yarn tscheck` — TypeScript type-check (no emit)

## Env config

- sentry — `VITE_SENTRY_DSN`
- base url
  - rpc: `VITE_PROXY_API_URL` / `VITE_PROXY_SEPOLIA_API_URL`
  - ws: `VITE_PROXY_WS_URL` / `VITE_PROXY_SEPOLIA_WS_URL`
- wallet connect project id — `VITE_WALLET_CONNECT_PROJECT_ID`
- alchemy endpoint — `VITE_ALCHEMY_API_KEY`
- contracts (`/src/shared/config/custom`) — `USDT` / `ZTDX_VAULT` / `REFERRAL_REBATE` / `EARN`

When the base url vars are unset, the data layer calls same-origin `/api/v1/*`,
which nginx forwards to the `mtc-exchange` compat routes.

## Chart / candle data

The trade chart (TradingView Charting Library) is driven by `X10000KlineDataFeed`
(`src/modules/dex/domain/tradingview`), which fetches OHLCV from
`/api/v1/markets/{SYMBOL}/candles?period=…`. That endpoint is served by the
`mtc-exchange` compat layer, which proxies `rocky-backend` and aggregates the
timeframes the backend doesn't bucket natively (5m / 15m / 30m / 4h / 1w / 1M).

## Deploy

`./deploy.sh` builds locally and uploads to the EC2 host
(`ubuntu@13.231.118.218:/var/www/rocky`, served at app.rocky.exchange).

See [CHANGELOG.md](./CHANGELOG.md) for notable changes.

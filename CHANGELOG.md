# Changelog

Notable changes to the Rocky interface. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Fixed

- **Trade chart was blank / "No data here".** Guarded TradingView widget
  initialization against an async-script load race — the chart effect could call
  `new window.TradingView.widget()` before the `async`-loaded charting library had
  defined the global, which threw and left the panel blank (swallowed by the
  Sentry error boundary). (`afc5b4e`)
- **Chart rendered only a single candle.** The candles API returns timestamps in
  milliseconds, but the X10000 datafeed treated them as seconds and re-multiplied
  by 1000, placing every historical bar ~1000× into the future where the `getBars`
  filter dropped them; only the realtime poll bar survived. Fixed the unit
  conversion in `candleToBar` / `wsKlineToBar`. (`4544296`)
- **Timeframe buttons did nothing.** `ChartPanel`'s interval buttons only updated
  local state wired to the "Original" chart mode; in the default TradingView mode
  the chart received no timeframe. Pass `forcedPeriod` so the toolbar drives the
  chart resolution. (`ac8eda3`)

### Changed

- **Timeframe toolbar.** Removed the dead "More" button and exposed `1d`, `1w` and
  `1m` (monthly) directly; the toolbar is now `5m 15m 1h 4h 1d 1w 1m`. Weekly and
  monthly views are built from daily data. (`df61d2c`)

### Notes

- 5m / 15m / 30m / 4h / 1w / 1M candles are aggregated in the `mtc-exchange` compat
  layer from the base 1m / 1h / 1d the backend serves (`rocky-backend`'s candles
  route only buckets 1m / 1h / 1d). Binance Futures (`fapi.binance.com`) is
  geo-blocked from the servers, so these are rolled up from existing
  trade-derived OHLCV rather than fetched live.

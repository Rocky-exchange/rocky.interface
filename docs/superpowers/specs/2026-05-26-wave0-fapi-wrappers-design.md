# Wave 0 FAPI Wrappers — Design

**Date:** 2026-05-26
**Status:** Approved (pending plan)
**Owner:** rocky-backend / api-gateway
**Scope:** 7 thin FAPI wrappers around existing internal data. Zero schema change, zero matching-engine change.

## Goal

Convert 7 of the most-used Binance-style endpoints from *(空缺)* to *(implemented)* in Rocky's FAPI surface, with the smallest possible diff:

| # | Endpoint | Source |
|---|---|---|
| 1 | `GET /fapi/v1/ping` | trivial |
| 2 | `GET /fapi/v1/time` | trivial |
| 3 | `GET /fapi/v1/depth` | matching-engine gRPC (already used by `/v1/orderbook`) |
| 4 | `GET /fapi/v1/trades` | `ledger.trades` (already used by `/v1/recent-trades`) |
| 5 | `GET /fapi/v1/klines` | `ledger.trades` aggregated (already used by `/v1/candles`) |
| 6 | `GET /fapi/v1/ticker/24hr` | `ledger.trades` aggregated + oracle (extension of `/v1/ticker`) |
| 7 | `GET /fapi/v1/ticker/bookTicker` | matching-engine gRPC (depth=1 reuse) |

Together they make Rocky's FAPI surface usable by stock SDKs (ccxt, python-binance) for read-only / market-data flows without ever touching the V1 surface.

## Non-goals

- No new schema or migration
- No matching-engine or internal-ledger change
- No web-frontend change
- No bot-side change (the bot uses signed endpoints that already work)
- No conditional orders, leverage adjustments, force orders, multi-asset margin, WebSocket — those are Wave 1+
- No touching pre-existing dirty files (`Makefile`, `scripts/remote.sh`, `login.sh`, `scripts/dev/services-remote.sh`)

## Architecture

### State plumbing

`FapiState` (in `services/api-gateway/src/fapi/mod.rs`) gains one field:

```rust
pub struct FapiState {
    pub pg: PgPool,
    pub oracle: Arc<OracleCache>,
    pub matching: MatchingClient,         // ← NEW
    pub default_recv_window_ms: i64,
    pub max_recv_window_ms: i64,
}

impl FapiState {
    pub fn new(pg: PgPool, oracle: Arc<OracleCache>, matching: MatchingClient) -> Arc<Self> {
        Arc::new(Self { pg, oracle, matching,
                        default_recv_window_ms: 5_000, max_recv_window_ms: 60_000 })
    }
}
```

`MatchingClient` is an `Arc<Mutex<…>>` already — adding the reference is one extra pointer; no runtime cost for routes that don't use it (account / orders).

`api_gateway::lib::build_router_with_dev` already extracts `matching` from `AppState`; update the single `FapiState::new(pg, oracle)` call site to add `matching.clone()`.

### File layout

```
services/api-gateway/src/fapi/
  mod.rs                 ← FapiState gains `matching`; router merges market routes
  routes_public.rs       ← +ping +time handlers (~20 lines added)
  routes_market.rs       ← NEW; ~350 lines; depth + trades + klines + ticker/24hr + bookTicker
  routes_orders.rs       (unchanged)
  routes_account.rs      (unchanged)
  auth.rs                (unchanged)
  error.rs               (unchanged)
  keys.rs                (unchanged)
  sign.rs                (unchanged)
  symbol_map.rs          (unchanged)
```

Market routes mount under the *public* (unsigned) group — matching Binance, where exchangeInfo, depth, trades, klines, ticker/24hr, ticker/bookTicker are all unauthenticated.

`mod.rs::router(state, trading)` becomes:

```rust
let public = routes_public::router(state.clone())
    .merge(routes_market::router(state.clone()));   // ← NEW
let signed = routes_orders::router(orders_deps)
    .merge(routes_account::router(state.clone()))
    .layer(from_fn_with_state(state.clone(), auth::verify_signature));
public.merge(signed)
```

## Endpoint specifications

### 1. `GET /fapi/v1/ping`

**Request:** no parameters.

**Response 200:**
```json
{}
```

**Handler:** static, returns `Json(serde_json::json!({}))`.

### 2. `GET /fapi/v1/time`

**Request:** no parameters.

**Response 200:**
```json
{ "serverTime": 1748275200500 }
```

`serverTime` = `chrono::Utc::now().timestamp_millis()`.

### 3. `GET /fapi/v1/depth`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Binance form (`BTCUSDT`). Mapped via `symbol_map::binance_to_rocky`. |
| `limit` | int | no | Default 50; clamped to 100. (V1 orderbook also clamps to 100; deeper depth is Wave 1 if SDKs need it.) |

**Response 200:**
```json
{
  "lastUpdateId": 1748275200500,
  "E": 1748275200500,
  "T": 1748275200500,
  "bids": [["76520.00", "0.005"], ["76519.50", "0.010"]],
  "asks": [["76521.00", "0.005"], ["76521.50", "0.010"]]
}
```

**Sources:**
- `lastUpdateId` / `E` / `T`: server-side `ts_ms` (`chrono::Utc::now().timestamp_millis()`). All three are the same `ts_ms` value.
- `bids` / `asks`: same gRPC `book_snapshot` call as `routes/markets.rs::orderbook`. Take first `limit` levels.

**Errors:**
- Unknown `symbol` → `-1100 IllegalParameter` (400).
- Matching-engine RPC failure → `-1000 Unknown` (500). Pre-existing `routes/markets.rs::orderbook` maps to `BAD_GATEWAY`; we keep `-1000`/500 for FAPI consistency with other gRPC failure paths in `routes_orders.rs`.

### 4. `GET /fapi/v1/trades`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Binance form. |
| `limit` | int | no | Default 100; clamped to 1000. |

**Response 200:**
```json
[
  {
    "id": 8745321456987654,
    "price": "76521.34",
    "qty": "0.0005",
    "quoteQty": "38.26",
    "time": 1748275200320,
    "isBuyerMaker": false
  }
]
```

**Sources:**

```sql
SELECT trade_id, price, qty, side, ts
FROM ledger.trades
WHERE symbol = $1
ORDER BY ts DESC
LIMIT $2
```

Reshape per row:
- `id`: stable derivation of `trade_id` (UUID) → `i64`. Implementation: `(i64::from_be_bytes(uuid_bytes[..8].try_into().unwrap())) & i64::MAX` (mask the sign bit to keep it positive). No new crate. Same UUID always maps to the same id; collision probability for ≤ 2^32 trades is < 1 in 2^31.
- `price`: as-is.
- `qty`: as-is.
- `quoteQty`: `price * qty` formatted as decimal string.
- `time`: `ts.unix_timestamp_nanos() / 1_000_000`.
- `isBuyerMaker`: `side == "SELL"` (taker SELL ⇒ buyer was passive ⇒ buyer = maker; Binance semantics).

**Errors:**
- Unknown `symbol` → `-1100`.
- Postgres error → `-1000` (500).

### 5. `GET /fapi/v1/klines`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Binance form. |
| `interval` | string | yes | One of `1m`, `1h`, `1d`. Other values → `-1100`. |
| `limit` | int | no | Default 500; clamped to 1500 (matches Binance klines max). |

**Response 200** (nested-array form — Binance convention):

```json
[
  [
    1748275140000,                    // openTime
    "76510.00",                       // open
    "76525.00",                       // high
    "76500.00",                       // low
    "76521.34",                       // close
    "1.2456",                         // volume (base)
    1748275199999,                    // closeTime
    "95300.12",                       // quoteVolume
    142,                              // count
    "0.6234",                         // takerBuyVolume (base)
    "47700.50",                       // takerBuyQuoteVolume
    "0"                               // ignore
  ]
]
```

**Sources:**

```sql
SELECT
  date_trunc('<unit>', ts) AS bucket,
  (array_agg(price ORDER BY ts ASC))[1]   AS open,
  MAX(price)                              AS high,
  MIN(price)                              AS low,
  (array_agg(price ORDER BY ts DESC))[1]  AS close,
  SUM(qty)                                AS volume,
  SUM(price * qty)                        AS quote_volume,
  COUNT(*)                                AS trade_count,
  SUM(CASE WHEN side = 'BUY'  THEN qty           ELSE 0 END) AS taker_buy_vol,
  SUM(CASE WHEN side = 'BUY'  THEN price * qty   ELSE 0 END) AS taker_buy_quote_vol
FROM ledger.trades
WHERE symbol = $1 AND ts > now() - interval '<lookback>'
GROUP BY bucket
ORDER BY bucket ASC
```

where `<unit>` ∈ `{minute, hour, day}` per the same `date_trunc_unit()` helper as `routes/candles.rs`, and `<lookback>` = `limit * unit` (e.g., `500 minutes`).

Reshape per row:
- `openTime` = `bucket_ms`.
- `closeTime` = `openTime + (interval_ms - 1)` (e.g., `+59999` for 1m).
- `count` = `trade_count`.
- `ignore` = `"0"` (constant).
- All numerics serialised as decimal strings.

**Errors:**
- Unknown `symbol` → `-1100`.
- Bad `interval` → `-1100` with msg `unsupported interval '<value>' (use 1m|1h|1d)`.

### 6. `GET /fapi/v1/ticker/24hr`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | no | Omit → return all symbols (array). Present → single object. |

**Response 200** (single):

```json
{
  "symbol": "BTCUSDT",
  "priceChange": "630.84",
  "priceChangePercent": "0.831",
  "weightedAvgPrice": "76500.21",
  "lastPrice": "76521.34",
  "lastQty": "0.0005",
  "openPrice": "75890.50",
  "highPrice": "77400.00",
  "lowPrice": "75890.50",
  "volume": "118.4521",
  "quoteVolume": "9061234.50",
  "openTime": 1748188800000,
  "closeTime": 1748275200000,
  "firstId": 0,
  "lastId": 0,
  "count": 18421
}
```

**Response 200** (no symbol) = array of the above shape.

**Sources:**

```sql
SELECT
  symbol,
  (array_agg(price ORDER BY ts ASC ))[1]  AS open_price,
  (array_agg(price ORDER BY ts DESC))[1]  AS last_price,
  (array_agg(qty   ORDER BY ts DESC))[1]  AS last_qty,
  MAX(price)                              AS high,
  MIN(price)                              AS low,
  SUM(qty)                                AS volume,
  SUM(price * qty)                        AS quote_volume,
  CASE WHEN SUM(qty) > 0
       THEN SUM(price * qty) / SUM(qty)
       ELSE 0 END                         AS weighted_avg_price,
  COUNT(*)                                AS trade_count,
  MIN(ts)                                 AS open_time,
  MAX(ts)                                 AS close_time
FROM ledger.trades
WHERE ts > now() - interval '24 hours'
  AND ($1::text IS NULL OR symbol = $1)
GROUP BY symbol
```

(`$1` is `Option<String>`, the Rocky symbol after `symbol_map` translation if a `symbol` query param is given.)

Reshape per row:
- `priceChange` = `last_price - open_price`.
- `priceChangePercent` = `(priceChange / open_price) * 100`, formatted with 3 decimals, sign preserved.
- `openTime` / `closeTime` from `OffsetDateTime` → `ms`.
- `firstId` / `lastId` = `0` (synthetic; Rocky doesn't keep monotonic trade ids on this surface).

**Edge case:** No trades in the 24h window → row is absent in the GROUP BY result. For single-symbol query → return zero-row JSON (all numeric `"0"`, times = now). For all-symbols query → omit the symbol from the array.

**Errors:**
- Unknown `symbol` (single-symbol form) → `-1100`.
- Postgres error → `-1000` (500).

### 7. `GET /fapi/v1/ticker/bookTicker`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `symbol` | string | yes | Binance form. |

**Response 200:**

```json
{
  "symbol": "BTCUSDT",
  "bidPrice": "76520.00",
  "bidQty": "0.005",
  "askPrice": "76521.00",
  "askQty": "0.005",
  "time": 1748275200500
}
```

**Sources:**
- Same gRPC `book_snapshot` call as `/fapi/v1/depth`, taking only level 0.
- `time` = `chrono::Utc::now().timestamp_millis()`.
- Empty bid side → `bidPrice = "0"`, `bidQty = "0"`. Empty ask side → `askPrice = "0"`, `askQty = "0"`. (Q4 decision.)

**Errors:**
- Unknown `symbol` → `-1100`.
- Matching-engine RPC failure → `-1000` (500).

## Error mapping table

All errors return Binance JSON envelope `{code, msg}` via existing `FapiError::into_response`.

| Condition | FapiError | HTTP |
|---|---|---|
| Unknown `symbol` | `IllegalParameter` (-1100) | 400 |
| Bad `interval` on klines | `IllegalParameter` (-1100) | 400 |
| Missing required query param | `MandatoryParameterMissing` (-1102) | 400 |
| Matching-engine gRPC failure | `Unknown` (-1000) | 500 |
| Postgres error | `Unknown` (-1000) | 500 |

`limit` parameters are clamped silently rather than rejected (Binance behavior).

## Testing strategy

### Unit tests

`routes_market.rs` `#[cfg(test)] mod tests` block. No DB / no gRPC; test reshape logic only:

- `trade_id_to_i64(uuid)` is stable across calls (same UUID → same i64; non-negative).
- `kline_close_time(open_time, interval)` computes the right boundary (`1m → +59999`, `1h → +3599999`, `1d → +86399999`).
- `interval_to_lookback(limit, "1m")` returns `"500 minutes"` etc.
- `interval_to_pg_unit("1m"|"1h"|"1d")` returns `Some(…)`, anything else returns `None` (mirrors `candles.rs::date_trunc_unit`).
- `is_buyer_maker(side)`: `"SELL" → true` (taker sold, so buyer was maker) and `"BUY" → false` (taker bought, so buyer was taker, not maker).
- `price_change_percent(open, close)` handles `open == 0` gracefully (returns `"0"`).
- `bookTicker_empty_side()` returns `"0"` for missing side.

### Integration tests

None (would require a live matching-engine). Workspace `cargo test` runs the unit tests; full integration is the live smoke.

### Live smoke

After deploy to `demo.rocky.exchange`, run `scripts/dev/smoke-wave0.sh` (new file, *not* a pre-existing dirty file):

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE=${1:-https://demo.rocky.exchange}
echo "1/7 ping";       curl -fsS "$BASE/fapi/v1/ping"
echo "2/7 time";       curl -fsS "$BASE/fapi/v1/time"
echo "3/7 depth";      curl -fsS "$BASE/fapi/v1/depth?symbol=BTCUSDT&limit=10"
echo "4/7 trades";     curl -fsS "$BASE/fapi/v1/trades?symbol=BTCUSDT&limit=10"
echo "5/7 klines";     curl -fsS "$BASE/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=5"
echo "6/7 ticker24";   curl -fsS "$BASE/fapi/v1/ticker/24hr?symbol=BTCUSDT"
echo "7/7 bookTicker"; curl -fsS "$BASE/fapi/v1/ticker/bookTicker?symbol=BTCUSDT"
echo "all wave-0 smoke OK"
```

Plus negative cases (run by the deploy task, not committed as a script):

```bash
curl -i "$BASE/fapi/v1/depth?symbol=FOOUSDT"        # expect 400 -1100
curl -i "$BASE/fapi/v1/klines?symbol=BTCUSDT&interval=5m"  # expect 400 -1100
curl -i "$BASE/fapi/v1/trades"                       # expect 400 -1102
```

## Deployment plan

1. **Local:** `cargo build -p api-gateway` ✓, `cargo test -p api-gateway` ✓, `cargo clippy -p api-gateway -- -D warnings` ✓.
2. **Deploy:** `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart api-gateway` (existing playbook).
3. **Smoke:** run `scripts/dev/smoke-wave0.sh` + the three negative-case curls.
4. **Bot health:** `journalctl --user -u rocky-bot --since "5 min ago" | grep -c ERROR` — must stay flat. The bot only consumes signed endpoints; wave 0 changes are public-only, so zero expected impact.
5. **Push** only after smoke + bot-health both green.

## Open questions

None. All four micro-decisions resolved in the brainstorm:

1. **File layout:** new `routes_market.rs` for the 5 market handlers; ping + time in existing `routes_public.rs`.
2. **Synthetic fields:** `lastUpdateId` / `E` / `T` = server `ts_ms`. Trade `id` = stable hash of UUID → `i64`.
3. **ticker/24hr scope:** full Binance shape with all 17 fields, computed in one SQL.
4. **bookTicker empty book:** `"0"` per side.

## Out of scope (recap)

- No new schema, no migration.
- No matching-engine / internal-ledger changes.
- No leverage / margin-mode / position-side endpoints (these need core changes).
- No WebSocket of any kind.
- No `fromId` paging for trades — Wave 1.
- No `/fapi/v1/aggTrades` (would need aggregation pass) — Wave 1.
- No `/fapi/v1/fundingRate` history (already-stored data, but adding a new handler) — Wave 1.

## File summary

| Path | Change | Lines |
|---|---|---|
| `services/api-gateway/src/fapi/mod.rs` | `+matching` field + ctor arg + router merge | ~6 |
| `services/api-gateway/src/fapi/routes_public.rs` | `+ping` `+time` handlers + routes | ~20 |
| `services/api-gateway/src/fapi/routes_market.rs` | NEW: 5 handlers + tests | ~400 |
| `services/api-gateway/src/lib.rs` (`build_router_with_dev`) | wire `matching` into `FapiState::new` | ~1 |
| `services/api-gateway/Cargo.toml` | no change (no new deps) | 0 |
| `scripts/dev/smoke-wave0.sh` | NEW: 7-curl smoke | ~14 |

Net: ~440 LOC additions across 5 files. Zero deletions, zero migrations.

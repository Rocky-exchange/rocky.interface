# Wave 0 FAPI Wrappers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 7 thin Binance-shaped FAPI endpoints (`ping`, `time`, `depth`, `trades`, `klines`, `ticker/24hr`, `ticker/bookTicker`) over existing data sources. Zero schema change, zero matching-engine change.

**Architecture:** New `services/api-gateway/src/fapi/routes_market.rs` for 5 market handlers + minimal additions to `routes_public.rs` for `ping`/`time`. `FapiState` gains a `matching: MatchingClient` field so handlers can call the same gRPC `book_snapshot` already used by `/v1/markets/.../orderbook`. SQL aggregates against `ledger.trades` provide klines + ticker/24hr without new tables.

**Tech Stack:** Rust 1.85+, axum 0.8, sqlx, tonic gRPC, rust_decimal, chrono, uuid.

**Reference spec:** `docs/superpowers/specs/2026-05-26-wave0-fapi-wrappers-design.md`

**Constraints (hard):**
- Local Mac: `cargo build / test / clippy` only — **no** `docker` / `cargo run` / `systemctl`
- Deploy via `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart api-gateway`
- Live env: `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218`
- **Do not** touch pre-existing dirty files: `Makefile`, `scripts/remote.sh`, `login.sh`, `scripts/dev/services-remote.sh`
- **Do not** touch the active bot on EC2
- **Do not** `git push` until live smoke passes

---

## File Map

| Path | Action | Lines | Purpose |
|---|---|---|---|
| `services/api-gateway/src/fapi/mod.rs` | modify | ~6 added | `FapiState.matching` field + ctor arg + merge `routes_market` |
| `services/api-gateway/src/lib.rs` | modify | ~1 added | Pass `state.matching.clone()` to `FapiState::new` |
| `services/api-gateway/src/fapi/routes_public.rs` | modify | ~25 added | `ping` + `time` handlers + routes |
| `services/api-gateway/src/fapi/routes_market.rs` | **create** | ~400 | `depth`, `trades`, `klines`, `ticker/24hr`, `bookTicker` + tests |
| `scripts/dev/smoke-wave0.sh` | **create** | ~14 | 7-curl smoke against demo |

Net: ~450 LOC added, no deletions, no schema migrations.

---

## Task Overview

| # | Task | Commits | Done when |
|---|---|---|---|
| T1 | State plumbing: `FapiState.matching` | 1 | `cargo build -p api-gateway` ✓ |
| T2 | `ping` + `time` in `routes_public.rs` | 1 | New endpoints + unit test green |
| T3 | `routes_market.rs` skeleton + mount | 1 | Empty router merges, build green |
| T4 | `GET /fapi/v1/depth` | 1 | Handler + units green |
| T5 | `GET /fapi/v1/ticker/bookTicker` | 1 | Handler + units green |
| T6 | `GET /fapi/v1/trades` | 1 | Handler + units green |
| T7 | `GET /fapi/v1/klines` | 1 | Handler + units green |
| T8 | `GET /fapi/v1/ticker/24hr` | 1 | Handler + units green |
| T9 | `scripts/dev/smoke-wave0.sh` + clippy + fmt | 1 | `cargo clippy -- -D warnings` clean |
| T10 | Deploy + live smoke + bot monitor + push | 0 (push only) | All 7 curls green + bot logs flat for 5 min |

---

## Task 1: State plumbing — add `matching` to `FapiState`

**Files:**
- Modify: `services/api-gateway/src/fapi/mod.rs:11-39`
- Modify: `services/api-gateway/src/lib.rs:49-52`

This is a structural refactor with no new behavior — no unit test added; verified by `cargo build`.

- [ ] **Step 1: Edit `fapi/mod.rs` — add `matching` field**

Replace the imports + `FapiState` struct + impl at the top of the file. Current code starts at line 11; new code below replaces lines 11-39 (everything from `use sqlx` through the end of `impl FapiState`):

```rust
use sqlx::PgPool;
use std::sync::Arc;

use crate::clients::matching::MatchingClient;
use crate::oracle_cache::OracleCache;

/// Shared state for /fapi routes and middleware.
pub struct FapiState {
    pub pg: PgPool,
    /// Live mark-price cache fed by the NATS oracle.index_price.> subscriber.
    pub oracle: Arc<OracleCache>,
    /// Long-lived gRPC client to the matching-engine BookSnapshot RPC.
    /// Used by depth + bookTicker handlers in routes_market.
    pub matching: MatchingClient,
    /// Default recvWindow when client omits it (Binance default 5000ms).
    pub default_recv_window_ms: i64,
    /// Hard cap on recvWindow regardless of what the client sends (Binance: 60_000).
    pub max_recv_window_ms: i64,
}

impl FapiState {
    pub fn new(pg: PgPool, oracle: Arc<OracleCache>, matching: MatchingClient) -> Arc<Self> {
        Arc::new(Self {
            pg,
            oracle,
            matching,
            default_recv_window_ms: 5_000,
            max_recv_window_ms: 60_000,
        })
    }
}
```

- [ ] **Step 2: Edit `lib.rs:49-52` — pass `matching` into `FapiState::new`**

Find this block:

```rust
        .merge(fapi::router(
            fapi::FapiState::new(state.pg.clone(), state.oracle.clone()),
            state.trading.clone(),
        ));
```

Change to:

```rust
        .merge(fapi::router(
            fapi::FapiState::new(state.pg.clone(), state.oracle.clone(), state.matching.clone()),
            state.trading.clone(),
        ));
```

- [ ] **Step 3: Build to verify wiring**

Run: `cargo build -p api-gateway`
Expected: compiles cleanly. No new warnings.

- [ ] **Step 4: Commit**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git add services/api-gateway/src/fapi/mod.rs services/api-gateway/src/lib.rs
git commit -m "feat(api-gateway): FapiState gains matching client for wave-0 market routes

Adds matching: MatchingClient field to FapiState and threads
state.matching.clone() through from build_router_with_dev. No behavior
change; market handlers in the next task will read it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `ping` + `time` in `routes_public.rs`

**Files:**
- Modify: `services/api-gateway/src/fapi/routes_public.rs` (append handlers + extend router)

- [ ] **Step 1: Write failing unit tests**

Append to the bottom of `services/api-gateway/src/fapi/routes_public.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn time_response_is_within_now_window() {
        let before = chrono::Utc::now().timestamp_millis();
        let resp = build_time_response();
        let after = chrono::Utc::now().timestamp_millis();
        assert!(resp.server_time >= before, "server_time {} < before {}", resp.server_time, before);
        assert!(resp.server_time <= after,  "server_time {} > after {}",  resp.server_time, after);
    }

    #[test]
    fn ping_response_is_empty_object() {
        let v = build_ping_response();
        assert_eq!(v, serde_json::json!({}));
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL (undefined functions)**

Run: `cargo test -p api-gateway --lib fapi::routes_public::tests`
Expected: FAIL — `build_time_response` / `build_ping_response` not found.

- [ ] **Step 3: Add the handlers and helpers**

Insert just above the existing `pub fn router(state: Arc<FapiState>) -> Router {` line:

```rust
#[derive(Serialize)]
pub struct ServerTimeResp {
    #[serde(rename = "serverTime")]
    pub server_time: i64,
}

// Extracted so tests can assert on the value without booting axum.
pub fn build_time_response() -> ServerTimeResp {
    ServerTimeResp { server_time: chrono::Utc::now().timestamp_millis() }
}

pub fn build_ping_response() -> serde_json::Value {
    serde_json::json!({})
}

async fn ping() -> Json<serde_json::Value> {
    Json(build_ping_response())
}

async fn server_time() -> Json<ServerTimeResp> {
    Json(build_time_response())
}
```

- [ ] **Step 4: Wire routes into the existing `router` fn**

Replace the existing `pub fn router(state: Arc<FapiState>) -> Router { ... }` (currently 5 lines) with:

```rust
pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .route("/fapi/v1/exchangeInfo", get(exchange_info))
        .route("/fapi/v1/ticker/price", get(ticker_price))
        .route("/fapi/v1/ping", get(ping))
        .route("/fapi/v1/time", get(server_time))
        .with_state(state)
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cargo test -p api-gateway --lib fapi::routes_public::tests`
Expected: 2 passed.

- [ ] **Step 6: Build full crate**

Run: `cargo build -p api-gateway`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add services/api-gateway/src/fapi/routes_public.rs
git commit -m "feat(api-gateway): GET /fapi/v1/ping + /fapi/v1/time

Two trivial public endpoints — ping returns {}, time returns
{serverTime: <ms>}. Helpers extracted as pure functions for unit
testing without axum boot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `routes_market.rs` skeleton + mount

**Files:**
- Create: `services/api-gateway/src/fapi/routes_market.rs`
- Modify: `services/api-gateway/src/fapi/mod.rs` (add module + merge router)

This task establishes the file with imports + an empty router so subsequent tasks can add handlers one at a time with each task compiling cleanly.

- [ ] **Step 1: Create `routes_market.rs` with imports + empty router**

Write the full file at `services/api-gateway/src/fapi/routes_market.rs`:

```rust
//! Market-data endpoints (depth / trades / klines / ticker/24hr / bookTicker).
//! All unauthenticated; mounted alongside routes_public. Handlers reshape
//! existing internal data (matching-engine gRPC + ledger.trades) into the
//! Binance USD-M Futures wire shape so off-the-shelf SDKs work unchanged.

use std::sync::Arc;

use axum::{Json, Router, extract::{Query, State}, routing::get};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::clients::matching::BookSnapshotRequest;

use super::{FapiState, error::FapiError, symbol_map};

pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .with_state(state)
}
```

- [ ] **Step 2: Declare module + merge router in `fapi/mod.rs`**

In `services/api-gateway/src/fapi/mod.rs`, find the module declarations near the top:

```rust
pub mod auth;
pub mod error;
pub mod keys;
pub mod routes_account;
pub mod routes_orders;
pub mod routes_public;
pub mod sign;
pub mod symbol_map;
```

Add `pub mod routes_market;` so it becomes:

```rust
pub mod auth;
pub mod error;
pub mod keys;
pub mod routes_account;
pub mod routes_market;
pub mod routes_orders;
pub mod routes_public;
pub mod sign;
pub mod symbol_map;
```

Then in the existing `router` function in the same file, find:

```rust
    let public = routes_public::router(state.clone());
```

Replace with:

```rust
    let public = routes_public::router(state.clone())
        .merge(routes_market::router(state.clone()));
```

- [ ] **Step 3: Build to verify**

Run: `cargo build -p api-gateway`
Expected: clean. The new module compiles even with an empty router because `with_state` accepts an unused state arg.

- [ ] **Step 4: Commit**

```bash
git add services/api-gateway/src/fapi/routes_market.rs services/api-gateway/src/fapi/mod.rs
git commit -m "feat(api-gateway): scaffold fapi/routes_market.rs (empty router)

Skeleton for wave-0 market handlers (depth, trades, klines,
ticker/24hr, bookTicker). Module declared + merged into fapi::router;
empty router compiles cleanly. Handlers land one per commit in the
following tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `GET /fapi/v1/depth`

**Files:**
- Modify: `services/api-gateway/src/fapi/routes_market.rs`

- [ ] **Step 1: Add failing test for the (trivial) helper that clamps `limit`**

Append to `services/api-gateway/src/fapi/routes_market.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_depth_limit_defaults_and_caps() {
        assert_eq!(clamp_depth_limit(None), 50);
        assert_eq!(clamp_depth_limit(Some(10)), 10);
        assert_eq!(clamp_depth_limit(Some(0)), 1);     // never zero
        assert_eq!(clamp_depth_limit(Some(500)), 100); // hard cap
    }
}
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cargo test -p api-gateway --lib fapi::routes_market::tests::clamp_depth_limit_defaults_and_caps`
Expected: FAIL — `clamp_depth_limit` not found.

- [ ] **Step 3: Add helper + handler + response types**

Just above the `pub fn router(...)` line, insert:

```rust
// ───── /fapi/v1/depth ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DepthQuery {
    pub symbol: String,
    pub limit: Option<usize>,
}

#[derive(Serialize)]
pub struct DepthResp {
    #[serde(rename = "lastUpdateId")]
    pub last_update_id: i64,
    #[serde(rename = "E")]
    pub event_time: i64,
    #[serde(rename = "T")]
    pub tx_time: i64,
    pub bids: Vec<[String; 2]>,
    pub asks: Vec<[String; 2]>,
}

pub fn clamp_depth_limit(raw: Option<usize>) -> usize {
    raw.unwrap_or(50).clamp(1, 100)
}

async fn depth(
    State(state): State<Arc<FapiState>>,
    Query(q): Query<DepthQuery>,
) -> Result<Json<DepthResp>, FapiError> {
    let rocky = symbol_map::binance_to_rocky(&q.symbol)
        .ok_or(FapiError::IllegalParameter)?;
    let limit = clamp_depth_limit(q.limit);

    let mut client = state.matching.lock().await;
    let resp = client
        .book_snapshot(BookSnapshotRequest { symbol: rocky.to_string() })
        .await
        .map_err(|_| FapiError::Unknown)?
        .into_inner();

    let bids = resp.bids.into_iter().take(limit).map(|b| [b.price, b.qty]).collect();
    let asks = resp.asks.into_iter().take(limit).map(|a| [a.price, a.qty]).collect();
    let ts = chrono::Utc::now().timestamp_millis();
    Ok(Json(DepthResp {
        last_update_id: ts,
        event_time: ts,
        tx_time: ts,
        bids,
        asks,
    }))
}
```

- [ ] **Step 4: Register route**

Replace the existing `pub fn router(...)` with:

```rust
pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .route("/fapi/v1/depth", get(depth))
        .with_state(state)
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cargo test -p api-gateway --lib fapi::routes_market`
Expected: 1 passed.

- [ ] **Step 6: Build full crate**

Run: `cargo build -p api-gateway`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add services/api-gateway/src/fapi/routes_market.rs
git commit -m "feat(api-gateway): GET /fapi/v1/depth

Reuses the matching-engine book_snapshot gRPC (same client as
/v1/markets/.../orderbook). lastUpdateId / E / T all = server ts_ms
per the wave-0 design (no monotonic sequence on Rocky side yet).
Limit clamped 1..=100.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `GET /fapi/v1/ticker/bookTicker`

**Files:**
- Modify: `services/api-gateway/src/fapi/routes_market.rs`

- [ ] **Step 1: Add failing test for the empty-side helper**

Inside the existing `#[cfg(test)] mod tests { ... }` block, add:

```rust
    #[test]
    fn book_top_or_zero_returns_string_zero_when_empty() {
        assert_eq!(book_top_or_zero(None), ("0".to_string(), "0".to_string()));
        assert_eq!(
            book_top_or_zero(Some(("76520.00".to_string(), "0.005".to_string()))),
            ("76520.00".to_string(), "0.005".to_string()),
        );
    }
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cargo test -p api-gateway --lib fapi::routes_market::tests::book_top_or_zero_returns_string_zero_when_empty`
Expected: FAIL — `book_top_or_zero` not found.

- [ ] **Step 3: Add helper + handler + response types**

Insert above `pub fn router(...)`:

```rust
// ───── /fapi/v1/ticker/bookTicker ─────────────────────────────────────────────

#[derive(Deserialize)]
pub struct BookTickerQuery {
    pub symbol: String,
}

#[derive(Serialize)]
pub struct BookTickerResp {
    pub symbol: String,
    #[serde(rename = "bidPrice")]
    pub bid_price: String,
    #[serde(rename = "bidQty")]
    pub bid_qty: String,
    #[serde(rename = "askPrice")]
    pub ask_price: String,
    #[serde(rename = "askQty")]
    pub ask_qty: String,
    pub time: i64,
}

pub fn book_top_or_zero(level: Option<(String, String)>) -> (String, String) {
    level.unwrap_or_else(|| ("0".to_string(), "0".to_string()))
}

async fn book_ticker(
    State(state): State<Arc<FapiState>>,
    Query(q): Query<BookTickerQuery>,
) -> Result<Json<BookTickerResp>, FapiError> {
    let rocky = symbol_map::binance_to_rocky(&q.symbol)
        .ok_or(FapiError::IllegalParameter)?;

    let mut client = state.matching.lock().await;
    let resp = client
        .book_snapshot(BookSnapshotRequest { symbol: rocky.to_string() })
        .await
        .map_err(|_| FapiError::Unknown)?
        .into_inner();

    let top_bid = resp.bids.into_iter().next().map(|b| (b.price, b.qty));
    let top_ask = resp.asks.into_iter().next().map(|a| (a.price, a.qty));
    let (bid_price, bid_qty) = book_top_or_zero(top_bid);
    let (ask_price, ask_qty) = book_top_or_zero(top_ask);

    Ok(Json(BookTickerResp {
        symbol: q.symbol,
        bid_price,
        bid_qty,
        ask_price,
        ask_qty,
        time: chrono::Utc::now().timestamp_millis(),
    }))
}
```

- [ ] **Step 4: Register route**

Replace the existing `pub fn router(...)`:

```rust
pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .route("/fapi/v1/depth", get(depth))
        .route("/fapi/v1/ticker/bookTicker", get(book_ticker))
        .with_state(state)
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `cargo test -p api-gateway --lib fapi::routes_market`
Expected: 2 passed.

- [ ] **Step 6: Build + commit**

```bash
cargo build -p api-gateway
git add services/api-gateway/src/fapi/routes_market.rs
git commit -m "feat(api-gateway): GET /fapi/v1/ticker/bookTicker

Top-of-book bid/ask via the same book_snapshot gRPC as /fapi/v1/depth.
Empty side returns \"0\"/\"0\" per the wave-0 design (matches Binance
behavior when a symbol has no quotes).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `GET /fapi/v1/trades`

**Files:**
- Modify: `services/api-gateway/src/fapi/routes_market.rs`

- [ ] **Step 1: Add failing tests for the two pure helpers**

Inside the `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn trade_id_from_uuid_is_stable_and_positive() {
        let u = Uuid::parse_str("8a3f5b2c-4d1e-6f7a-8b9c-0d1e2f3a4b5c").unwrap();
        let id1 = trade_id_from_uuid(u);
        let id2 = trade_id_from_uuid(u);
        assert_eq!(id1, id2, "same uuid must map to same id");
        assert!(id1 >= 0, "id must be non-negative, got {id1}");
    }

    #[test]
    fn is_buyer_maker_inverts_taker_side() {
        // taker SELL → buyer was maker (passive) → true
        assert!(is_buyer_maker("SELL"));
        // taker BUY → buyer was taker (aggressor) → false
        assert!(!is_buyer_maker("BUY"));
        // unknown side defaults to false (defensive)
        assert!(!is_buyer_maker("OTHER"));
    }
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cargo test -p api-gateway --lib fapi::routes_market::tests::trade_id_from_uuid_is_stable_and_positive`
Expected: FAIL — undefined.

- [ ] **Step 3: Add helpers + handler + DB row type**

Insert above `pub fn router(...)`:

```rust
// ───── /fapi/v1/trades ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct TradesQuery {
    pub symbol: String,
    pub limit: Option<i64>,
}

#[derive(Serialize)]
pub struct PublicTradeResp {
    pub id: i64,
    pub price: String,
    pub qty: String,
    #[serde(rename = "quoteQty")]
    pub quote_qty: String,
    pub time: i64,
    #[serde(rename = "isBuyerMaker")]
    pub is_buyer_maker: bool,
}

#[derive(FromRow)]
struct DbTradeRow {
    trade_id: Uuid,
    price: Decimal,
    qty: Decimal,
    side: String,
    ts: time::OffsetDateTime,
}

/// Stable 63-bit derivation of a trade UUID. Mask off the sign bit so the
/// result is always non-negative (Binance trade ids are positive int64).
pub fn trade_id_from_uuid(uuid: Uuid) -> i64 {
    let bytes = uuid.as_bytes();
    let first8: [u8; 8] = bytes[..8].try_into().expect("uuid has 16 bytes");
    (i64::from_be_bytes(first8)) & i64::MAX
}

/// Binance semantics: `isBuyerMaker == true` means the resting (maker) side
/// was the buyer, i.e. the taker hit them by selling.
pub fn is_buyer_maker(taker_side: &str) -> bool {
    taker_side == "SELL"
}

fn clamp_trades_limit(raw: Option<i64>) -> i64 {
    raw.unwrap_or(100).clamp(1, 1000)
}

async fn trades(
    State(state): State<Arc<FapiState>>,
    Query(q): Query<TradesQuery>,
) -> Result<Json<Vec<PublicTradeResp>>, FapiError> {
    let rocky = symbol_map::binance_to_rocky(&q.symbol)
        .ok_or(FapiError::IllegalParameter)?;
    let limit = clamp_trades_limit(q.limit);

    let rows: Vec<DbTradeRow> = sqlx::query_as(
        "SELECT trade_id, price, qty, side, ts
         FROM ledger.trades
         WHERE symbol = $1
         ORDER BY ts DESC
         LIMIT $2",
    )
    .bind(rocky)
    .bind(limit)
    .fetch_all(&state.pg)
    .await
    .map_err(|_| FapiError::Unknown)?;

    let out = rows
        .into_iter()
        .map(|r| PublicTradeResp {
            id: trade_id_from_uuid(r.trade_id),
            quote_qty: (r.price * r.qty).to_string(),
            price: r.price.to_string(),
            qty: r.qty.to_string(),
            time: (r.ts.unix_timestamp_nanos() / 1_000_000) as i64,
            is_buyer_maker: is_buyer_maker(&r.side),
        })
        .collect();
    Ok(Json(out))
}
```

- [ ] **Step 4: Register route**

Replace `pub fn router(...)`:

```rust
pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .route("/fapi/v1/depth", get(depth))
        .route("/fapi/v1/ticker/bookTicker", get(book_ticker))
        .route("/fapi/v1/trades", get(trades))
        .with_state(state)
}
```

- [ ] **Step 5: Run tests + build + commit**

```bash
cargo test -p api-gateway --lib fapi::routes_market
# Expected: 4 passed.
cargo build -p api-gateway
# Expected: clean.
git add services/api-gateway/src/fapi/routes_market.rs
git commit -m "feat(api-gateway): GET /fapi/v1/trades

Reads ledger.trades ORDER BY ts DESC LIMIT n; reshapes into Binance
{id, price, qty, quoteQty, time, isBuyerMaker}. id is a stable 63-bit
derivation from the trade UUID prefix (no new crate). isBuyerMaker
inverts the taker side per Binance semantics.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `GET /fapi/v1/klines`

**Files:**
- Modify: `services/api-gateway/src/fapi/routes_market.rs`

- [ ] **Step 1: Add failing tests for interval helpers**

Inside the `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn interval_to_pg_unit_whitelists_three_values() {
        assert_eq!(interval_to_pg_unit("1m"), Some("minute"));
        assert_eq!(interval_to_pg_unit("1h"), Some("hour"));
        assert_eq!(interval_to_pg_unit("1d"), Some("day"));
        assert_eq!(interval_to_pg_unit("5m"), None);
        assert_eq!(interval_to_pg_unit("garbage"), None);
    }

    #[test]
    fn interval_to_lookback_phrase_formats_by_unit() {
        assert_eq!(interval_to_lookback_phrase(500, "minute"), "500 minutes");
        assert_eq!(interval_to_lookback_phrase(24, "hour"), "24 hours");
        assert_eq!(interval_to_lookback_phrase(7, "day"), "7 days");
    }

    #[test]
    fn close_time_offset_subtracts_one_ms() {
        assert_eq!(close_time_offset_ms("minute"), 60_000 - 1);
        assert_eq!(close_time_offset_ms("hour"),   3_600_000 - 1);
        assert_eq!(close_time_offset_ms("day"),    86_400_000 - 1);
    }
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cargo test -p api-gateway --lib fapi::routes_market::tests::interval_to_pg_unit_whitelists_three_values`
Expected: FAIL — undefined.

- [ ] **Step 3: Add helpers + handler**

Insert above `pub fn router(...)`:

```rust
// ───── /fapi/v1/klines ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct KlinesQuery {
    pub symbol: String,
    pub interval: String,
    pub limit: Option<i64>,
}

pub fn interval_to_pg_unit(interval: &str) -> Option<&'static str> {
    match interval {
        "1m" => Some("minute"),
        "1h" => Some("hour"),
        "1d" => Some("day"),
        _ => None,
    }
}

pub fn interval_to_lookback_phrase(limit: i64, unit: &str) -> String {
    // Pluralise by always emitting "<n> <unit>s"; Postgres accepts "1 minutes".
    format!("{} {}s", limit, unit)
}

pub fn close_time_offset_ms(unit: &str) -> i64 {
    match unit {
        "minute" => 60_000 - 1,
        "hour"   => 3_600_000 - 1,
        "day"    => 86_400_000 - 1,
        _ => 0,
    }
}

fn clamp_klines_limit(raw: Option<i64>) -> i64 {
    raw.unwrap_or(500).clamp(1, 1500)
}

#[allow(clippy::type_complexity)]
async fn klines(
    State(state): State<Arc<FapiState>>,
    Query(q): Query<KlinesQuery>,
) -> Result<Json<Vec<Vec<serde_json::Value>>>, FapiError> {
    let rocky = symbol_map::binance_to_rocky(&q.symbol)
        .ok_or(FapiError::IllegalParameter)?;
    let unit = interval_to_pg_unit(&q.interval).ok_or(FapiError::IllegalParameter)?;
    let limit = clamp_klines_limit(q.limit);
    let lookback = interval_to_lookback_phrase(limit, unit);

    // date_trunc unit + interval are not parameter-bindable in sqlx, so they
    // are string-interpolated. Both are whitelisted via interval_to_pg_unit().
    let sql = format!(
        "SELECT date_trunc('{unit}', ts) AS bucket,
                (array_agg(price ORDER BY ts ASC ))[1] AS open,
                MAX(price)                              AS high,
                MIN(price)                              AS low,
                (array_agg(price ORDER BY ts DESC))[1] AS close,
                SUM(qty)                                AS volume,
                SUM(price * qty)                        AS quote_volume,
                COUNT(*)                                AS trade_count,
                COALESCE(SUM(CASE WHEN side = 'BUY' THEN qty         ELSE 0 END), 0) AS taker_buy_vol,
                COALESCE(SUM(CASE WHEN side = 'BUY' THEN price * qty ELSE 0 END), 0) AS taker_buy_quote_vol
         FROM ledger.trades
         WHERE symbol = $1 AND ts > now() - interval '{lookback}'
         GROUP BY bucket
         ORDER BY bucket ASC"
    );

    let rows: Vec<(
        time::OffsetDateTime, Decimal, Decimal, Decimal, Decimal,
        Decimal, Decimal, i64, Decimal, Decimal,
    )> = sqlx::query_as(&sql)
        .bind(rocky)
        .fetch_all(&state.pg)
        .await
        .map_err(|_| FapiError::Unknown)?;

    let offset_ms = close_time_offset_ms(unit);
    let out: Vec<Vec<serde_json::Value>> = rows
        .into_iter()
        .map(|(bucket, open, high, low, close, vol, qvol, count, tbuy, tbuyq)| {
            let open_ms = (bucket.unix_timestamp_nanos() / 1_000_000) as i64;
            let close_ms = open_ms + offset_ms;
            vec![
                serde_json::json!(open_ms),
                serde_json::json!(open.to_string()),
                serde_json::json!(high.to_string()),
                serde_json::json!(low.to_string()),
                serde_json::json!(close.to_string()),
                serde_json::json!(vol.to_string()),
                serde_json::json!(close_ms),
                serde_json::json!(qvol.to_string()),
                serde_json::json!(count),
                serde_json::json!(tbuy.to_string()),
                serde_json::json!(tbuyq.to_string()),
                serde_json::json!("0"),
            ]
        })
        .collect();

    Ok(Json(out))
}
```

- [ ] **Step 4: Register route**

```rust
pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .route("/fapi/v1/depth", get(depth))
        .route("/fapi/v1/ticker/bookTicker", get(book_ticker))
        .route("/fapi/v1/trades", get(trades))
        .route("/fapi/v1/klines", get(klines))
        .with_state(state)
}
```

- [ ] **Step 5: Run tests + build + commit**

```bash
cargo test -p api-gateway --lib fapi::routes_market
# Expected: 7 passed.
cargo build -p api-gateway
# Expected: clean.
git add services/api-gateway/src/fapi/routes_market.rs
git commit -m "feat(api-gateway): GET /fapi/v1/klines

Binance nested-array kline shape, aggregated from ledger.trades via
date_trunc(unit, ts). Supports 1m / 1h / 1d intervals; other values
return -1100. Adds taker_buy_volume + taker_buy_quote_volume (Binance
fields 10/11) via CASE WHEN side='BUY'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `GET /fapi/v1/ticker/24hr`

**Files:**
- Modify: `services/api-gateway/src/fapi/routes_market.rs`

- [ ] **Step 1: Add failing test for the price-change helper**

Inside `#[cfg(test)] mod tests`, add:

```rust
    #[test]
    fn price_change_percent_handles_zero_open() {
        // No trades in window → open == 0; helper must not divide by zero.
        assert_eq!(price_change_percent_str(Decimal::ZERO, Decimal::ZERO), "0");
        assert_eq!(price_change_percent_str(Decimal::ZERO, Decimal::from(100)), "0");
    }

    #[test]
    fn price_change_percent_signs_correctly() {
        let open = Decimal::from(100);
        let close_up = Decimal::from(101);
        let close_down = Decimal::from(99);
        assert_eq!(price_change_percent_str(open, close_up),   "1.000");
        assert_eq!(price_change_percent_str(open, close_down), "-1.000");
    }
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cargo test -p api-gateway --lib fapi::routes_market::tests::price_change_percent_signs_correctly`
Expected: FAIL — undefined.

- [ ] **Step 3: Add helper + handler + DB row + response**

Insert above `pub fn router(...)`:

```rust
// ───── /fapi/v1/ticker/24hr ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct Ticker24hQuery {
    pub symbol: Option<String>,
}

#[derive(Serialize)]
pub struct Ticker24hResp {
    pub symbol: String,
    #[serde(rename = "priceChange")]
    pub price_change: String,
    #[serde(rename = "priceChangePercent")]
    pub price_change_percent: String,
    #[serde(rename = "weightedAvgPrice")]
    pub weighted_avg_price: String,
    #[serde(rename = "lastPrice")]
    pub last_price: String,
    #[serde(rename = "lastQty")]
    pub last_qty: String,
    #[serde(rename = "openPrice")]
    pub open_price: String,
    #[serde(rename = "highPrice")]
    pub high_price: String,
    #[serde(rename = "lowPrice")]
    pub low_price: String,
    pub volume: String,
    #[serde(rename = "quoteVolume")]
    pub quote_volume: String,
    #[serde(rename = "openTime")]
    pub open_time: i64,
    #[serde(rename = "closeTime")]
    pub close_time: i64,
    #[serde(rename = "firstId")]
    pub first_id: i64,
    #[serde(rename = "lastId")]
    pub last_id: i64,
    pub count: i64,
}

#[derive(FromRow)]
struct DbTicker24hRow {
    symbol: String,
    open_price: Decimal,
    last_price: Decimal,
    last_qty: Decimal,
    high: Decimal,
    low: Decimal,
    volume: Decimal,
    quote_volume: Decimal,
    weighted_avg_price: Decimal,
    trade_count: i64,
    open_time: time::OffsetDateTime,
    close_time: time::OffsetDateTime,
}

/// Format the percent change to 3 decimals; safe when `open == 0`.
pub fn price_change_percent_str(open: Decimal, close: Decimal) -> String {
    if open.is_zero() {
        return "0".to_string();
    }
    let change = close - open;
    let pct = (change / open) * Decimal::from(100);
    // Round to 3 dp without crate magic — Decimal supports round_dp.
    pct.round_dp(3).to_string()
}

async fn ticker_24hr(
    State(state): State<Arc<FapiState>>,
    Query(q): Query<Ticker24hQuery>,
) -> Result<Json<serde_json::Value>, FapiError> {
    // Translate Binance symbol to Rocky symbol when given.
    let rocky_filter: Option<String> = match q.symbol.as_deref() {
        Some(b) => {
            let r = symbol_map::binance_to_rocky(b).ok_or(FapiError::IllegalParameter)?;
            Some(r.to_string())
        }
        None => None,
    };

    let sql = "SELECT
        symbol,
        (array_agg(price ORDER BY ts ASC ))[1]  AS open_price,
        (array_agg(price ORDER BY ts DESC))[1]  AS last_price,
        (array_agg(qty   ORDER BY ts DESC))[1]  AS last_qty,
        MAX(price)                              AS high,
        MIN(price)                              AS low,
        SUM(qty)                                AS volume,
        SUM(price * qty)                        AS quote_volume,
        CASE WHEN SUM(qty) > 0 THEN SUM(price * qty) / SUM(qty) ELSE 0 END
                                                AS weighted_avg_price,
        COUNT(*)                                AS trade_count,
        MIN(ts)                                 AS open_time,
        MAX(ts)                                 AS close_time
        FROM ledger.trades
        WHERE ts > now() - interval '24 hours'
          AND ($1::text IS NULL OR symbol = $1)
        GROUP BY symbol";

    let rows: Vec<DbTicker24hRow> = sqlx::query_as(sql)
        .bind(rocky_filter.as_deref())
        .fetch_all(&state.pg)
        .await
        .map_err(|_| FapiError::Unknown)?;

    let to_resp = |r: DbTicker24hRow| -> Ticker24hResp {
        let binance_sym = symbol_map::rocky_to_binance(&r.symbol).unwrap_or(&r.symbol).to_string();
        let change = r.last_price - r.open_price;
        Ticker24hResp {
            symbol: binance_sym,
            price_change: change.to_string(),
            price_change_percent: price_change_percent_str(r.open_price, r.last_price),
            weighted_avg_price: r.weighted_avg_price.to_string(),
            last_price: r.last_price.to_string(),
            last_qty: r.last_qty.to_string(),
            open_price: r.open_price.to_string(),
            high_price: r.high.to_string(),
            low_price: r.low.to_string(),
            volume: r.volume.to_string(),
            quote_volume: r.quote_volume.to_string(),
            open_time: (r.open_time.unix_timestamp_nanos() / 1_000_000) as i64,
            close_time: (r.close_time.unix_timestamp_nanos() / 1_000_000) as i64,
            first_id: 0,
            last_id: 0,
            count: r.trade_count,
        }
    };

    if let Some(requested) = q.symbol {
        // Single-symbol form. If the GROUP BY produced nothing (no trades in
        // 24h), return a zero-row response so SDKs don't have to special-case.
        let now_ms = chrono::Utc::now().timestamp_millis();
        let resp = rows
            .into_iter()
            .next()
            .map(to_resp)
            .unwrap_or_else(|| Ticker24hResp {
                symbol: requested,
                price_change: "0".into(),
                price_change_percent: "0".into(),
                weighted_avg_price: "0".into(),
                last_price: "0".into(),
                last_qty: "0".into(),
                open_price: "0".into(),
                high_price: "0".into(),
                low_price: "0".into(),
                volume: "0".into(),
                quote_volume: "0".into(),
                open_time: now_ms,
                close_time: now_ms,
                first_id: 0,
                last_id: 0,
                count: 0,
            });
        Ok(Json(serde_json::to_value(resp).unwrap()))
    } else {
        let out: Vec<Ticker24hResp> = rows.into_iter().map(to_resp).collect();
        Ok(Json(serde_json::to_value(out).unwrap()))
    }
}
```

- [ ] **Step 4: Register route**

```rust
pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .route("/fapi/v1/depth", get(depth))
        .route("/fapi/v1/ticker/bookTicker", get(book_ticker))
        .route("/fapi/v1/trades", get(trades))
        .route("/fapi/v1/klines", get(klines))
        .route("/fapi/v1/ticker/24hr", get(ticker_24hr))
        .with_state(state)
}
```

- [ ] **Step 5: Run tests + build + commit**

```bash
cargo test -p api-gateway --lib fapi::routes_market
# Expected: 9 passed.
cargo build -p api-gateway
# Expected: clean.
git add services/api-gateway/src/fapi/routes_market.rs
git commit -m "feat(api-gateway): GET /fapi/v1/ticker/24hr

Full Binance shape (17 fields) via one SQL aggregate over ledger.trades.
Single-symbol form returns one object (with zero-row fallback when no
trades in 24h); omitted-symbol form returns an array. firstId/lastId are
synthetic 0s per the wave-0 design.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Smoke script + clippy + fmt

**Files:**
- Create: `scripts/dev/smoke-wave0.sh`
- Modify: nothing else

- [ ] **Step 1: Create the smoke script**

Write `scripts/dev/smoke-wave0.sh`:

```bash
#!/usr/bin/env bash
# wave-0 FAPI smoke — runs against the API base URL (default demo).
# Fails fast on any non-2xx response.
set -euo pipefail
BASE=${1:-https://demo.rocky.exchange}
echo "smoke base: $BASE"
echo "1/7 ping";       curl -fsS "$BASE/fapi/v1/ping"; echo
echo "2/7 time";       curl -fsS "$BASE/fapi/v1/time"; echo
echo "3/7 depth";      curl -fsS "$BASE/fapi/v1/depth?symbol=BTCUSDT&limit=10"; echo
echo "4/7 trades";     curl -fsS "$BASE/fapi/v1/trades?symbol=BTCUSDT&limit=10"; echo
echo "5/7 klines";     curl -fsS "$BASE/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=5"; echo
echo "6/7 ticker24";   curl -fsS "$BASE/fapi/v1/ticker/24hr?symbol=BTCUSDT"; echo
echo "7/7 bookTicker"; curl -fsS "$BASE/fapi/v1/ticker/bookTicker?symbol=BTCUSDT"; echo
echo "all wave-0 smoke OK"
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/dev/smoke-wave0.sh`

- [ ] **Step 3: Run clippy with deny-warnings**

Run: `cargo clippy -p api-gateway --all-targets -- -D warnings`
Expected: no warnings.

If clippy complains about anything, fix in-place. Most likely candidates:
- unused imports (remove)
- `&str` to `String` clones (use `.to_string()` consistently)
- `clippy::redundant_closure` (replace `|x| f(x)` with `f`)

- [ ] **Step 4: Run rustfmt**

Run: `cargo fmt -p api-gateway`
Expected: no diff (we wrote canonical formatting). If there is a diff, `git diff` to inspect; usually safe to accept.

- [ ] **Step 5: Run the full test suite once**

Run: `cargo test -p api-gateway`
Expected: all pre-existing tests + 11 new ones pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/dev/smoke-wave0.sh services/api-gateway/
git commit -m "chore(api-gateway): wave-0 smoke script + clippy/fmt pass

7-curl smoke against /fapi/v1/{ping,time,depth,trades,klines,ticker/24hr,
ticker/bookTicker}. Plus any incidental clippy/fmt cleanup from the
preceding handler commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Deploy + live smoke + bot monitor + push

**Files:** none modified — this task ships what's already committed.

> **Operator note:** This task touches the live EC2 instance. Run interactively and read each step's expected output before proceeding.

- [ ] **Step 1: Pre-deploy sanity**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git log --oneline @{u}..HEAD
```

Expected: ~9 commits to be pushed (T1 through T9).

- [ ] **Step 2: Build the api-gateway binary remotely**

```bash
bash scripts/dev/services-remote.sh build api-gateway
```

Expected: cargo build succeeds on EC2. Watch for any pre-existing-but-unrelated build issues — if so, abort and investigate before touching the running service.

- [ ] **Step 3: Restart api-gateway**

```bash
bash scripts/dev/services-remote.sh restart api-gateway
```

Expected: clean restart in <5 s. The matching-engine, internal-ledger, funding-scheduler, and bridge services must NOT be touched.

- [ ] **Step 4: Run smoke**

```bash
bash scripts/dev/smoke-wave0.sh
```

Expected: all 7 calls return 2xx with parseable JSON. The last line should print `all wave-0 smoke OK`.

If any call fails, the script exits non-zero — capture the failing output and STOP. Don't push.

- [ ] **Step 5: Run negative-case smoke (manual)**

```bash
curl -i 'https://demo.rocky.exchange/fapi/v1/depth?symbol=FOOUSDT'
# Expected: HTTP/1.1 400 + body {"code":-1100,"msg":"Illegal characters found in a parameter."}

curl -i 'https://demo.rocky.exchange/fapi/v1/klines?symbol=BTCUSDT&interval=5m'
# Expected: HTTP/1.1 400 + body {"code":-1100,...}

curl -i 'https://demo.rocky.exchange/fapi/v1/trades'
# Expected: HTTP/1.1 400 (axum's Query rejection — body may differ but status must be 4xx)
```

If any of these returns 200 or 5xx, something is wrong. STOP and investigate.

- [ ] **Step 6: Bot health monitor — 5 minutes**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'journalctl --user -u rocky-bot --since "5 min ago" --no-pager 2>&1 | grep -c -E "ERROR|panic|-2010" || echo 0'
```

Expected: a number similar to the 5-minute baseline. The bot calls only signed endpoints, so wave-0 changes should be invisible. A jump from baseline by >10× means rollback.

Re-run after 5 min to confirm stable.

- [ ] **Step 7: Push**

Only if Steps 4, 5, 6 are all green:

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git push origin main
```

Expected: 9 commits pushed.

- [ ] **Step 8: (Optional) Update docs-rocky** — flip these 7 endpoints from 空缺 to 已实现

Out-of-scope for this plan but worth noting: `scripts/gen_perp_docs.py` in `docs-rocky` has the manifest entries for these 7 endpoints. Switching each `stub(...)` call to `impl(...)` + adding a body string, then regenerating, will refresh the docs. Track as a follow-up.

---

## Rollback plan

If smoke fails after deploy:

1. SSH to EC2.
2. `git -C ~/rocky-backend reset --hard origin/main` (drops the new local commits on the box).
3. `bash scripts/dev/services-remote.sh build api-gateway && bash scripts/dev/services-remote.sh restart api-gateway`.
4. Verify `curl -fsS https://demo.rocky.exchange/fapi/v1/exchangeInfo` still returns 200.
5. Locally, `git reset --hard origin/main` (drops the unpushed commits — only safe because we did **not** push yet).

The bot is unaffected by any /fapi/v1/* failure because it only uses signed endpoints in `/fapi/v1/order` + `/fapi/v2/{balance,positionRisk}`.

---

## Definition of Done

- [ ] All 10 tasks above committed (9 commits in `rocky-backend` + 0 in this repo).
- [ ] `cargo build -p api-gateway` clean.
- [ ] `cargo clippy -p api-gateway --all-targets -- -D warnings` clean.
- [ ] `cargo test -p api-gateway` passes; 11 new unit tests added (2 ping/time + 9 market).
- [ ] `bash scripts/dev/smoke-wave0.sh` returns 0 against `demo.rocky.exchange`.
- [ ] 3 negative-case curls return the expected 4xx codes.
- [ ] Bot error rate ≤ pre-deploy baseline for 5 min.
- [ ] All 9 commits pushed to `origin/main`.

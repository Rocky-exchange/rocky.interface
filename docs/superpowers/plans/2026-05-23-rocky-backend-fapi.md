# rocky-backend /fapi/v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Binance Futures-compatible `/fapi/v1` REST surface on `services/api-gateway` with HMAC API-key auth, so `rocky-bot` (and any ccxt client) can sign requests against `demo.rocky.exchange/fapi/...`.

**Architecture:** New module `services/api-gateway/src/fapi/` housing symbol map, error codes, HMAC verification, an axum middleware layer reading from a new `api_keys` Postgres table, and 8 route handlers that translate Binance shapes into the existing internal logic (trading-router, ledger pg, oracle cache). New `mint_api_key` binary issues keys offline. Nginx grows one `location /fapi/` block on the existing `demo.rocky.exchange` server.

**Tech Stack:** Rust 2024, axum, sqlx (Postgres), tonic, hmac/sha2/hex (new deps), bcrypt (new dep), tower, tower-http. Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-23-rocky-bot-fapi-volume-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac is code-only. Allowed locally: `cargo build`, `cargo test`, `cargo check`, `cargo fmt`, `cargo clippy`. **NOT allowed locally:** `cargo run`, any service start, `docker`, `daml`, `canton`.
- Deploy any backend change with: `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart`. After restart, smoke from EC2 with the `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 'curl ...'` pattern.
- Nginx config edits happen on EC2 directly (sudo edit + `sudo nginx -t` + `sudo nginx -s reload`); reflect the change back into `scripts/nginx/` or a tracked file if such exists, otherwise add the snippet inline in this plan's deploy task.
- DB migrations live in `services/api-gateway/migrations/` (new dir created in Task 1). Migrator must run at api-gateway startup so EC2 restart auto-applies.

---

## File Structure

**New / created:**
- `services/api-gateway/migrations/20260523001_api_keys.sql` — `auth.api_keys` table + index
- `services/api-gateway/src/migrate.rs` — embedded migrator (mirrors `internal-ledger/src/migrate.rs`)
- `services/api-gateway/src/fapi/mod.rs` — module declarations + `router()` aggregator
- `services/api-gateway/src/fapi/symbol_map.rs` — `BTCUSDT↔BTC-PERP` translation
- `services/api-gateway/src/fapi/error.rs` — Binance error codes + `FapiError` + `IntoResponse`
- `services/api-gateway/src/fapi/sign.rs` — pure HMAC-SHA256 verify + canonical query builder
- `services/api-gateway/src/fapi/keys.rs` — `api_keys` table repository (lookup, insert)
- `services/api-gateway/src/fapi/auth.rs` — axum middleware `verify_signature`
- `services/api-gateway/src/fapi/routes_public.rs` — `exchangeInfo` + `ticker/price`
- `services/api-gateway/src/fapi/routes_orders.rs` — POST/DELETE/GET `/order` + `openOrders`
- `services/api-gateway/src/fapi/routes_account.rs` — `/v2/balance` + `/v2/positionRisk`
- `services/api-gateway/src/bin/mint_api_key.rs` — CLI binary
- `services/api-gateway/tests/fapi_signing.rs` — integration test of signing + a public + a signed endpoint
- `scripts/nginx/demo-fapi.snippet.conf` — the `location /fapi/` block (committed for reproducibility)

**Modified:**
- `services/api-gateway/Cargo.toml` — add `hmac`, `sha2`, `bcrypt`, `rand` deps
- `services/api-gateway/src/lib.rs` — declare `pub mod fapi; pub mod migrate;`; mount fapi router from `build_router_with_dev`
- `services/api-gateway/src/main.rs` — call `migrate::run(&pg).await?` after pool created
- `services/api-gateway/src/config.rs` — no change (api_keys uses existing `pg_url`)

---

## Task 1: Migration `api_keys` table + migrator wiring

**Files:**
- Create: `services/api-gateway/migrations/20260523001_api_keys.sql`
- Create: `services/api-gateway/src/migrate.rs`
- Modify: `services/api-gateway/src/lib.rs` (add `pub mod migrate;`)
- Modify: `services/api-gateway/src/main.rs` (call migrator after pool create)
- Modify: `services/api-gateway/Cargo.toml` (no change needed — sqlx already a dep with `macros` feature)

- [ ] **Step 1.1: Write migration SQL**

Create `services/api-gateway/migrations/20260523001_api_keys.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS auth;
SET search_path = auth;

CREATE TABLE api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL,
    key          TEXT NOT NULL UNIQUE,
    -- Plaintext shared secret. v1 trade-off: enables HMAC verify without
    -- a separate KMS or pgcrypto setup; accepts that a db read leaks
    -- secrets. For higher security, switch to encrypted-at-rest column
    -- (pgcrypto) or migrate to a dedicated KMS in v2.
    secret       TEXT NOT NULL,
    label        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX api_keys_key_active_idx ON api_keys(key) WHERE revoked_at IS NULL;
```

- [ ] **Step 1.2: Create migrator module**

Create `services/api-gateway/src/migrate.rs`:

```rust
//! Embed the migrations directory at compile time, run them at startup.

use sqlx::PgPool;
use sqlx::migrate::Migrator;

pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

pub async fn run(pool: &PgPool) -> anyhow::Result<()> {
    MIGRATOR.run(pool).await?;
    Ok(())
}
```

- [ ] **Step 1.3: Wire `pub mod migrate;` in lib.rs**

In `services/api-gateway/src/lib.rs`, add `pub mod migrate;` next to the other `pub mod` declarations at the top.

- [ ] **Step 1.4: Call migrator on startup**

In `services/api-gateway/src/main.rs`, immediately after the `PgPoolOptions::new()...connect(&cfg.pg_url).await?` line, insert:

```rust
    api_gateway::migrate::run(&pg).await?;
    info!("api-gateway migrations applied");
```

- [ ] **Step 1.5: Build + commit**

```bash
cargo build -p api-gateway
git add services/api-gateway/migrations/20260523001_api_keys.sql \
        services/api-gateway/src/migrate.rs \
        services/api-gateway/src/lib.rs \
        services/api-gateway/src/main.rs
git commit -m "feat(api-gateway): add auth.api_keys table + embedded migrator"
```

---

## Task 2: Add crypto dependencies

**Files:**
- Modify: `services/api-gateway/Cargo.toml`

Design choice locked: secrets stored plaintext in `auth.api_keys.secret`. Documented trade-off in the migration (Task 1). No bcrypt needed. Constant-time compare uses `subtle`.

- [ ] **Step 2.1: Add deps**

Append under `[dependencies]` in `services/api-gateway/Cargo.toml`:

```toml
hmac = "0.12"
sha2 = "0.10"
rand = "0.8"
subtle = "2.5"
```

- [ ] **Step 2.2: Build to fetch + verify versions**

```bash
cargo build -p api-gateway
```

- [ ] **Step 2.3: Commit**

```bash
git add services/api-gateway/Cargo.toml Cargo.lock
git commit -m "feat(api-gateway): add hmac/sha2/rand/subtle deps for /fapi"
```

---

## Task 3: Symbol map module

**Files:**
- Create: `services/api-gateway/src/fapi/mod.rs`
- Create: `services/api-gateway/src/fapi/symbol_map.rs`
- Modify: `services/api-gateway/src/lib.rs` (declare `pub mod fapi;`)

- [ ] **Step 3.1: Create empty fapi/mod.rs**

Create `services/api-gateway/src/fapi/mod.rs`:

```rust
pub mod symbol_map;
```

- [ ] **Step 3.2: Declare `pub mod fapi;` in lib.rs**

In `services/api-gateway/src/lib.rs`, add `pub mod fapi;` next to `pub mod routes;`.

- [ ] **Step 3.3: Implement symbol_map with tests**

Create `services/api-gateway/src/fapi/symbol_map.rs`:

```rust
//! Binance ↔ Rocky symbol translation. Single source of truth for
//! the correspondence between Binance pair names (BTCUSDT) and Rocky
//! internal symbols (BTC-PERP).

/// Pairs supported on `/fapi`. Add a row to extend.
const PAIRS: &[(&str, &str)] = &[
    ("BTCUSDT", "BTC-PERP"),
    ("ETHUSDT", "ETH-PERP"),
];

/// Returns the Rocky symbol for a Binance pair, or None if unknown.
pub fn binance_to_rocky(binance: &str) -> Option<&'static str> {
    PAIRS.iter().find(|(b, _)| *b == binance).map(|(_, r)| *r)
}

/// Returns the Binance pair for a Rocky symbol, or None if unknown.
pub fn rocky_to_binance(rocky: &str) -> Option<&'static str> {
    PAIRS.iter().find(|(_, r)| *r == rocky).map(|(b, _)| *b)
}

/// All pairs, for `exchangeInfo` enumeration.
pub fn all_pairs() -> impl Iterator<Item = (&'static str, &'static str)> {
    PAIRS.iter().copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_btc() {
        assert_eq!(binance_to_rocky("BTCUSDT"), Some("BTC-PERP"));
        assert_eq!(rocky_to_binance("BTC-PERP"), Some("BTCUSDT"));
    }

    #[test]
    fn round_trip_eth() {
        assert_eq!(binance_to_rocky("ETHUSDT"), Some("ETH-PERP"));
        assert_eq!(rocky_to_binance("ETH-PERP"), Some("ETHUSDT"));
    }

    #[test]
    fn unknown_returns_none() {
        assert_eq!(binance_to_rocky("FOOUSDT"), None);
        assert_eq!(rocky_to_binance("FOO-PERP"), None);
    }

    #[test]
    fn all_pairs_count() {
        assert_eq!(all_pairs().count(), 2);
    }
}
```

- [ ] **Step 3.4: Test + commit**

```bash
cargo test -p api-gateway fapi::symbol_map
# expect: 4 passed
git add services/api-gateway/src/fapi/mod.rs \
        services/api-gateway/src/fapi/symbol_map.rs \
        services/api-gateway/src/lib.rs
git commit -m "feat(api-gateway): fapi symbol map BTCUSDT↔BTC-PERP"
```

---

## Task 4: Binance error code module + `FapiError`

**Files:**
- Create: `services/api-gateway/src/fapi/error.rs`
- Modify: `services/api-gateway/src/fapi/mod.rs` (add `pub mod error;`)

- [ ] **Step 4.1: Add `pub mod error;` to fapi/mod.rs**

In `services/api-gateway/src/fapi/mod.rs`, append `pub mod error;`.

- [ ] **Step 4.2: Implement error module with tests**

Create `services/api-gateway/src/fapi/error.rs`:

```rust
//! Binance Futures error code subset. Spec table:
//!   -1000 / 500: UNKNOWN
//!   -1021 / 401: timestamp outside recvWindow
//!   -1022 / 401: signature invalid
//!   -1100 / 400: illegal parameter
//!   -1102 / 400: mandatory parameter missing
//!   -2010 / 422: insufficient balance
//!   -2011 / 422: unknown order
//!   -2014 / 400: API-key format invalid
//!   -2015 / 401: invalid API-key

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Debug, Clone, Copy)]
pub enum FapiError {
    Unknown,
    TimestampOutsideRecvWindow,
    SignatureInvalid,
    IllegalParameter,
    MandatoryParameterMissing,
    InsufficientBalance,
    UnknownOrder,
    ApiKeyFormatInvalid,
    InvalidApiKey,
}

impl FapiError {
    pub fn code(&self) -> i32 {
        use FapiError::*;
        match self {
            Unknown => -1000,
            TimestampOutsideRecvWindow => -1021,
            SignatureInvalid => -1022,
            IllegalParameter => -1100,
            MandatoryParameterMissing => -1102,
            InsufficientBalance => -2010,
            UnknownOrder => -2011,
            ApiKeyFormatInvalid => -2014,
            InvalidApiKey => -2015,
        }
    }

    pub fn http_status(&self) -> StatusCode {
        use FapiError::*;
        match self {
            Unknown => StatusCode::INTERNAL_SERVER_ERROR,
            TimestampOutsideRecvWindow | SignatureInvalid | InvalidApiKey => StatusCode::UNAUTHORIZED,
            IllegalParameter | MandatoryParameterMissing | ApiKeyFormatInvalid => StatusCode::BAD_REQUEST,
            InsufficientBalance | UnknownOrder => StatusCode::UNPROCESSABLE_ENTITY,
        }
    }

    pub fn msg(&self) -> &'static str {
        use FapiError::*;
        match self {
            Unknown => "An unknown error occurred while processing the request.",
            TimestampOutsideRecvWindow => "Timestamp for this request is outside of the recvWindow.",
            SignatureInvalid => "Signature for this request is not valid.",
            IllegalParameter => "Illegal characters found in a parameter.",
            MandatoryParameterMissing => "Mandatory parameter was not sent, was empty/null, or malformed.",
            InsufficientBalance => "Account has insufficient balance for requested action.",
            UnknownOrder => "Order does not exist.",
            ApiKeyFormatInvalid => "API-key format invalid.",
            InvalidApiKey => "Invalid API-key, IP, or permissions for action.",
        }
    }
}

#[derive(Serialize)]
struct ErrorBody {
    code: i32,
    msg: &'static str,
}

impl IntoResponse for FapiError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            code: self.code(),
            msg: self.msg(),
        };
        (self.http_status(), Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signature_invalid_is_401_and_minus_1022() {
        let e = FapiError::SignatureInvalid;
        assert_eq!(e.code(), -1022);
        assert_eq!(e.http_status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn insufficient_balance_is_422_and_minus_2010() {
        let e = FapiError::InsufficientBalance;
        assert_eq!(e.code(), -2010);
        assert_eq!(e.http_status(), StatusCode::UNPROCESSABLE_ENTITY);
    }
}
```

- [ ] **Step 4.3: Test + commit**

```bash
cargo test -p api-gateway fapi::error
# expect: 2 passed
git add services/api-gateway/src/fapi/error.rs services/api-gateway/src/fapi/mod.rs
git commit -m "feat(api-gateway): fapi Binance error code subset"
```

---

## Task 5: HMAC-SHA256 signature verification (pure fn)

**Files:**
- Create: `services/api-gateway/src/fapi/sign.rs`
- Modify: `services/api-gateway/src/fapi/mod.rs`

- [ ] **Step 5.1: Add `pub mod sign;`**

Append `pub mod sign;` to `services/api-gateway/src/fapi/mod.rs`.

- [ ] **Step 5.2: Implement sign module with golden vector test**

Binance's reference example (from their docs, "Endpoint Security Type"):

- secret: `NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j`
- query: `symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559`
- expected signature: `c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71`

Create `services/api-gateway/src/fapi/sign.rs`:

```rust
//! HMAC-SHA256 over the canonical query string (Binance convention).

use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// Compute HMAC-SHA256(secret, payload) and return lowercase hex.
pub fn sign(secret: &str, payload: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Constant-time comparison of two hex-encoded signatures.
/// Returns true on match.
pub fn verify(secret: &str, payload: &str, provided_hex: &str) -> bool {
    let expected = sign(secret, payload);
    expected.as_bytes().ct_eq(provided_hex.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binance_docs_golden_vector() {
        let secret = "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j";
        let query = "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559";
        let expected = "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71";
        assert_eq!(sign(secret, query), expected);
    }

    #[test]
    fn verify_match() {
        let secret = "abc";
        let payload = "hello";
        let sig = sign(secret, payload);
        assert!(verify(secret, payload, &sig));
    }

    #[test]
    fn verify_mismatch_wrong_secret() {
        assert!(!verify("abc", "hello", &sign("xyz", "hello")));
    }

    #[test]
    fn verify_mismatch_wrong_payload() {
        assert!(!verify("abc", "hello", &sign("abc", "goodbye")));
    }

    #[test]
    fn verify_mismatch_wrong_length() {
        assert!(!verify("abc", "hello", "deadbeef"));
    }
}
```

- [ ] **Step 5.3: Test + commit**

```bash
cargo test -p api-gateway fapi::sign
# expect: 5 passed (including binance_docs_golden_vector)
git add services/api-gateway/src/fapi/sign.rs services/api-gateway/src/fapi/mod.rs
git commit -m "feat(api-gateway): fapi HMAC-SHA256 sign/verify with Binance golden vector test"
```

---

## Task 6: `api_keys` repository (pg lookup + insert)

**Files:**
- Create: `services/api-gateway/src/fapi/keys.rs`
- Modify: `services/api-gateway/src/fapi/mod.rs`

- [ ] **Step 6.1: Add `pub mod keys;`**

Append `pub mod keys;` to `services/api-gateway/src/fapi/mod.rs`.

- [ ] **Step 6.2: Implement keys.rs**

Create `services/api-gateway/src/fapi/keys.rs`:

```rust
//! Repository over the auth.api_keys table.
//!
//! Schema:
//!   id UUID, user_id UUID, key TEXT UNIQUE, secret TEXT (plaintext, see
//!   migration comment), label TEXT?, created_at, revoked_at?

use anyhow::Result;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

#[derive(Debug, FromRow, Clone)]
pub struct ApiKeyRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub key: String,
    /// Plaintext shared secret. See migration 20260523001_api_keys.sql for
    /// the v1 storage trade-off (KMS / pgcrypto deferred to v2).
    pub secret: String,
    pub label: Option<String>,
}

/// Lookup an active (not revoked) key. Returns the row or None.
pub async fn find_active_by_key(pool: &PgPool, key: &str) -> Result<Option<ApiKeyRow>> {
    let row: Option<ApiKeyRow> = sqlx::query_as(
        "SELECT id, user_id, key, secret, label
         FROM auth.api_keys
         WHERE key = $1 AND revoked_at IS NULL
         LIMIT 1",
    )
    .bind(key)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Insert a new key. Returns the row id.
pub async fn insert(
    pool: &PgPool,
    user_id: Uuid,
    key: &str,
    secret: &str,
    label: Option<&str>,
) -> Result<Uuid> {
    let (id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO auth.api_keys (user_id, key, secret, label)
         VALUES ($1, $2, $3, $4)
         RETURNING id",
    )
    .bind(user_id)
    .bind(key)
    .bind(secret)
    .bind(label)
    .fetch_one(pool)
    .await?;
    Ok(id)
}

/// Generate a random 32-byte hex string suitable for keys/secrets.
pub fn random_64_hex() -> String {
    use rand::RngCore;
    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    hex::encode(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_64_hex_is_64_chars() {
        let s = random_64_hex();
        assert_eq!(s.len(), 64);
        assert!(s.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn two_random_keys_differ() {
        assert_ne!(random_64_hex(), random_64_hex());
    }
}
```

- [ ] **Step 6.3: Test + commit**

```bash
cargo test -p api-gateway fapi::keys
# expect: 2 passed (db-touching paths covered by Task 14 e2e)
git add services/api-gateway/src/fapi/keys.rs services/api-gateway/src/fapi/mod.rs
git commit -m "feat(api-gateway): fapi api_keys repository + random key gen"
```

---

## Task 7: HMAC auth middleware (axum layer)

**Files:**
- Create: `services/api-gateway/src/fapi/auth.rs`
- Modify: `services/api-gateway/src/fapi/mod.rs`

Design note: middleware reads `X-MBX-APIKEY`, looks up the row in `auth.api_keys`, takes the plaintext `secret`, recomputes HMAC-SHA256 over `<query_no_sig>[&<body_no_sig>]`, and constant-time-compares with the `signature=` query param. On success it injects `AuthedKey { user_id, key_id }` into request extensions; downstream handlers `Extension(auth): Extension<AuthedKey>` to get the principal.

- [ ] **Step 7.1: Add `pub mod auth;` and `pub struct FapiState`**

Replace `services/api-gateway/src/fapi/mod.rs` with:

```rust
pub mod auth;
pub mod error;
pub mod keys;
pub mod sign;
pub mod symbol_map;

use sqlx::PgPool;
use std::sync::Arc;

/// Shared state for /fapi routes and middleware.
pub struct FapiState {
    pub pg: PgPool,
    /// Default recvWindow when client omits it (Binance default 5000ms).
    pub default_recv_window_ms: i64,
    /// Hard cap on recvWindow regardless of what the client sends (Binance: 60_000).
    pub max_recv_window_ms: i64,
}

impl FapiState {
    pub fn new(pg: PgPool) -> Arc<Self> {
        Arc::new(Self {
            pg,
            default_recv_window_ms: 5_000,
            max_recv_window_ms: 60_000,
        })
    }
}

/// Authenticated principal injected by middleware into request extensions.
#[derive(Debug, Clone)]
pub struct AuthedKey {
    pub user_id: uuid::Uuid,
    pub key_id: uuid::Uuid,
}
```

- [ ] **Step 7.2: Implement auth middleware**

Create `services/api-gateway/src/fapi/auth.rs`:

```rust
//! Axum middleware that verifies Binance-style HMAC API-key auth.

use std::sync::Arc;

use axum::{
    body::{Body, to_bytes},
    extract::{Request, State},
    http::HeaderMap,
    middleware::Next,
    response::Response,
};

use super::{AuthedKey, FapiState, error::FapiError, keys, sign};

const MAX_BODY_BYTES: usize = 64 * 1024;

pub async fn verify_signature(
    State(state): State<Arc<FapiState>>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, FapiError> {
    let api_key = extract_api_key(&headers)?;

    let (parts, body) = request.into_parts();
    let body_bytes = to_bytes(body, MAX_BODY_BYTES)
        .await
        .map_err(|_| FapiError::IllegalParameter)?;

    let query = parts.uri.query().unwrap_or("").to_string();
    let body_str = std::str::from_utf8(&body_bytes)
        .map_err(|_| FapiError::IllegalParameter)?
        .to_string();

    let (canonical, provided_sig) = split_signature(&query, &body_str)?;
    let (timestamp_ms, recv_window_ms) = parse_timing(
        &canonical,
        state.default_recv_window_ms,
        state.max_recv_window_ms,
    )?;

    let now_ms = chrono::Utc::now().timestamp_millis();
    if (now_ms - timestamp_ms).abs() > recv_window_ms {
        return Err(FapiError::TimestampOutsideRecvWindow);
    }

    let key_row = keys::find_active_by_key(&state.pg, &api_key)
        .await
        .map_err(|_| FapiError::Unknown)?
        .ok_or(FapiError::InvalidApiKey)?;

    if !sign::verify(&key_row.secret, &canonical, &provided_sig) {
        return Err(FapiError::SignatureInvalid);
    }

    let mut request = Request::from_parts(parts, Body::from(body_bytes));
    request.extensions_mut().insert(AuthedKey {
        user_id: key_row.user_id,
        key_id: key_row.id,
    });

    Ok(next.run(request).await)
}

fn extract_api_key(headers: &HeaderMap) -> Result<String, FapiError> {
    let k = headers
        .get("X-MBX-APIKEY")
        .and_then(|v| v.to_str().ok())
        .ok_or(FapiError::ApiKeyFormatInvalid)?;
    if k.is_empty()
        || k.len() > 256
        || !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(FapiError::ApiKeyFormatInvalid);
    }
    Ok(k.to_string())
}

/// Split `query` + `body` into (canonical_payload_without_signature, signature_hex).
/// Canonical = `query_no_sig` if non-empty, else `body_no_sig`. If both non-empty,
/// concat with `&`. Signature must be the *last* `signature=` occurrence.
fn split_signature(query: &str, body: &str) -> Result<(String, String), FapiError> {
    let combined = match (query.is_empty(), body.is_empty()) {
        (true, true) => return Err(FapiError::MandatoryParameterMissing),
        (false, true) => query.to_string(),
        (true, false) => body.to_string(),
        (false, false) => format!("{query}&{body}"),
    };
    let (head, sig) = combined
        .rsplit_once("&signature=")
        .or_else(|| combined.strip_prefix("signature=").map(|s| ("", s)))
        .ok_or(FapiError::MandatoryParameterMissing)?;
    if sig.is_empty() || !sig.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(FapiError::SignatureInvalid);
    }
    Ok((head.to_string(), sig.to_string()))
}

/// Parse `timestamp` (required) + `recvWindow` (optional) from canonical payload.
fn parse_timing(payload: &str, default_recv: i64, max_recv: i64) -> Result<(i64, i64), FapiError> {
    let mut timestamp = None;
    let mut recv = default_recv;
    for pair in payload.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            match k {
                "timestamp" => timestamp = v.parse::<i64>().ok(),
                "recvWindow" => {
                    let parsed = v.parse::<i64>().map_err(|_| FapiError::IllegalParameter)?;
                    if parsed < 0 || parsed > max_recv {
                        return Err(FapiError::IllegalParameter);
                    }
                    recv = parsed;
                }
                _ => {}
            }
        }
    }
    Ok((timestamp.ok_or(FapiError::MandatoryParameterMissing)?, recv))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_signature_query_only() {
        let (p, s) = split_signature("a=1&b=2&signature=deadbeef", "").unwrap();
        assert_eq!(p, "a=1&b=2");
        assert_eq!(s, "deadbeef");
    }

    #[test]
    fn split_signature_body_only() {
        let (p, s) = split_signature("", "a=1&signature=cafe").unwrap();
        assert_eq!(p, "a=1");
        assert_eq!(s, "cafe");
    }

    #[test]
    fn split_signature_query_and_body() {
        let (p, s) = split_signature("a=1", "b=2&signature=beef").unwrap();
        assert_eq!(p, "a=1&b=2");
        assert_eq!(s, "beef");
    }

    #[test]
    fn split_signature_missing() {
        assert!(matches!(
            split_signature("a=1&b=2", ""),
            Err(FapiError::MandatoryParameterMissing)
        ));
    }

    #[test]
    fn split_signature_nonhex() {
        assert!(matches!(
            split_signature("a=1&signature=xyz!", ""),
            Err(FapiError::SignatureInvalid)
        ));
    }

    #[test]
    fn parse_timing_uses_default_recv() {
        let (ts, recv) = parse_timing("timestamp=1234567890", 5000, 60000).unwrap();
        assert_eq!(ts, 1234567890);
        assert_eq!(recv, 5000);
    }

    #[test]
    fn parse_timing_caps_recv() {
        assert!(matches!(
            parse_timing("timestamp=1&recvWindow=99999", 5000, 60000),
            Err(FapiError::IllegalParameter)
        ));
    }

    #[test]
    fn parse_timing_missing_timestamp() {
        assert!(matches!(
            parse_timing("a=1", 5000, 60000),
            Err(FapiError::MandatoryParameterMissing)
        ));
    }
}
```

- [ ] **Step 7.3: Test + commit**

```bash
cargo test -p api-gateway fapi::
# expect: all sign + keys + symbol_map + error + auth unit tests pass
cargo clippy -p api-gateway -- -D warnings
git add services/api-gateway/src/fapi/
git commit -m "feat(api-gateway): fapi HMAC verify_signature middleware"
```

---

## Task 8: `mint_api_key` binary

**Files:**
- Create: `services/api-gateway/src/bin/mint_api_key.rs`

- [ ] **Step 8.1: Implement binary**

Create `services/api-gateway/src/bin/mint_api_key.rs`:

```rust
//! CLI to issue a new /fapi API key.
//!
//! Usage:
//!   PG_URL=... cargo run --bin mint_api_key -- \
//!     --user-id <uuid> [--label "MM bot"]
//!
//!   PG_URL=... cargo run --bin mint_api_key -- \
//!     --new-user [--label "MM bot"]    # also inserts users row, prints user_id
//!
//! Output to stdout (one line each):
//!   user_id: <uuid>
//!   key:     <64 hex>
//!   secret:  <64 hex>
//!
//! Secret is shown ONCE and not retrievable later.

use anyhow::{Context, Result, anyhow};
use api_gateway::fapi::keys;
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let mut user_id_opt: Option<Uuid> = None;
    let mut new_user = false;
    let mut label: Option<String> = None;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--user-id" => {
                let v = args.get(i + 1).ok_or_else(|| anyhow!("--user-id needs value"))?;
                user_id_opt = Some(v.parse()?);
                i += 2;
            }
            "--new-user" => {
                new_user = true;
                i += 1;
            }
            "--label" => {
                label = Some(args.get(i + 1).ok_or_else(|| anyhow!("--label needs value"))?.clone());
                i += 2;
            }
            "-h" | "--help" => {
                eprintln!("see file header comment for usage");
                return Ok(());
            }
            other => return Err(anyhow!("unknown arg: {other}")),
        }
    }

    let pg_url = std::env::var("PG_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .context("PG_URL or DATABASE_URL must be set")?;
    let pool = PgPoolOptions::new().max_connections(1).connect(&pg_url).await?;

    let user_id = match (user_id_opt, new_user) {
        (Some(u), false) => u,
        (None, true) => {
            let u = Uuid::new_v4();
            // We do NOT touch a users table — rocky-backend has no central
            // `users` table yet (Plan 6 will introduce one). The bot only
            // needs a UUID that's unique across positions/orders/trades,
            // which any new UUID satisfies.
            u
        }
        (Some(_), true) => return Err(anyhow!("pass either --user-id or --new-user, not both")),
        (None, false) => return Err(anyhow!("must pass --user-id <uuid> or --new-user")),
    };

    let key = keys::random_64_hex();
    let secret = keys::random_64_hex();
    let id = keys::insert(&pool, user_id, &key, &secret, label.as_deref()).await?;

    println!("user_id: {user_id}");
    println!("key:     {key}");
    println!("secret:  {secret}");
    eprintln!("(key row id: {id})");
    eprintln!("WARNING: save the secret now — it cannot be retrieved later.");
    Ok(())
}
```

- [ ] **Step 8.2: Build + commit**

```bash
cargo build -p api-gateway --bin mint_api_key
git add services/api-gateway/src/bin/mint_api_key.rs
git commit -m "feat(api-gateway): mint_api_key CLI binary"
```

---

## Task 9: Public endpoints — `exchangeInfo` + `ticker/price`

**Files:**
- Create: `services/api-gateway/src/fapi/routes_public.rs`
- Modify: `services/api-gateway/src/fapi/mod.rs`

- [ ] **Step 9.1: Add `pub mod routes_public;` to fapi/mod.rs**

Append to `services/api-gateway/src/fapi/mod.rs`:

```rust
pub mod routes_public;
```

- [ ] **Step 9.2: Implement public routes**

Create `services/api-gateway/src/fapi/routes_public.rs`:

```rust
//! Public (no-auth) endpoints: exchangeInfo + ticker/price.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Query, State},
    routing::get,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use super::{FapiState, error::FapiError, symbol_map};

#[derive(Serialize)]
pub struct ExchangeInfo {
    pub timezone: &'static str,
    #[serde(rename = "serverTime")]
    pub server_time: i64,
    pub symbols: Vec<SymbolInfo>,
}

#[derive(Serialize)]
pub struct SymbolInfo {
    pub symbol: String,           // BTCUSDT
    pub pair: String,             // BTC-PERP (rocky internal)
    pub status: &'static str,     // "TRADING"
    #[serde(rename = "baseAsset")]
    pub base_asset: String,
    #[serde(rename = "quoteAsset")]
    pub quote_asset: String,
    #[serde(rename = "pricePrecision")]
    pub price_precision: u32,
    #[serde(rename = "quantityPrecision")]
    pub quantity_precision: u32,
}

async fn exchange_info() -> Json<ExchangeInfo> {
    let symbols = symbol_map::all_pairs()
        .map(|(binance, rocky)| {
            let (base, _quote) = rocky.split_once('-').unwrap_or((rocky, "PERP"));
            SymbolInfo {
                symbol: binance.to_string(),
                pair: rocky.to_string(),
                status: "TRADING",
                base_asset: base.to_string(),
                quote_asset: "USDT".to_string(),
                price_precision: 2,
                quantity_precision: 3,
            }
        })
        .collect();
    Json(ExchangeInfo {
        timezone: "UTC",
        server_time: chrono::Utc::now().timestamp_millis(),
        symbols,
    })
}

#[derive(Deserialize)]
pub struct TickerPriceQuery {
    pub symbol: Option<String>,
}

#[derive(Serialize)]
pub struct TickerPrice {
    pub symbol: String,
    pub price: String,
    pub time: i64,
}

async fn ticker_price(
    State(state): State<Arc<FapiState>>,
    Query(q): Query<TickerPriceQuery>,
) -> Result<Json<serde_json::Value>, FapiError> {
    if let Some(binance_symbol) = q.symbol {
        let rocky = symbol_map::binance_to_rocky(&binance_symbol)
            .ok_or(FapiError::IllegalParameter)?;
        let t = fetch_one(&state.pg, &binance_symbol, rocky).await?;
        Ok(Json(serde_json::to_value(t).unwrap()))
    } else {
        let mut out = Vec::new();
        for (binance, rocky) in symbol_map::all_pairs() {
            out.push(fetch_one(&state.pg, binance, rocky).await?);
        }
        Ok(Json(serde_json::to_value(out).unwrap()))
    }
}

async fn fetch_one(pg: &PgPool, binance: &str, rocky: &str) -> Result<TickerPrice, FapiError> {
    let row: Option<(Decimal,)> = sqlx::query_as(
        "SELECT price FROM ledger.trades WHERE symbol = $1 ORDER BY ts DESC LIMIT 1",
    )
    .bind(rocky)
    .fetch_optional(pg)
    .await
    .map_err(|_| FapiError::Unknown)?;
    Ok(TickerPrice {
        symbol: binance.to_string(),
        price: row.map(|(p,)| p.to_string()).unwrap_or_else(|| "0".into()),
        time: chrono::Utc::now().timestamp_millis(),
    })
}

pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .route("/fapi/v1/exchangeInfo", get(exchange_info))
        .route("/fapi/v1/ticker/price", get(ticker_price))
        .with_state(state)
}
```

- [ ] **Step 9.3: Build + commit**

```bash
cargo build -p api-gateway
git add services/api-gateway/src/fapi/mod.rs services/api-gateway/src/fapi/routes_public.rs
git commit -m "feat(api-gateway): fapi public endpoints exchangeInfo + ticker/price"
```

---

## Task 10: Order endpoints — POST / DELETE / GET / openOrders

**Files:**
- Create: `services/api-gateway/src/fapi/routes_orders.rs`
- Modify: `services/api-gateway/src/fapi/mod.rs`

- [ ] **Step 10.1: Add module declaration**

Append `pub mod routes_orders;` to `services/api-gateway/src/fapi/mod.rs`.

- [ ] **Step 10.2: Implement order routes**

Create `services/api-gateway/src/fapi/routes_orders.rs`:

```rust
//! Signed order endpoints: POST/DELETE/GET /fapi/v1/order, GET /fapi/v1/openOrders.

use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    routing::{delete, get, post},
};
use rocky_proto::common;
use rocky_proto::trading_v1::{self as tv1};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use tokio::sync::Mutex;
use tonic::transport::Channel;
use uuid::Uuid;

use crate::routes::orders::TradingClient;

use super::{AuthedKey, FapiState, error::FapiError, symbol_map};

#[derive(Deserialize)]
pub struct PlaceOrderQuery {
    pub symbol: String, // Binance form, e.g. BTCUSDT
    pub side: String,   // BUY | SELL
    #[serde(rename = "type")]
    pub order_type: String, // LIMIT | MARKET
    pub quantity: String,
    pub price: Option<String>,        // required for LIMIT
    #[serde(rename = "newClientOrderId")]
    pub new_client_order_id: Option<String>,
    // signature/timestamp/recvWindow already consumed by middleware
}

#[derive(Serialize)]
pub struct OrderResp {
    #[serde(rename = "orderId")]
    pub order_id: String,
    #[serde(rename = "clientOrderId")]
    pub client_order_id: String,
    pub symbol: String,
    pub status: String, // NEW
    pub side: String,
    #[serde(rename = "type")]
    pub order_type: String,
    pub price: String,
    #[serde(rename = "origQty")]
    pub orig_qty: String,
    #[serde(rename = "updateTime")]
    pub update_time: i64,
}

pub struct OrdersDeps {
    pub trading: TradingClient,
    pub pg: PgPool,
}

async fn place_order(
    Extension(auth): Extension<AuthedKey>,
    State(deps): State<Arc<OrdersDeps>>,
    Query(q): Query<PlaceOrderQuery>,
) -> Result<Json<OrderResp>, FapiError> {
    let rocky_symbol = symbol_map::binance_to_rocky(&q.symbol)
        .ok_or(FapiError::IllegalParameter)?;
    let side = match q.side.as_str() {
        "BUY" => tv1::Side::Buy as i32,
        "SELL" => tv1::Side::Sell as i32,
        _ => return Err(FapiError::IllegalParameter),
    };
    let price = match q.order_type.as_str() {
        "LIMIT" => q.price.clone().ok_or(FapiError::MandatoryParameterMissing)?,
        // Internal trading API does not have a market type — emulate by
        // posting at far-from-mid price. To keep this v1 minimal, also
        // accept LIMIT and treat MARKET as LIMIT with price = quantity-as-IOC.
        // For now, bot will use LIMIT only when MARKET is requested.
        "MARKET" => {
            // Reject for v1 until trading-router has a MARKET type. The bot's
            // taker loop will use LIMIT at an aggressive price (cross the book)
            // until then. Documented in plan task 10.
            return Err(FapiError::IllegalParameter);
        }
        _ => return Err(FapiError::IllegalParameter),
    };
    let client_id = q.new_client_order_id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());

    let req = tv1::PlaceOrderRequest {
        idempotency_key: client_id.clone(),
        user_id: Some(common::Uuid {
            hex: hex::encode(auth.user_id.as_bytes()),
        }),
        symbol: rocky_symbol.to_string(),
        side,
        price: Some(common::Decimal { value: price.clone() }),
        qty: Some(common::Decimal { value: q.quantity.clone() }),
        leverage: 10, // default until /v1/leverage endpoint lands
    };
    let mut c = deps.trading.lock().await;
    let resp = c
        .place_order(req)
        .await
        .map_err(|s| grpc_to_fapi(s))?
        .into_inner();
    let order_id = resp.order_id.map(|u| u.hex).unwrap_or_default();

    Ok(Json(OrderResp {
        order_id,
        client_order_id: client_id,
        symbol: q.symbol,
        status: "NEW".into(),
        side: q.side,
        order_type: q.order_type,
        price,
        orig_qty: q.quantity,
        update_time: chrono::Utc::now().timestamp_millis(),
    }))
}

#[derive(Deserialize)]
pub struct CancelOrderQuery {
    pub symbol: String,
    #[serde(rename = "orderId")]
    pub order_id: String,
}

#[derive(Serialize)]
pub struct CancelResp {
    pub symbol: String,
    #[serde(rename = "orderId")]
    pub order_id: String,
    pub status: &'static str,
}

async fn cancel_order(
    Extension(auth): Extension<AuthedKey>,
    State(deps): State<Arc<OrdersDeps>>,
    Query(q): Query<CancelOrderQuery>,
) -> Result<Json<CancelResp>, FapiError> {
    // ensure symbol is known + map; even if backend doesn't filter on it,
    // we validate to match Binance shape
    let _ = symbol_map::binance_to_rocky(&q.symbol).ok_or(FapiError::IllegalParameter)?;
    let order_uuid: Uuid = q.order_id.parse().map_err(|_| FapiError::IllegalParameter)?;

    let req = tv1::CancelOrderRequest {
        order_id: Some(common::Uuid { hex: hex::encode(order_uuid.as_bytes()) }),
        user_id: Some(common::Uuid { hex: hex::encode(auth.user_id.as_bytes()) }),
    };
    let mut c = deps.trading.lock().await;
    c.cancel_order(req).await.map_err(|s| grpc_to_fapi(s))?;
    Ok(Json(CancelResp {
        symbol: q.symbol,
        order_id: q.order_id,
        status: "CANCELED",
    }))
}

#[derive(FromRow)]
struct OpenOrderDb {
    order_id: Uuid,
    symbol: String,
    side: String,
    price: Decimal,
    qty: Decimal,
    qty_remaining: Decimal,
    created_at: time::OffsetDateTime,
}

#[derive(Deserialize)]
pub struct OpenOrdersQuery {
    pub symbol: Option<String>,
}

async fn open_orders(
    Extension(auth): Extension<AuthedKey>,
    State(deps): State<Arc<OrdersDeps>>,
    Query(q): Query<OpenOrdersQuery>,
) -> Result<Json<Vec<OrderResp>>, FapiError> {
    let rocky_filter = match q.symbol.as_deref() {
        Some(b) => Some(symbol_map::binance_to_rocky(b).ok_or(FapiError::IllegalParameter)?),
        None => None,
    };
    let rows: Vec<OpenOrderDb> = if let Some(sym) = rocky_filter {
        sqlx::query_as(
            "SELECT order_id, symbol, side, price, qty, qty_remaining, created_at
             FROM ledger.orders_open WHERE user_id = $1 AND symbol = $2
             ORDER BY created_at DESC LIMIT 500",
        )
        .bind(auth.user_id)
        .bind(sym)
        .fetch_all(&deps.pg)
        .await
    } else {
        sqlx::query_as(
            "SELECT order_id, symbol, side, price, qty, qty_remaining, created_at
             FROM ledger.orders_open WHERE user_id = $1
             ORDER BY created_at DESC LIMIT 500",
        )
        .bind(auth.user_id)
        .fetch_all(&deps.pg)
        .await
    }
    .map_err(|_| FapiError::Unknown)?;

    let resp = rows
        .into_iter()
        .map(|r| {
            let binance = symbol_map::rocky_to_binance(&r.symbol).unwrap_or(&r.symbol);
            let filled = r.qty - r.qty_remaining;
            let status = if filled.is_zero() { "NEW" } else { "PARTIALLY_FILLED" };
            OrderResp {
                order_id: r.order_id.to_string(),
                client_order_id: r.order_id.to_string(),
                symbol: binance.to_string(),
                status: status.into(),
                side: r.side,
                order_type: "LIMIT".into(),
                price: r.price.to_string(),
                orig_qty: r.qty.to_string(),
                update_time: (r.created_at.unix_timestamp_nanos() / 1_000_000) as i64,
            }
        })
        .collect();
    Ok(Json(resp))
}

#[derive(Deserialize)]
pub struct GetOrderQuery {
    pub symbol: String,
    #[serde(rename = "orderId")]
    pub order_id: String,
}

async fn get_order(
    Extension(auth): Extension<AuthedKey>,
    State(deps): State<Arc<OrdersDeps>>,
    Query(q): Query<GetOrderQuery>,
) -> Result<Json<OrderResp>, FapiError> {
    let _ = symbol_map::binance_to_rocky(&q.symbol).ok_or(FapiError::IllegalParameter)?;
    let order_uuid: Uuid = q.order_id.parse().map_err(|_| FapiError::IllegalParameter)?;
    let row: Option<OpenOrderDb> = sqlx::query_as(
        "SELECT order_id, symbol, side, price, qty, qty_remaining, created_at
         FROM ledger.orders_open WHERE user_id = $1 AND order_id = $2",
    )
    .bind(auth.user_id)
    .bind(order_uuid)
    .fetch_optional(&deps.pg)
    .await
    .map_err(|_| FapiError::Unknown)?;

    let row = row.ok_or(FapiError::UnknownOrder)?;
    let binance = symbol_map::rocky_to_binance(&row.symbol).unwrap_or(&row.symbol);
    let filled = row.qty - row.qty_remaining;
    let status = if filled.is_zero() { "NEW" } else { "PARTIALLY_FILLED" };
    Ok(Json(OrderResp {
        order_id: row.order_id.to_string(),
        client_order_id: row.order_id.to_string(),
        symbol: binance.to_string(),
        status: status.into(),
        side: row.side,
        order_type: "LIMIT".into(),
        price: row.price.to_string(),
        orig_qty: row.qty.to_string(),
        update_time: (row.created_at.unix_timestamp_nanos() / 1_000_000) as i64,
    }))
}

fn grpc_to_fapi(s: tonic::Status) -> FapiError {
    use tonic::Code::*;
    match s.code() {
        InvalidArgument => FapiError::IllegalParameter,
        FailedPrecondition => FapiError::InsufficientBalance,
        NotFound => FapiError::UnknownOrder,
        Unauthenticated | PermissionDenied => FapiError::InvalidApiKey,
        _ => FapiError::Unknown,
    }
}

pub fn router(deps: Arc<OrdersDeps>) -> Router {
    Router::new()
        .route("/fapi/v1/order", post(place_order))
        .route("/fapi/v1/order", delete(cancel_order))
        .route("/fapi/v1/order", get(get_order))
        .route("/fapi/v1/openOrders", get(open_orders))
        .with_state(deps)
}
```

- [ ] **Step 10.3: Build + commit**

```bash
cargo build -p api-gateway
git add services/api-gateway/src/fapi/mod.rs services/api-gateway/src/fapi/routes_orders.rs
git commit -m "feat(api-gateway): fapi order endpoints (place/cancel/get/openOrders)

MARKET orders return -1100 for v1; bot crosses the book with aggressive
LIMIT prices instead. PUT /order (amend) deferred to v2."
```

---

## Task 11: Account endpoints — `/v2/balance` + `/v2/positionRisk`

**Files:**
- Create: `services/api-gateway/src/fapi/routes_account.rs`
- Modify: `services/api-gateway/src/fapi/mod.rs`

- [ ] **Step 11.1: Add module decl**

Append `pub mod routes_account;` to `services/api-gateway/src/fapi/mod.rs`.

- [ ] **Step 11.2: Implement**

Create `services/api-gateway/src/fapi/routes_account.rs`:

```rust
//! Signed account endpoints: /fapi/v2/balance, /fapi/v2/positionRisk.

use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    routing::get,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

use super::{AuthedKey, FapiState, error::FapiError, symbol_map};

#[derive(Serialize)]
pub struct BalanceRow {
    #[serde(rename = "accountAlias")]
    pub account_alias: String,
    pub asset: String,
    pub balance: String,
    #[serde(rename = "crossWalletBalance")]
    pub cross_wallet_balance: String,
    #[serde(rename = "availableBalance")]
    pub available_balance: String,
    #[serde(rename = "updateTime")]
    pub update_time: i64,
}

#[derive(FromRow)]
struct DbBalance {
    asset: String,
    available: Decimal,
    locked: Decimal,
}

async fn balance(
    Extension(auth): Extension<AuthedKey>,
    State(state): State<Arc<FapiState>>,
) -> Result<Json<Vec<BalanceRow>>, FapiError> {
    let rows: Vec<DbBalance> = sqlx::query_as(
        "SELECT asset, available, locked FROM ledger.accounts WHERE user_id = $1",
    )
    .bind(auth.user_id)
    .fetch_all(&state.pg)
    .await
    .map_err(|_| FapiError::Unknown)?;

    let now = chrono::Utc::now().timestamp_millis();
    Ok(Json(
        rows.into_iter()
            .map(|r| {
                let total = r.available + r.locked;
                BalanceRow {
                    account_alias: auth.user_id.to_string(),
                    asset: r.asset,
                    balance: total.to_string(),
                    cross_wallet_balance: total.to_string(),
                    available_balance: r.available.to_string(),
                    update_time: now,
                }
            })
            .collect(),
    ))
}

#[derive(Serialize)]
pub struct PositionRiskRow {
    pub symbol: String,
    #[serde(rename = "positionAmt")]
    pub position_amt: String,
    #[serde(rename = "entryPrice")]
    pub entry_price: String,
    #[serde(rename = "markPrice")]
    pub mark_price: String,
    #[serde(rename = "unRealizedProfit")]
    pub unrealized_profit: String,
    pub leverage: String,
    #[serde(rename = "marginType")]
    pub margin_type: &'static str,
    #[serde(rename = "isolatedMargin")]
    pub isolated_margin: String,
    #[serde(rename = "positionSide")]
    pub position_side: &'static str,
    #[serde(rename = "updateTime")]
    pub update_time: i64,
}

#[derive(FromRow)]
struct DbPos {
    symbol: String,
    qty: Decimal,
    avg_price: Decimal,
    locked_margin: Decimal,
}

#[derive(Deserialize)]
pub struct PositionRiskQuery {
    pub symbol: Option<String>,
}

async fn position_risk(
    Extension(auth): Extension<AuthedKey>,
    State(state): State<Arc<FapiState>>,
    Query(q): Query<PositionRiskQuery>,
) -> Result<Json<Vec<PositionRiskRow>>, FapiError> {
    let rocky_filter = match q.symbol.as_deref() {
        Some(b) => Some(symbol_map::binance_to_rocky(b).ok_or(FapiError::IllegalParameter)?),
        None => None,
    };
    let rows: Vec<DbPos> = if let Some(sym) = rocky_filter {
        sqlx::query_as(
            "SELECT symbol, qty, avg_price, locked_margin
             FROM ledger.positions WHERE user_id = $1 AND symbol = $2",
        )
        .bind(auth.user_id)
        .bind(sym)
        .fetch_all(&state.pg)
        .await
    } else {
        sqlx::query_as(
            "SELECT symbol, qty, avg_price, locked_margin
             FROM ledger.positions WHERE user_id = $1 AND qty != 0",
        )
        .bind(auth.user_id)
        .fetch_all(&state.pg)
        .await
    }
    .map_err(|_| FapiError::Unknown)?;

    let now = chrono::Utc::now().timestamp_millis();
    Ok(Json(
        rows.into_iter()
            .map(|r| {
                let binance = symbol_map::rocky_to_binance(&r.symbol).unwrap_or(&r.symbol);
                PositionRiskRow {
                    symbol: binance.to_string(),
                    position_amt: r.qty.to_string(),
                    entry_price: r.avg_price.to_string(),
                    mark_price: "0".into(), // populated from oracle cache in a follow-up
                    unrealized_profit: "0".into(),
                    leverage: "10".into(),
                    margin_type: "cross",
                    isolated_margin: r.locked_margin.to_string(),
                    position_side: "BOTH",
                    update_time: now,
                }
            })
            .collect(),
    ))
}

pub fn router(state: Arc<FapiState>) -> Router {
    Router::new()
        .route("/fapi/v2/balance", get(balance))
        .route("/fapi/v2/positionRisk", get(position_risk))
        .with_state(state)
}
```

- [ ] **Step 11.3: Build + commit**

```bash
cargo build -p api-gateway
git add services/api-gateway/src/fapi/mod.rs services/api-gateway/src/fapi/routes_account.rs
git commit -m "feat(api-gateway): fapi account endpoints v2/balance + v2/positionRisk"
```

---

## Task 12: Wire `/fapi` router into `build_router_with_dev`

**Files:**
- Modify: `services/api-gateway/src/fapi/mod.rs`
- Modify: `services/api-gateway/src/lib.rs`

- [ ] **Step 12.1: Add aggregator `router(state, trading)` in fapi/mod.rs**

Append to `services/api-gateway/src/fapi/mod.rs`:

```rust
use axum::Router;
use axum::middleware::from_fn_with_state;

use crate::routes::orders::TradingClient;

pub fn router(state: Arc<FapiState>, trading: TradingClient) -> Router {
    let orders_deps = Arc::new(routes_orders::OrdersDeps {
        trading,
        pg: state.pg.clone(),
    });
    let public = routes_public::router(state.clone());
    let orders_routes = routes_orders::router(orders_deps);
    let account_routes = routes_account::router(state.clone());

    // Apply the signature middleware to all routes except the public ones.
    let signed = orders_routes
        .merge(account_routes)
        .layer(from_fn_with_state(state.clone(), auth::verify_signature));

    public.merge(signed)
}
```

- [ ] **Step 12.2: Mount in build_router_with_dev**

In `services/api-gateway/src/lib.rs`, inside `build_router_with_dev(state, dev)`, add at the end of the merge chain (before `if let Some(dev_state)…`):

```rust
        .merge(fapi::router(
            fapi::FapiState::new(state.pg.clone()),
            state.trading.clone(),
        ));
```

(Put it before the `if let Some(dev_state)` block but inside the `r` assignment by appending another `.merge()`. Concretely: replace the existing chain ending in `.merge(routes::me::router(state.pg));` with `.merge(routes::me::router(state.pg.clone()))` and then chain `.merge(fapi::router(...))`.)

Full result for the relevant section:

```rust
    let mut r = Router::new()
        .merge(routes::health::router())
        .merge(routes::orders::router(state.trading.clone()))
        .merge(routes::withdrawals::router(state.trading.clone()))
        .merge(routes::account::router(state.ledger))
        .merge(routes::fees::router(state.pg.clone()))
        .merge(routes::funding::router(state.pg.clone()))
        .merge(routes::markets::router(state.pg.clone(), state.oracle.clone(), state.matching.clone()))
        .merge(routes::candles::router(state.pg.clone()))
        .merge(routes::me::router(state.pg.clone()))
        .merge(fapi::router(
            fapi::FapiState::new(state.pg.clone()),
            state.trading.clone(),
        ));
```

(Note `state.trading` is now cloned in two places, so the previous `.merge(routes::orders::router(state.trading.clone()))` must use `.clone()` instead of moving.)

- [ ] **Step 12.3: Build + clippy + commit**

```bash
cargo build -p api-gateway
cargo clippy -p api-gateway -- -D warnings
git add services/api-gateway/src/fapi/mod.rs services/api-gateway/src/lib.rs
git commit -m "feat(api-gateway): mount /fapi router under build_router_with_dev"
```

---

## Task 13: Integration test — end-to-end signed request

**Files:**
- Create: `services/api-gateway/tests/fapi_signing.rs`

This test does NOT require a real Postgres — it stubs the auth path by inserting a fake `AuthedKey` extension via a custom middleware. The HMAC verification is exercised separately by the unit tests in Task 5 and Task 7. Here we just confirm the router shape works end-to-end.

- [ ] **Step 13.1: Write integration test**

Create `services/api-gateway/tests/fapi_signing.rs`:

```rust
//! Integration tests for /fapi router shape. Uses a stub auth layer that
//! injects a fixed user_id so we exercise the routing and response shape
//! without needing real pg / api_keys rows.

use api_gateway::fapi::{self, AuthedKey, FapiState};
use axum::{Router, body::Body, http::Request};
use std::sync::Arc;
use tower::ServiceExt;
use uuid::Uuid;

fn fake_state() -> Arc<FapiState> {
    // Build a state with a "dead" pool — tests that hit pg are excluded; we
    // only exercise the no-pg endpoints (exchangeInfo).
    use sqlx::postgres::PgPoolOptions;
    let opts = PgPoolOptions::new().max_connections(1);
    // Lazy: do not actually connect; this returns a builder. Connection is
    // only attempted on first query. exchangeInfo doesn't query.
    let pool = opts.connect_lazy("postgres://localhost/nonexistent").unwrap();
    FapiState::new(pool)
}

#[tokio::test]
async fn exchange_info_is_public_and_returns_two_symbols() {
    let state = fake_state();
    let trading_dummy = make_dummy_trading();
    let app: Router = fapi::router(state, trading_dummy);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/fapi/v1/exchangeInfo")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 200);
    let body = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["symbols"].as_array().unwrap().len(), 2);
    assert_eq!(v["symbols"][0]["symbol"], "BTCUSDT");
    assert_eq!(v["symbols"][0]["pair"], "BTC-PERP");
}

#[tokio::test]
async fn signed_endpoint_rejects_missing_apikey_header() {
    let state = fake_state();
    let trading_dummy = make_dummy_trading();
    let app: Router = fapi::router(state, trading_dummy);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/fapi/v2/balance?timestamp=1&signature=ab")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), 400); // -2014 ApiKeyFormatInvalid → 400
    let body = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["code"], -2014);
}

fn make_dummy_trading() -> api_gateway::routes::orders::TradingClient {
    // Construct a TradingClient that's never invoked in this test. We need
    // something that satisfies the type. Easiest: use a Channel pointing at
    // a closed address. It won't be called by exchangeInfo or by the
    // missing-apikey path (middleware rejects before handler runs).
    use rocky_proto::trading_v1::trading_service_client::TradingServiceClient;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tonic::transport::Endpoint;

    let ch = Endpoint::from_static("http://127.0.0.1:1")
        .connect_lazy();
    Arc::new(Mutex::new(TradingServiceClient::new(ch)))
}
```

- [ ] **Step 13.2: Run + commit**

```bash
cargo test -p api-gateway --test fapi_signing
# expect: 2 passed
cargo test -p api-gateway
# expect: all prior tests still pass + 2 new
git add services/api-gateway/tests/fapi_signing.rs
git commit -m "test(api-gateway): fapi router-shape integration tests"
```

---

## Task 14: Deploy to EC2 + run mint_api_key smoke

**Files:** none modified. Operational only.

- [ ] **Step 14.1: Build + deploy**

```bash
bash scripts/dev/services-remote.sh build
bash scripts/dev/services-remote.sh restart
```

Expected: `==> api-gateway started (pid …)`. If any service fails to start, run `bash scripts/dev/services-remote.sh logs api-gateway 200` to inspect.

- [ ] **Step 14.2: Verify migration ran (auth.api_keys table exists)**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "psql 'postgres://rocky:rocky@127.0.0.1:5432/rocky' -c '\dt auth.*' 2>&1"
```

Expected: a row with `auth | api_keys | table`.

- [ ] **Step 14.3: Mint two API keys (MM + Taker)**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 bash <<'REMOTE'
cd ~/rocky-backend-stack
. "$HOME/.cargo/env"
PG_URL="postgres://rocky:rocky@127.0.0.1:5432/rocky" \
  cargo run -q -p api-gateway --bin mint_api_key -- --new-user --label "MM bot"
echo "---"
PG_URL="postgres://rocky:rocky@127.0.0.1:5432/rocky" \
  cargo run -q -p api-gateway --bin mint_api_key -- --new-user --label "Taker bot"
REMOTE
```

Expected output: two blocks each printing `user_id:`, `key:`, `secret:` lines. **Save these four values** — they go into `rocky-bot/.env` in Plan B. Each `cargo run` may take ~10–20 s on first invocation as it recompiles the binary.

- [ ] **Step 14.4: Seed $100 USDC to each bot user**

For each `user_id` printed above (substitute `<MM-UUID>` / `<TAKER-UUID>`):

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "curl -sf -X POST http://127.0.0.1:18080/v1/deposits/seed \
     -H 'Content-Type: application/json' \
     -d '{\"user_id\":\"<MM-UUID>\",\"asset\":\"USDC\",\"amount\":\"100\"}' | head -c 400"
# repeat for <TAKER-UUID>
```

Expected: each call returns JSON `{"chain_tx_id":"...","canton_command_id":"..."}` (HTTP 200). If 503, check `services-remote.sh logs canton-bridge 100`.

Wait ~5 seconds, then verify:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "curl -sf http://127.0.0.1:18080/v1/account/<MM-UUID>/USDC | head -c 200"
```

Expected: `{"user_id":"...","asset":"USDC","available":"100","locked":"0"}`.

- [ ] **Step 14.5: Smoke `/fapi/v1/exchangeInfo`**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "curl -sf http://127.0.0.1:18080/fapi/v1/exchangeInfo | head -c 400"
```

Expected: JSON with `timezone:"UTC"`, two `symbols` entries (BTCUSDT, ETHUSDT).

- [ ] **Step 14.6: Smoke signed `/fapi/v2/balance` (manual signing)**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 bash <<'REMOTE'
KEY="<paste MM key from 14.3>"
SECRET="<paste MM secret from 14.3>"
TS=$(date +%s%3N)
QUERY="timestamp=$TS"
SIG=$(printf "%s" "$QUERY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -sf -H "X-MBX-APIKEY: $KEY" \
  "http://127.0.0.1:18080/fapi/v2/balance?${QUERY}&signature=${SIG}" | head -c 300
REMOTE
```

Expected: JSON array with at least one entry where `asset:"USDC"`, `balance:"100"`, `availableBalance:"100"`.

If you get `{"code":-1022,...}`: confirm SECRET wasn't truncated and that `openssl` produced a 64-char hex.
If you get `{"code":-2015,...}`: the KEY isn't in `auth.api_keys` — re-check Step 14.3 output.

- [ ] **Step 14.7: Commit no code change — just record output**

If everything passed, write a short note (≤10 lines) to a scratch file or annotate this plan inline confirming the smoke succeeded and listing the four user_id values (no secrets!). No commit needed.

---

## Task 15: Nginx exposure on `demo.rocky.exchange/fapi`

**Files:**
- Create: `scripts/nginx/demo-fapi.snippet.conf`

- [ ] **Step 15.1: Save snippet locally for reproducibility**

Create `scripts/nginx/demo-fapi.snippet.conf`:

```nginx
# Append inside the `server { server_name demo.rocky.exchange; ... }` block
# in /etc/nginx/sites-enabled/rocky-demo on the EC2 host.
location /fapi/ {
    proxy_pass http://127.0.0.1:18080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
}
```

- [ ] **Step 15.2: Apply on EC2**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 bash <<'REMOTE'
set -e
sudo cp /etc/nginx/sites-enabled/rocky-demo /etc/nginx/sites-enabled/rocky-demo.bak.$(date +%s)
sudo python3 - <<'PY'
import re, pathlib
p = pathlib.Path("/etc/nginx/sites-enabled/rocky-demo")
src = p.read_text()
snippet = '''    location /fapi/ {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
'''
# Insert immediately after the `location / { ... }` block that proxies 8080,
# within the demo.rocky.exchange server. Marker: the first occurrence of
# "proxy_pass http://127.0.0.1:8080;\n" inside the demo server block.
m = re.search(r"(server_name demo\.rocky\.exchange;.*?location /\s*\{[^}]*?\}\n)", src, re.S)
if not m:
    raise SystemExit("could not locate demo.rocky.exchange location / block")
if "location /fapi/" in src:
    print("already present, no change")
else:
    new = src[:m.end()] + "\n" + snippet + src[m.end():]
    p.write_text(new)
    print("inserted")
PY
sudo nginx -t
sudo nginx -s reload
REMOTE
```

Expected: `nginx: configuration file ... test is successful` and reload silent.

- [ ] **Step 15.3: Smoke public path**

From your Mac:

```bash
curl -sf https://demo.rocky.exchange/fapi/v1/exchangeInfo | head -c 300
```

Expected: same JSON as Step 14.5.

From EC2:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "curl -sk -o /dev/null -w 'HTTP=%{http_code}\n' https://demo.rocky.exchange/fapi/v1/exchangeInfo"
```

Expected: `HTTP=200`.

- [ ] **Step 15.4: Commit + push the snippet**

```bash
git add scripts/nginx/demo-fapi.snippet.conf
git commit -m "ops(nginx): record /fapi/ location snippet for demo.rocky.exchange"
git push origin main
```

---

## Plan-A Final Acceptance Checklist

Run all of the following — every line must succeed before declaring Plan A done.

- [ ] `cargo test -p api-gateway` — all tests pass locally
- [ ] `cargo clippy -p api-gateway -- -D warnings` — no warnings
- [ ] `bash scripts/dev/services-remote.sh restart` — all 9 services start; `services-remote.sh ps` shows api-gateway running
- [ ] EC2: `psql -c '\dt auth.*'` shows `api_keys`
- [ ] EC2: `curl http://127.0.0.1:18080/fapi/v1/exchangeInfo` returns 200 JSON with two symbols
- [ ] EC2: signed `curl http://127.0.0.1:18080/fapi/v2/balance` with MM key returns 200 with USDC balance
- [ ] Mac: `curl https://demo.rocky.exchange/fapi/v1/exchangeInfo` returns 200
- [ ] Two MM/Taker user_id + key + secret pairs saved to a private note for Plan B `.env`
- [ ] All commits pushed to `origin/main`

When all checked, Plan B can begin.

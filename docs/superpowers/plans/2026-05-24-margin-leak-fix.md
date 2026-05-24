# Margin-Leak Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `accounts.locked` from leaking on every order fill in rocky-backend's `internal-ledger`, so rocky-bot doesn't stall with `-2010 insufficient balance` after a few hours.

**Architecture:** Inside `apply_trade_matched`, replace the bare `decrement_remaining` / `delete_if_fully_filled` calls with a single `decrement_with_margin_release` helper that also returns the proportional `margin_locked` to release from `accounts.locked`. Then re-lock the position-growth portion from `apply_margin_recompute`'s return value. Net effect preserves the invariant `accounts.locked == sum(positions.locked_margin) + sum(orders_open.margin_locked)` across every fill (open / add / reduce / close).

**Tech Stack:** Rust 2024, sqlx 0.8, tokio 1.43, rust_decimal, axum, async-nats, testcontainers (docker). Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-24-margin-leak-fix-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac: `cargo build`, `cargo test`, `cargo test -- --ignored` (if Docker Desktop runs), `cargo clippy`. **NOT allowed locally:** `cargo run`, `docker run` for services, `systemctl`.
- Working dir: `/Users/ubuntu/Desktop/Rocky/rocky-backend/`.
- Deploy: `bash scripts/dev/services-remote.sh build` then `bash scripts/dev/services-remote.sh restart`. SSH may drop on long builds; use `nohup` + marker-file pattern when needed (see Task 6 for the working incantation).
- Historical SQL reset on EC2: `docker exec -i rocky-backend-stack-postgres-1 psql -U rocky -d rocky` then paste the SQL from spec § "Migration / rollout".
- DO NOT push to GitHub unless Task 7 says so.
- The existing `tests/smoke/trading-e2e.sh:59` asserts `"locked":"100"` after a single open fill — this must still pass after the fix.

---

## File Structure

**Modified:**
- `services/internal-ledger/src/projections/orders.rs` (~130 → ~180 lines)
  - Add `decrement_with_margin_release`
  - Delete `decrement_remaining`, `delete_if_fully_filled`
- `services/internal-ledger/src/apply.rs` (~239 → ~225 lines net)
  - Capture `apply_margin_recompute` returns
  - Replace step 6 with new helper + unlock/lock calls
  - Remove dead `let _ = accounts::unlock_margin;` shim
- `services/internal-ledger/Cargo.toml` (if missing) — `[dev-dependencies] testcontainers` already present (per existing `tests/migrations.rs`), confirm no addition needed.

**Created:**
- `services/internal-ledger/tests/margin_invariant.rs` — 2 integration tests using testcontainers + real Postgres, gated `#[ignore]`.

**Untouched:**
- `services/internal-ledger/src/projections/accounts.rs` — `lock_margin` + `unlock_margin` already exist with the right signatures.
- `services/internal-ledger/src/margin.rs` — `apply_margin_recompute` shrinkage path unchanged.
- `services/internal-ledger/src/service.rs` — place_order + cancel_order paths unchanged.
- `tests/smoke/trading-e2e.sh` — assertion stays as-is (and must still pass).

---

## Task 1: Add `decrement_with_margin_release` helper

**Files:**
- Modify: `services/internal-ledger/src/projections/orders.rs` (add function)

- [ ] **Step 1.1: Add the new function**

Append to `services/internal-ledger/src/projections/orders.rs`:

```rust
/// Apply a fill against an open order: reduce qty_remaining and
/// margin_locked proportionally, delete the row if fully filled,
/// and return the margin amount to release to accounts.
///
/// Returns:
///   - `Some((release_amount, new_remaining))` if the order existed.
///   - `None` if the order is not in orders_open (already filled or
///     cancelled by a concurrent path — fill is a no-op on the row).
///
/// Release math (proportional to fill quantity):
///   release = pre_margin_locked * (fill_qty / pre_qty_remaining)
///
/// Remaining margin_locked = pre_margin_locked - release; this
/// preserves the per-unit margin ratio so a subsequent fill or cancel
/// on the remainder gets exactly the right amount.
pub async fn decrement_with_margin_release<'t>(
    tx: &mut sqlx::Transaction<'t, Postgres>,
    order_id: Uuid,
    fill_qty: Decimal,
) -> Result<Option<(Decimal, Decimal)>, sqlx::Error> {
    let pre: Option<(Decimal, Decimal)> = sqlx::query_as(
        r#"SELECT qty_remaining, margin_locked
           FROM orders_open
           WHERE order_id = $1
           FOR UPDATE"#,
    )
    .bind(order_id)
    .fetch_optional(&mut **tx)
    .await?;

    let Some((pre_rem, pre_locked)) = pre else {
        return Ok(None);
    };
    if pre_rem <= Decimal::ZERO {
        // Defensive: orders_open should not contain zero-rem rows.
        return Ok(Some((Decimal::ZERO, pre_rem)));
    }

    let fill_q = fill_qty.min(pre_rem); // defensive: never overfill
    let release = pre_locked * fill_q / pre_rem;
    let new_rem = pre_rem - fill_q;
    let new_locked = pre_locked - release;

    if new_rem <= Decimal::ZERO {
        sqlx::query(r#"DELETE FROM orders_open WHERE order_id = $1"#)
            .bind(order_id)
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query(
            r#"UPDATE orders_open
               SET qty_remaining = $2, margin_locked = $3
               WHERE order_id = $1"#,
        )
        .bind(order_id)
        .bind(new_rem)
        .bind(new_locked)
        .execute(&mut **tx)
        .await?;
    }

    Ok(Some((release, new_rem)))
}
```

- [ ] **Step 1.2: Build**

```bash
cargo build -p internal-ledger
```

Expected: `Finished dev profile`. The function compiles but is unused (warning OK — unused-fn warning will go away in Task 2 when apply.rs starts calling it).

- [ ] **Step 1.3: Commit**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git add services/internal-ledger/src/projections/orders.rs
git commit -m "feat(internal-ledger): add decrement_with_margin_release helper"
```

---

## Task 2: Wire helper into `apply_trade_matched`

**Files:**
- Modify: `services/internal-ledger/src/apply.rs`

This task does four edits inside one file:
1. Capture `apply_margin_recompute` return values (`u_taker`, `u_maker`) — currently discarded.
2. Replace step 6 (lines ~189-197) with the new `decrement_with_margin_release` + `accounts::unlock_margin` + conditional `accounts::lock_margin` for position growth.
3. Remove the dead `let _ = accounts::unlock_margin;` shim at line ~229.
4. Leave `fetch_order_margin` (line 38), `apply_margin_recompute` calls at lines 153/166 (only change: bind the return), and the leverage derivation untouched.

- [ ] **Step 2.1: Capture `apply_margin_recompute` returns**

In `services/internal-ledger/src/apply.rs`, find the first call site (around line 153):

```rust
    apply_margin_recompute(
        &mut tx,
        msg.taker_user,
        &msg.symbol,
        &asset,
        taker_pre_qty,
        taker_pre_entry,
        taker_pre_locked,
        taker_qty_signed,
        price,
        taker_leverage,
    )
    .await?;
```

Replace with:

```rust
    let u_taker = apply_margin_recompute(
        &mut tx,
        msg.taker_user,
        &msg.symbol,
        &asset,
        taker_pre_qty,
        taker_pre_entry,
        taker_pre_locked,
        taker_qty_signed,
        price,
        taker_leverage,
    )
    .await?;
```

Find the second call site (around line 166), same shape but `maker_*`. Replace `apply_margin_recompute(...)` → `let u_maker = apply_margin_recompute(...)`.

- [ ] **Step 2.2: Replace step 6 (decrement + delete) with new logic**

Find the block (lines ~189-197):

```rust
    // 6) Decrement orders_open for both legs; delete if fully filled.
    if let Some(rem) = orders::decrement_remaining(&mut tx, msg.taker_order, qty).await? {
        if rem <= Decimal::ZERO {
            orders::delete_if_fully_filled(&mut tx, msg.taker_order).await?;
        }
    }
    if let Some(rem) = orders::decrement_remaining(&mut tx, msg.maker_order, qty).await? {
        if rem <= Decimal::ZERO {
            orders::delete_if_fully_filled(&mut tx, msg.maker_order).await?;
        }
    }
```

Replace with:

```rust
    // 6) Reduce orders_open + release the proportional order margin from
    //    accounts.locked, then re-lock any position growth so the invariant
    //    accounts.locked == sum(positions.locked_margin) + sum(orders_open.margin_locked)
    //    is preserved across all fill kinds (open / add / reduce / close).
    //    See docs/superpowers/specs/2026-05-24-margin-leak-fix-design.md.
    let taker_release = orders::decrement_with_margin_release(&mut tx, msg.taker_order, qty)
        .await?
        .map(|(r, _)| r)
        .unwrap_or(Decimal::ZERO);
    let maker_release = orders::decrement_with_margin_release(&mut tx, msg.maker_order, qty)
        .await?
        .map(|(r, _)| r)
        .unwrap_or(Decimal::ZERO);

    if taker_release > Decimal::ZERO {
        accounts::unlock_margin(&mut tx, msg.taker_user, &asset, taker_release).await?;
    }
    if maker_release > Decimal::ZERO {
        accounts::unlock_margin(&mut tx, msg.maker_user, &asset, maker_release).await?;
    }

    // 6b) If apply_margin_recompute grew the position's locked_margin
    //     (open / add same direction), re-lock that growth so the
    //     order's just-released margin transitions cleanly into
    //     position margin within accounts.locked.
    let taker_growth = u_taker.new_locked - taker_pre_locked;
    if taker_growth > Decimal::ZERO {
        let ok = accounts::lock_margin(&mut tx, msg.taker_user, &asset, taker_growth).await?;
        if !ok {
            anyhow::bail!(
                "invariant violation: insufficient available for taker position growth lock \
                 (user={}, amount={taker_growth})",
                msg.taker_user
            );
        }
    }
    let maker_growth = u_maker.new_locked - maker_pre_locked;
    if maker_growth > Decimal::ZERO {
        let ok = accounts::lock_margin(&mut tx, msg.maker_user, &asset, maker_growth).await?;
        if !ok {
            anyhow::bail!(
                "invariant violation: insufficient available for maker position growth lock \
                 (user={}, amount={maker_growth})",
                msg.maker_user
            );
        }
    }
```

- [ ] **Step 2.3: Remove dead `unlock_margin` shim**

Find at line ~229:

```rust
    // 8) Margin: keep the unlock_margin reference to avoid dead_code warning.
    let _ = accounts::unlock_margin; // unlock is now handled in apply_margin_recompute.
```

Delete those two lines (the function is now actually used at step 6).

- [ ] **Step 2.4: Build + clippy**

```bash
cargo build -p internal-ledger
cargo clippy -p internal-ledger -- -D warnings
```

Expected: both clean. If clippy flags `decrement_remaining` or `delete_if_fully_filled` as unused (they will be), that's expected — Task 3 deletes them. To silence interim, add `#[allow(dead_code)]` above each in projections/orders.rs OR jump straight to Task 3 in the same dispatch.

- [ ] **Step 2.5: Run existing unit tests**

```bash
cargo test -p internal-ledger
```

Expected: all non-`#[ignore]` tests pass (the `margin::tests::*` pure-math tests in particular). The trading-e2e shell test is NOT run here (it requires the full stack on EC2).

- [ ] **Step 2.6: Commit**

```bash
git add services/internal-ledger/src/apply.rs
git commit -m "fix(internal-ledger): release order margin + re-lock position growth on fill

apply_trade_matched now keeps the invariant
  accounts.locked == sum(positions.locked_margin) + sum(orders_open.margin_locked)
across every fill (open / add / reduce / close). Previously closing
fills leaked the closing order's placement margin to accounts.locked,
which compounded over hours and stalled rocky-bot with -2010.

See docs/superpowers/specs/2026-05-24-margin-leak-fix-design.md."
```

---

## Task 3: Delete dead helpers

**Files:**
- Modify: `services/internal-ledger/src/projections/orders.rs` (delete two functions)

- [ ] **Step 3.1: Verify no other callers**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
grep -rn "decrement_remaining\|delete_if_fully_filled" services crates 2>&1 | grep -v "fn decrement_remaining\|fn delete_if_fully_filled"
```

Expected: zero lines after the grep filter. If anything remains, do NOT delete — investigate and ask the controller. (Both are private to `projections::orders`; only `apply.rs` ever consumed them, and Task 2 removed those calls.)

- [ ] **Step 3.2: Delete `decrement_remaining`**

In `services/internal-ledger/src/projections/orders.rs`, delete the entire function:

```rust
pub async fn decrement_remaining<'t>(
    tx: &mut sqlx::Transaction<'t, Postgres>,
    order_id: Uuid,
    filled: Decimal,
) -> Result<Option<Decimal>, sqlx::Error> {
    let row: Option<(Decimal,)> = sqlx::query_as(
        r#"UPDATE orders_open
           SET qty_remaining = qty_remaining - $2
           WHERE order_id = $1
           RETURNING qty_remaining"#,
    )
    .bind(order_id)
    .bind(filled)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row.map(|(r,)| r))
}
```

- [ ] **Step 3.3: Delete `delete_if_fully_filled`**

Delete the entire function:

```rust
pub async fn delete_if_fully_filled<'t>(
    tx: &mut sqlx::Transaction<'t, Postgres>,
    order_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let n = sqlx::query(r#"DELETE FROM orders_open WHERE order_id = $1 AND qty_remaining <= 0"#)
        .bind(order_id)
        .execute(&mut **tx)
        .await?
        .rows_affected();
    Ok(n == 1)
}
```

- [ ] **Step 3.4: Build + clippy**

```bash
cargo build -p internal-ledger
cargo clippy -p internal-ledger -- -D warnings
```

Expected: clean. (`delete_by_id` and `fetch_open_for_cancel` remain — those are still used by `service.rs::cancel_order`.)

- [ ] **Step 3.5: Commit**

```bash
git add services/internal-ledger/src/projections/orders.rs
git commit -m "chore(internal-ledger): remove unused decrement_remaining + delete_if_fully_filled

Superseded by decrement_with_margin_release which combines both
operations and returns the proportional margin to release."
```

---

## Task 4: Integration tests against real Postgres (testcontainers)

**Files:**
- Create: `services/internal-ledger/tests/margin_invariant.rs`

These tests use `testcontainers` to spin up Postgres 15 in Docker, run migrations, then drive the apply flow end-to-end. Gated `#[ignore = "requires docker"]` to match the existing convention in `tests/migrations.rs` — run with `cargo test -p internal-ledger -- --ignored`.

- [ ] **Step 4.1: Write the test file**

Create `services/internal-ledger/tests/margin_invariant.rs`:

```rust
//! Regression tests for the apply_trade_matched margin-leak fix.
//!
//! These verify the invariant:
//!     accounts.locked == sum(positions.locked_margin) + sum(orders_open.margin_locked)
//!
//! across multi-fill sequences (especially open-close cycles, which leaked
//! the closing order's full placement margin before the fix).
//!
//! Gated `#[ignore]` because they spin up a Postgres container. Run with:
//!     cargo test -p internal-ledger -- --ignored

use internal_ledger::apply::{TradeMatchedMsg, apply_trade_matched};
use internal_ledger::eventstore::EventStore;
use internal_ledger::projections::{accounts, orders};
use rocky_events::ledger::Side;
use rocky_signing::{InMemoryKeyProvider, ServiceSigner};
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::str::FromStr;
use testcontainers::core::WaitFor;
use testcontainers::runners::AsyncRunner;
use testcontainers::{GenericImage, ImageExt};
use uuid::Uuid;

async fn setup() -> (PgPool, std::sync::Arc<ServiceSigner>, testcontainers::ContainerAsync<GenericImage>) {
    let pg = GenericImage::new("postgres", "15-alpine")
        .with_wait_for(WaitFor::message_on_stderr(
            "database system is ready to accept connections",
        ))
        .with_env_var("POSTGRES_USER", "rocky")
        .with_env_var("POSTGRES_PASSWORD", "rocky")
        .with_env_var("POSTGRES_DB", "rocky")
        .start()
        .await
        .unwrap();
    let port = pg.get_host_port_ipv4(5432).await.unwrap();
    let url = format!("postgres://rocky:rocky@127.0.0.1:{port}/rocky");
    let pool = internal_ledger::db::connect(&url).await.unwrap();
    internal_ledger::migrate::run(&pool).await.unwrap();
    let signer = std::sync::Arc::new(
        ServiceSigner::from_provider(&InMemoryKeyProvider::new_random())
            .await
            .unwrap(),
    );
    (pool, signer, pg)
}

/// Insert a fake open order directly (bypasses gRPC) to seed state for fills.
async fn seed_open_order(
    pool: &PgPool,
    order_id: Uuid,
    user_id: Uuid,
    symbol: &str,
    side: Side,
    price: Decimal,
    qty: Decimal,
    margin: Decimal,
) {
    let mut tx = pool.begin().await.unwrap();
    accounts::credit_available(&mut tx, user_id, "USDC", margin)
        .await
        .unwrap();
    let ok = accounts::lock_margin(&mut tx, user_id, "USDC", margin)
        .await
        .unwrap();
    assert!(ok, "seed_open_order: failed to lock margin");
    orders::insert_open(&mut tx, order_id, user_id, symbol, side, price, qty, margin)
        .await
        .unwrap();
    tx.commit().await.unwrap();
}

async fn fund(pool: &PgPool, user: Uuid, amount: &str) {
    let mut tx = pool.begin().await.unwrap();
    accounts::credit_available(&mut tx, user, "USDC", d(amount))
        .await
        .unwrap();
    tx.commit().await.unwrap();
}

async fn account_locked(pool: &PgPool, user: Uuid) -> Decimal {
    let snap = accounts::get_account(pool, user, "USDC")
        .await
        .unwrap()
        .expect("user has no USDC account row");
    snap.locked
}

async fn account_available(pool: &PgPool, user: Uuid) -> Decimal {
    let snap = accounts::get_account(pool, user, "USDC")
        .await
        .unwrap()
        .expect("user has no USDC account row");
    snap.available
}

async fn sum_position_locked(pool: &PgPool, user: Uuid) -> Decimal {
    let row: Option<(Option<Decimal>,)> = sqlx::query_as(
        "SELECT SUM(locked_margin) FROM ledger.positions WHERE user_id = $1",
    )
    .bind(user)
    .fetch_optional(pool)
    .await
    .unwrap();
    row.and_then(|(s,)| s).unwrap_or(Decimal::ZERO)
}

async fn sum_order_locked(pool: &PgPool, user: Uuid) -> Decimal {
    let row: Option<(Option<Decimal>,)> = sqlx::query_as(
        "SELECT SUM(margin_locked) FROM ledger.orders_open WHERE user_id = $1",
    )
    .bind(user)
    .fetch_optional(pool)
    .await
    .unwrap();
    row.and_then(|(s,)| s).unwrap_or(Decimal::ZERO)
}

fn d(s: &str) -> Decimal {
    Decimal::from_str(s).unwrap()
}

async fn match_fill(
    pool: &PgPool,
    signer: &std::sync::Arc<ServiceSigner>,
    taker_user: Uuid,
    taker_order: Uuid,
    maker_user: Uuid,
    maker_order: Uuid,
    symbol: &str,
    taker_side: Side,
    price: &str,
    qty: &str,
) {
    let store = EventStore::new(pool, signer);
    apply_trade_matched(
        pool,
        &store,
        TradeMatchedMsg {
            trade_id: Uuid::now_v7(),
            taker_order,
            maker_order,
            taker_user,
            maker_user,
            symbol: symbol.to_string(),
            taker_side,
            price: price.to_string(),
            qty: qty.to_string(),
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
#[ignore = "requires docker"]
async fn open_close_cycles_no_locked_drift() {
    let (pool, signer, _container) = setup().await;
    let buyer = Uuid::now_v7();
    let seller = Uuid::now_v7();
    fund(&pool, buyer, "10000").await;
    fund(&pool, seller, "10000").await;

    let symbol = "BTC-PERP";
    let price = "50000";
    let qty = "0.01";
    let margin = d("100"); // 0.01 * 50000 / 5

    // Run 20 open-close round-trips. Each round-trip is 4 orders:
    //   buyer BUY 0.01, seller SELL 0.01  → buyer long 0.01, seller short 0.01
    //   buyer SELL 0.01, seller BUY 0.01  → both flat
    for cycle in 0..20 {
        // OPEN: buyer BUY (taker), seller SELL (maker), fill
        let buy_open = Uuid::now_v7();
        let sell_open = Uuid::now_v7();
        seed_open_order(&pool, buy_open, buyer, symbol, Side::Buy, d(price), d(qty), margin).await;
        seed_open_order(&pool, sell_open, seller, symbol, Side::Sell, d(price), d(qty), margin).await;
        match_fill(&pool, &signer, buyer, buy_open, seller, sell_open, symbol, Side::Buy, price, qty).await;

        // Assert invariant after opening fill.
        for u in [buyer, seller] {
            let locked = account_locked(&pool, u).await;
            let expected = sum_position_locked(&pool, u).await + sum_order_locked(&pool, u).await;
            assert_eq!(
                locked, expected,
                "cycle {cycle} after open: user {u} locked={locked} expected={expected}"
            );
        }

        // CLOSE: buyer SELL (taker), seller BUY (maker), fill
        let buy_close = Uuid::now_v7();
        let sell_close = Uuid::now_v7();
        seed_open_order(&pool, buy_close, buyer, symbol, Side::Sell, d(price), d(qty), margin).await;
        seed_open_order(&pool, sell_close, seller, symbol, Side::Buy, d(price), d(qty), margin).await;
        match_fill(&pool, &signer, buyer, buy_close, seller, sell_close, symbol, Side::Sell, price, qty).await;

        for u in [buyer, seller] {
            let locked = account_locked(&pool, u).await;
            let expected = sum_position_locked(&pool, u).await + sum_order_locked(&pool, u).await;
            assert_eq!(
                locked, expected,
                "cycle {cycle} after close: user {u} locked={locked} expected={expected}"
            );
        }
    }

    // After all 20 cycles, both users should have zero locked, zero positions,
    // zero open orders, and ~$10000 available (less small fee accumulation).
    for u in [buyer, seller] {
        assert_eq!(
            account_locked(&pool, u).await,
            Decimal::ZERO,
            "user {u} leaked locked margin after 20 open-close cycles"
        );
        assert_eq!(sum_position_locked(&pool, u).await, Decimal::ZERO);
        assert_eq!(sum_order_locked(&pool, u).await, Decimal::ZERO);
        let avail = account_available(&pool, u).await;
        assert!(
            avail > d("9900") && avail <= d("10000"),
            "user {u} available {avail} outside expected range (fees ~$0-100)"
        );
    }
}

#[tokio::test]
#[ignore = "requires docker"]
async fn partial_fill_preserves_invariant() {
    let (pool, signer, _container) = setup().await;
    let buyer = Uuid::now_v7();
    let seller_a = Uuid::now_v7();
    let seller_b = Uuid::now_v7();
    fund(&pool, buyer, "1000").await;
    fund(&pool, seller_a, "1000").await;
    fund(&pool, seller_b, "1000").await;

    let symbol = "BTC-PERP";

    // Buyer places BUY 1.0 @ 100 lev 10 → margin $10.
    let buy_order = Uuid::now_v7();
    seed_open_order(&pool, buy_order, buyer, symbol, Side::Buy, d("100"), d("1.0"), d("10")).await;

    // Seller A places SELL 0.3 @ 100 lev 10 → margin $3. Fill 0.3.
    let sell_a = Uuid::now_v7();
    seed_open_order(&pool, sell_a, seller_a, symbol, Side::Sell, d("100"), d("0.3"), d("3")).await;
    match_fill(&pool, &signer, seller_a, sell_a, buyer, buy_order, symbol, Side::Sell, "100", "0.3").await;

    for u in [buyer, seller_a] {
        let locked = account_locked(&pool, u).await;
        let expected = sum_position_locked(&pool, u).await + sum_order_locked(&pool, u).await;
        assert_eq!(
            locked, expected,
            "after partial fill 0.3: user {u} locked={locked} expected={expected}"
        );
    }

    // Buyer's open order should still exist with reduced qty + margin.
    let remaining_locked = sum_order_locked(&pool, buyer).await;
    assert_eq!(remaining_locked, d("7"), "buy order should have $7 remaining margin (0.7/1.0 of $10)");

    // Seller B places SELL 0.7 @ 100 lev 10 → margin $7. Fill 0.7 (closes buyer's remaining).
    let sell_b = Uuid::now_v7();
    seed_open_order(&pool, sell_b, seller_b, symbol, Side::Sell, d("100"), d("0.7"), d("7")).await;
    match_fill(&pool, &signer, seller_b, sell_b, buyer, buy_order, symbol, Side::Sell, "100", "0.7").await;

    for u in [buyer, seller_a, seller_b] {
        let locked = account_locked(&pool, u).await;
        let expected = sum_position_locked(&pool, u).await + sum_order_locked(&pool, u).await;
        assert_eq!(
            locked, expected,
            "after full close: user {u} locked={locked} expected={expected}"
        );
    }

    // Buyer's order is now fully filled → no open orders, full position $10.
    assert_eq!(sum_order_locked(&pool, buyer).await, Decimal::ZERO);
    assert_eq!(sum_position_locked(&pool, buyer).await, d("10"));
    assert_eq!(account_locked(&pool, buyer).await, d("10"));
}
```

- [ ] **Step 4.2: Verify `apply.rs` exposes `TradeMatchedMsg` + `apply_trade_matched` as `pub`**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
grep -n "pub.*apply_trade_matched\|pub.*TradeMatchedMsg\|pub mod apply" services/internal-ledger/src/lib.rs services/internal-ledger/src/apply.rs 2>&1 | head -5
```

If `apply` is not declared as `pub mod` in `lib.rs`, add it. If `TradeMatchedMsg` is not `pub`, change `struct` to `pub struct`. The function `apply_trade_matched` already takes `pub async fn`. Similarly verify `projections` is `pub mod`. If any test imports fail to resolve, surface visibility at module declaration in `lib.rs`.

- [ ] **Step 4.3: Run the new tests (requires Docker)**

```bash
cargo test -p internal-ledger --test margin_invariant -- --ignored
```

Expected: both pass. Approximate runtime: 60-90 seconds (container start + 20 fill cycles × Postgres roundtrips).

If Docker Desktop is not running locally, run `docker ps` first; if it errors with "Cannot connect to the Docker daemon", start Docker Desktop GUI and retry. If Docker is unavailable on Mac at all, mark the local-test step DONE_WITH_CONCERNS and rely on Task 6's EC2 smoke + the production behaviour as the regression check; do not block the plan on this.

- [ ] **Step 4.4: Commit**

```bash
git add services/internal-ledger/tests/margin_invariant.rs
# If lib.rs visibility was tweaked in Step 4.2:
# git add services/internal-ledger/src/lib.rs
git commit -m "test(internal-ledger): regression tests for margin-leak fix

open_close_cycles_no_locked_drift exercises the exact scenario that
leaked $100 per close before the fix; partial_fill_preserves_invariant
covers the two-fill partial-then-full path. Both are gated #[ignore]
because they spin up a Postgres container — run with --ignored."
```

---

## Task 5: Full local test sweep + clippy

**Files:** none modified. Verification only.

- [ ] **Step 5.1: Cargo test everything that doesn't need Docker**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
cargo test
```

Expected: all default (non-`#[ignore]`) tests pass across the workspace. Pay particular attention to `internal-ledger`'s `margin::tests::*` unit tests (5 cases covering open-from-zero, partial reduce, full close, cross-zero, add-same-direction); they exercise `recompute` independently of the new orders.rs helper, so they should be unaffected.

If `internal-ledger` has additional non-ignored tests today, they should also pass without modification — the fix is additive within `apply_trade_matched` and doesn't change `margin::recompute` semantics.

- [ ] **Step 5.2: Cargo test with --ignored (requires Docker)**

```bash
cargo test -p internal-ledger -- --ignored
```

Expected: previously-existing ignored tests (`tests/migrations.rs`'s two tests) still pass, plus the two new `margin_invariant` tests. Total ~4 ignored tests. Skip this step if Docker is unavailable locally — Task 6's EC2 smoke covers the same ground in production.

- [ ] **Step 5.3: Clippy strict**

```bash
cargo clippy -p internal-ledger -- -D warnings
cargo clippy --all-targets -- -D warnings
```

Expected: both clean. No new warnings from any of Tasks 1-4.

- [ ] **Step 5.4: No commit**

This task only verifies. If any of the above fails, fix the underlying issue (in the appropriate prior task's file) and re-run — do not commit a "fix" until you understand which task introduced the regression.

---

## Task 6: Deploy to EC2, reset historical phantom margin, verify

**Files:** none modified. Operational only.

- [ ] **Step 6.1: Build + restart services on EC2**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
bash scripts/dev/services-remote.sh build
```

Expected: rsync completes; `cargo build --release` runs on EC2 (5-10 min). If SSH drops mid-build:

```bash
# Recover via marker-file pattern. Run on EC2 in background; poll locally.
ssh -o ConnectTimeout=30 -o ServerAliveInterval=10 -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'cd ~/rocky-backend-stack && rm -f /tmp/build.exit && nohup setsid bash -c "source ~/.cargo/env && cargo build --release -p internal-ledger -p api-gateway > /tmp/build.log 2>&1; echo \$? > /tmp/build.exit" < /dev/null > /dev/null 2>&1 & echo started'

# Poll until done
ssh ... 'until [ -f /tmp/build.exit ]; do sleep 10; done; echo "exit=$(cat /tmp/build.exit)"; tail -5 /tmp/build.log'
```

Then:

```bash
bash scripts/dev/services-remote.sh restart
```

Expected: `==> all 8 services up` with new PIDs.

- [ ] **Step 6.2: One-time SQL reset of phantom locked balances**

This corrects historical drift accumulated by the bug before the fix. Run on EC2:

```bash
ssh -o ConnectTimeout=30 -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'docker exec -i rocky-backend-stack-postgres-1 psql -U rocky -d rocky' <<'SQL'
WITH desired AS (
    SELECT
        a.user_id, a.asset,
        COALESCE(p.psum, 0) + COALESCE(o.osum, 0) AS desired_locked
    FROM ledger.accounts a
    LEFT JOIN (
        SELECT user_id, 'USDC'::text AS asset, SUM(locked_margin) AS psum
        FROM ledger.positions GROUP BY user_id
    ) p ON p.user_id = a.user_id AND p.asset = a.asset
    LEFT JOIN (
        SELECT user_id, 'USDC'::text AS asset, SUM(margin_locked) AS osum
        FROM ledger.orders_open GROUP BY user_id
    ) o ON o.user_id = a.user_id AND o.asset = a.asset
)
UPDATE ledger.accounts a
SET locked = desired.desired_locked,
    available = a.available + (a.locked - desired.desired_locked),
    updated_at = now()
FROM desired
WHERE a.user_id = desired.user_id AND a.asset = desired.asset
  AND a.locked != desired.desired_locked
RETURNING a.user_id, a.locked AS new_locked, a.available AS new_available;
SQL
```

Expected: at minimum the two bot users (MM `5cfb031b-5936-4467-9533-cd2df576dbb8` and Taker `0252d054-c3d2-4df6-bf14-805058321235`) appear in `RETURNING` output with `new_locked` much smaller than before (close to their `positions.locked_margin` totals).

- [ ] **Step 6.3: Restart rocky-bot to flush in-memory state**

```bash
ssh -o ConnectTimeout=30 -o ServerAliveInterval=10 -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'systemctl --user restart rocky-bot && sleep 5 && systemctl --user is-active rocky-bot'
```

Expected: `active`.

- [ ] **Step 6.4: Run the existing trading-e2e smoke**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
bash tests/smoke/trading-e2e.sh
```

Prereqs: `make tunnel` open in another shell (per the script's header). The script's penultimate line asserts `"locked":"100"` after a single open fill — must still pass. Expected final line: `ALL TRADING E2E OK`.

If `make tunnel` is awkward to run locally, you can replicate the assertion directly via the EC2-internal curl:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 bash <<'REMOTE'
USER_BUY=$(uuidgen | tr '[:upper:]' '[:lower:]')
USER_SELL=$(uuidgen | tr '[:upper:]' '[:lower:]')
curl -sf -X POST http://127.0.0.1:18080/v1/deposits/seed -H 'Content-Type: application/json' \
  -d "{\"user_id\":\"$USER_BUY\",\"asset\":\"USDC\",\"amount\":\"10000\"}"
curl -sf -X POST http://127.0.0.1:18080/v1/deposits/seed -H 'Content-Type: application/json' \
  -d "{\"user_id\":\"$USER_SELL\",\"asset\":\"USDC\",\"amount\":\"10000\"}"
sleep 3
curl -sf -X POST http://127.0.0.1:18080/v1/orders -H 'content-type: application/json' \
  -d "{\"user_id\":\"$USER_SELL\",\"symbol\":\"BTC-PERP\",\"side\":\"SELL\",\"price\":\"50000\",\"qty\":\"0.01\",\"leverage\":5,\"idempotency_key\":\"e2e-$RANDOM\"}"
curl -sf -X POST http://127.0.0.1:18080/v1/orders -H 'content-type: application/json' \
  -d "{\"user_id\":\"$USER_BUY\",\"symbol\":\"BTC-PERP\",\"side\":\"BUY\",\"price\":\"50000\",\"qty\":\"0.01\",\"leverage\":5,\"idempotency_key\":\"e2e-$RANDOM\"}"
sleep 5
echo "buyer USDC:"
curl -sf "http://127.0.0.1:18080/v1/account/$USER_BUY/USDC"; echo
REMOTE
```

The buyer JSON must have `"locked":"100"` (or `"100.0..."` with trailing zeros). If `"locked"` shows `"0"`, the fix accidentally over-releases — back out to Task 2 and re-examine the position-growth lock branch.

- [ ] **Step 6.5: Verify rocky-bot is producing fresh fills**

Wait 2 minutes, then check fresh trades:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "SELECT symbol, ts FROM ledger.trades ORDER BY ts DESC LIMIT 5"'
```

Expected: top row `ts` within the last 2 minutes.

Also check the bot's journal for any new `-2010`:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'journalctl --user -u rocky-bot --since "2 min ago" --no-pager 2>&1 | grep -c "-2010"'
```

Expected: 0 (or at most a small handful during the brief window between bot restart and the first balance poll).

- [ ] **Step 6.6: Monitor for 30 minutes — phantom margin must not regrow**

Capture a baseline:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "SELECT user_id, locked, available FROM ledger.accounts WHERE user_id IN (decode('"'"'5cfb031b59364467 9533cd2df576dbb8'"'"', '"'"'hex'"'"')::uuid, decode('"'"'0252d054c3d24df6 bf14805058321235'"'"', '"'"'hex'"'"')::uuid)"'
```

(If the inline-hex form is brittle, just `WHERE user_id::text LIKE '5cfb031b%' OR user_id::text LIKE '0252d054%'`.)

Repeat the query every 5-10 minutes for 30 minutes. The expected pattern is `locked` oscillating in a bounded range (rises slightly while orders are open, falls back when fills happen). It must not monotonically increase.

If `locked` clearly trends upward across all 4 samples, the fix is incomplete — escalate with the time series + a few sample `ledger.trades` rows from the same window.

- [ ] **Step 6.7: Record success, no commit**

Once 6.6 shows bounded `locked` over 30 minutes, the deployment is verified. No git commit; this task creates no code change.

---

## Task 7: Push to GitHub

**Files:** none modified.

- [ ] **Step 7.1: Push the four prior commits**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git push origin main
```

Expected: 3-4 commits pushed (Task 1, Task 2, Task 3 are guaranteed; Task 4's commit is conditional on the test file being added).

- [ ] **Step 7.2: Verify**

```bash
git log --oneline origin/main..HEAD
```

Expected: empty (everything pushed).

---

## Final Acceptance Checklist

Run all of the following — every line must succeed before declaring the plan done.

- [ ] `cargo test` (workspace) passes locally — no regressions.
- [ ] `cargo test -p internal-ledger -- --ignored` passes locally (or, if no local Docker, Task 6's EC2 smoke covers this).
- [ ] `cargo clippy --all-targets -- -D warnings` clean.
- [ ] EC2 deploy: `services-remote.sh restart` shows all 8 services up.
- [ ] SQL reset returned at least the two bot user_ids in `RETURNING`.
- [ ] `tests/smoke/trading-e2e.sh` (or its EC2-internal equivalent) reports `buyer.locked == "100"` and `ALL TRADING E2E OK`.
- [ ] `ledger.trades` shows a row with `ts` within the last 2 min after bot restart.
- [ ] `accounts.locked` for the two bot users does NOT trend upward over a 30-minute observation window.
- [ ] All commits pushed to `origin/main`.

When all checked, the margin-leak fix is complete and rocky-bot's demo should keep producing fresh fills indefinitely.

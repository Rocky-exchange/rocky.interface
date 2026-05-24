# Margin-Leak Fix Design — internal-ledger `apply_trade_matched`

**Date:** 2026-05-24
**Status:** Draft for review
**Repo:** `rocky-backend`
**Related:** rocky-bot demo stalling with `-2010 Account has insufficient balance` after a few hours of trading.

## Goal

Fix the accounting bug where `accounts.locked` grows monotonically across
trade fills and never gets released, eventually exhausting `accounts.available`
and stalling all new orders with `-2010`.

Restore the invariant:

```
accounts.locked == sum(positions.locked_margin)
                 + sum(orders_open.margin_locked)
```

…across every place / fill / cancel cycle, for any sequence of orders.

## Non-goals

- No schema changes.
- No new gRPC methods.
- No change to the trading-router / matching-engine plumbing.
- No fee/funding accounting changes.
- No change to `apply_margin_recompute`'s shrinkage release path.

## Root cause

`accounts::lock_margin(margin_required)` runs at order **placement**
(`service.rs:47`), moving `margin_required` from `available` → `locked`
and inserting an `orders_open` row with the same value.

On **cancel**, `service.rs:222-225` releases the full `margin_locked` of
the row before deleting it. Correct.

On **fill**, `apply.rs::apply_trade_matched` invokes
`apply_margin_recompute`, which compares the *position*'s `before_locked`
vs `new_locked` and releases the delta for shrinkage. For a
position-CLOSING fill it correctly releases the closing position's
margin — but **the closing order's own placement-time margin is never
released**. The row is deleted from `orders_open`, the position-side
accounting balances, but the `accounts.locked` entry from the placement
of the closing order stays behind forever.

Worked example (single user, full open + full close):

| Step | accts.available | accts.locked | positions.locked | orders_open |
|---|---|---|---|---|
| seed $10000 | 10000 | 0 | 0 | — |
| place BUY 0.01@50000 lev5 (margin $100) | 9900 | 100 | 0 | 1 row m=$100 |
| fill: position 0 → +0.01 | 9900 | 100 | 100 | (deleted) |
| place SELL 0.01@50000 lev5 | 9800 | 200 | 100 | 1 row m=$100 |
| fill: position +0.01 → 0 | 9900 | **100** | 0 | (deleted) |
| invariant check | should be 0+0=0 | actual 100 | | **LEAK $100** |

For the bot's Taker doing many open/close cycles, the leak compounds:
~$3.78 per BTC close, ~$2 per ETH close. Hours of trading → $200+
phantom locked → `available` near zero → all new orders rejected.

## Architecture — release order margin + re-lock position growth

A naïve "just release order_margin × fill/pre_remaining on every fill"
breaks the OPEN scenario covered by the existing e2e
(`tests/smoke/trading-e2e.sh:59` asserts `"locked":"100"` after a
single open fill). The order's $100 must STAY in `accounts.locked`
after the fill, just relabeled from "order margin" to "position
margin".

The correct two-step rebalance per side inside `apply_trade_matched`:

1. **Release order margin**: `accounts.locked -= order_margin × fill / pre_remaining`. Always fires.
2. **Lock position growth**: if `apply_margin_recompute` reports `new_locked > before_locked`, also `accounts.locked += (new_locked − before_locked)`.

Net change to `accounts.locked` per fill side:

| Fill kind | order release | position growth | net Δaccts.locked |
|---|---|---|---|
| Open from 0 | −M_order | +M_position | ≈ 0 (=order placed at fill price) |
| Add same direction | −M_order | +M_growth | small (price drift) |
| Reduce | −M_order | apply_margin_recompute releases shrinkage | −M_order − shrinkage |
| Full close to 0 | −M_order | apply_margin_recompute releases full position | −M_order − M_position_old |

For the bug scenario (full close): order's $100 released + position's
$100 released = `accounts.locked` drops by both. No leak. ✓

For a fresh open: order's $100 released + position's $100 newly locked
= net zero change to `accounts.locked`. Existing e2e still sees
`"locked":"100"`. ✓

`apply_margin_recompute` keeps responsibility for shrinkage releases
(unchanged). `apply_trade_matched` gains responsibility for ORDER
margin release + position-GROWTH locks.

### Flow per `apply_trade_matched` call (per side)

```
1-3.  (unchanged) event append, positions::apply_fill
4.    (unchanged) capture before_locked PRE-recompute
4a.   (unchanged) apply_margin_recompute → MarginUpdate { new_locked, unlock_amount, ... }
                  side-effect: positions.locked_margin = new_locked
                  side-effect: if unlock_amount > 0, accounts.locked -= unlock_amount
5.    (unchanged) fee billing
6.    (REPLACED) orders::decrement_with_margin_release(order_id, qty)
                 → (order_release, new_remaining)
6a.   (NEW)      accounts::unlock_margin(user, asset, order_release)
6b.   (NEW)      if new_locked > before_locked:
                     ok = accounts::lock_margin(user, asset, new_locked - before_locked)
                     if !ok: return Err(anyhow!("invariant violation: ..."))
7.    (unchanged) insert per-user trade rows
```

Step 6a MUST run before 6b within the same tx. `accounts::lock_margin`
requires `available >= amount`. For a fresh open, `available` is
sufficient only because step 6a just credited it with `order_release`
(within the same tx; effects are visible to the next SELECT/UPDATE in
that tx).

## Code changes

### `services/internal-ledger/src/projections/orders.rs`

Add one new fn. Mark three existing fns as deletion candidates (verify
no other callers).

```rust
/// Apply a fill against an open order: reduce qty_remaining and
/// margin_locked proportionally, delete the row if fully filled,
/// and return the margin amount to release to accounts.
///
/// Returns:
///   - Some((release_amount, new_remaining)) if the order existed.
///   - None if the order is not in orders_open (already filled or
///     cancelled by a concurrent path — fill is a no-op).
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
        "SELECT qty_remaining, margin_locked
         FROM orders_open
         WHERE order_id = $1
         FOR UPDATE",
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
        sqlx::query("DELETE FROM orders_open WHERE order_id = $1")
            .bind(order_id)
            .execute(&mut **tx)
            .await?;
    } else {
        sqlx::query(
            "UPDATE orders_open
             SET qty_remaining = $2, margin_locked = $3
             WHERE order_id = $1",
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

Slated for deletion (verify zero callers across the workspace before
removing):

- `orders::decrement_remaining`
- `orders::delete_if_fully_filled`

Keep `apply::fetch_order_margin` (or rename to
`fetch_order_margin_and_qty` returning `(margin_locked, qty)`) since
the leverage derivation at apply.rs:138-152 still needs the original
order margin pre-decrement. Call it BEFORE step 4 (apply_margin_recompute
needs leverage), which is before step 6's FOR UPDATE — no lock
conflict.

### `services/internal-ledger/src/apply.rs::apply_trade_matched`

Replace step 6 (currently lines ~204-217). Add the new step 6a + 6b.
Keep all other steps unchanged.

Before (delete):

```rust
if let Some(rem) = orders::decrement_remaining(&mut tx, msg.taker_order, qty).await? {
    if rem <= Decimal::ZERO {
        orders::delete_if_fully_filled(&mut tx, msg.taker_order).await?;
    }
}
// (same for maker)
```

After (replace):

```rust
// Capture position margin BEFORE recompute (already captured at line ~108
// as taker_pre_locked, maker_pre_locked).

// 6. Reduce orders_open + compute order margin release per side.
let taker_release = orders::decrement_with_margin_release(
    &mut tx, msg.taker_order, qty,
).await?.map(|(r, _)| r).unwrap_or(Decimal::ZERO);
let maker_release = orders::decrement_with_margin_release(
    &mut tx, msg.maker_order, qty,
).await?.map(|(r, _)| r).unwrap_or(Decimal::ZERO);

// 6a. Release order margin from accounts.locked for both sides.
if taker_release > Decimal::ZERO {
    accounts::unlock_margin(&mut tx, msg.taker_user, &asset, taker_release).await?;
}
if maker_release > Decimal::ZERO {
    accounts::unlock_margin(&mut tx, msg.maker_user, &asset, maker_release).await?;
}

// 6b. If position grew, lock the growth back into accounts.locked.
//     u_* is the MarginUpdate returned by apply_margin_recompute above
//     (currently the call discards the return; capture it).
let taker_growth = u_taker.new_locked - taker_pre_locked;
if taker_growth > Decimal::ZERO {
    let ok = accounts::lock_margin(&mut tx, msg.taker_user, &asset, taker_growth).await?;
    if !ok {
        anyhow::bail!(
            "invariant violation: insufficient available for taker position growth lock"
        );
    }
}
let maker_growth = u_maker.new_locked - maker_pre_locked;
if maker_growth > Decimal::ZERO {
    let ok = accounts::lock_margin(&mut tx, msg.maker_user, &asset, maker_growth).await?;
    if !ok {
        anyhow::bail!(
            "invariant violation: insufficient available for maker position growth lock"
        );
    }
}
```

The existing `apply_margin_recompute` calls (lines ~155 and ~167) need
to bind their returns: `let u_taker = apply_margin_recompute(...)`,
`let u_maker = apply_margin_recompute(...)`. Currently they discard.

Remove the dead `let _ = accounts::unlock_margin;` shim at line ~229.

### `services/internal-ledger/src/projections/accounts.rs`

No change. `lock_margin` and `unlock_margin` already exist with the
right signatures.

## Partial-fill walk-through (single order)

User has $100 available. Places BUY 1.0@100 lev10 → margin $10.

| Step | accts.available | accts.locked | orders_open | positions |
|---|---|---|---|---|
| after place | 90 | 10 | qty_rem=1.0, m=10 | qty=0, locked=0 |
| fill 0.3 @ 100 | | | | |
|   6: decrement_with_margin_release | | | qty_rem=0.7, m=7 | (apply_fill writes qty=0.3) |
|   6a: unlock $3 | 93 | 7 | | |
|   4a: apply_margin_recompute (before=(0,0,0), new=(0.3,100,3)) | | | | locked=3 (growth +3) |
|   6b: lock $3 (growth) | 90 | 10 | qty_rem=0.7, m=7 | qty=0.3, locked=3 |
| invariant | locked=10 = 7 + 3 ✓ | | | |
| fill 0.7 @ 100 (closes the rest of order, grows position to 1.0) | | | | |
|   6: decrement | | | (deleted, qty_rem=0) | (apply_fill writes qty=1.0) |
|   6a: unlock $7 | 97 | 3 | | |
|   4a: apply_margin_recompute (before=(0.3,100,3), new=(1.0,100,10)) | | | | locked=10 (growth +7) |
|   6b: lock $7 | 90 | 10 | (none) | qty=1.0, locked=10 |
| invariant | locked=10 = 0 + 10 ✓ | | | |

The bug-scenario close cycle now balances cleanly (working through it
is straightforward, omitted for brevity).

## Tests

Two test files, both gated `#[ignore = "requires docker"]` and run
explicitly with `cargo test -- --ignored` per the existing convention
(`services/internal-ledger/tests/migrations.rs`).

### `services/internal-ledger/tests/margin_invariant.rs` (new)

End-to-end against real Postgres via `testcontainers`. Mirrors the
existing `migrations.rs` setup. Two tests:

1. **`open_close_cycles_no_locked_drift`** — the regression test for
   the bug. Two users seeded $10000 each. Run 20 open-close cycles
   (BUY 0.01 → SELL 0.01 → BUY 0.01 → SELL 0.01 …). After each pair
   of cycles, assert both users' `accounts.locked` equals
   `sum(positions.locked_margin) + sum(orders_open.margin_locked)`.
   Final state must have both users at `accounts.locked == 0`,
   `positions.locked_margin == 0`, `orders_open empty`.

2. **`partial_fill_preserves_invariant`** — one user places BUY 1.0,
   another user places SELL 0.3, then SELL 0.7 (separate orders,
   total fills the 1.0). After each fill, assert invariant on both
   users. After the second fill, the buy order's `orders_open` row is
   gone; assert buyer's `accounts.locked == positions.locked_margin
   == 10` (= 1.0 × 100 / 10).

Helper: a `fixture.rs` (sibling) with `seed_deposit(pool, user,
amount)`, `place_order(pool, user, side, price, qty, leverage)`,
`apply_trade(pool, taker, maker, side, price, qty)` that calls the
real service methods. ~150 lines total of test scaffolding.

### Unit test on `decrement_with_margin_release` (in `orders.rs::tests`)

Pure SQL behaviour, requires Postgres. Skip in CI by default
(`#[ignore]`). Cases:

- full fill: pre_rem=1.0, pre_locked=10, fill=1.0 → release=10, row deleted
- partial fill: pre_rem=1.0, pre_locked=10, fill=0.3 → release=3, row updated (rem=0.7, m=7)
- overfill defensive: fill > pre_rem → fill_q = min(fill, pre_rem), release proportional
- non-existent order: returns None

## Migration / rollout

1. Implement code + tests; `cargo build && cargo test -- --ignored` clean.
2. Push to git (no schema migration).
3. Deploy: `bash scripts/dev/services-remote.sh build` then `restart`.
4. **One-time reset of historical phantom-locked balances** via SQL:

```sql
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
  AND a.locked != desired.desired_locked;
```

Run once on EC2 Postgres after deploying the fix. Restart rocky-bot
to flush any in-memory state. Monitor `accounts.locked` for the bot's
two users over 1 hour; it must oscillate within a bounded range, not
grow monotonically.

5. Verify with `tests/smoke/trading-e2e.sh` against live deployment;
   the existing assertion `"locked":"100"` after open fill must still
   pass.

## Acceptance criteria

- All existing rocky-backend `cargo test` and `cargo test -- --ignored`
  pass.
- New `margin_invariant::open_close_cycles_no_locked_drift` passes.
- `tests/smoke/trading-e2e.sh` runs green against EC2 deployment.
- After one-time SQL reset + 1 hour of rocky-bot trading on EC2,
  query `SELECT user_id, locked FROM ledger.accounts WHERE user_id IN
  (MM, TAKER)` shows `locked` not growing monotonically.
- rocky-bot journal shows zero `-2010 insufficient balance` warnings
  over a 30-minute window.

## Out of scope / future work

- Matching-engine BookSnapshot wiring (`book_registry.rs` TODO from
  plan-5-followup) — UI orderbook depth display still empty after
  this fix.
- IOC / FOK order types (would obviate phantom orders entirely).
- Replay-on-startup for matching-engine OrderBook (so a service
  restart doesn't lose in-memory book state).

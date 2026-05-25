# Phantom-Trade Fix Design

**Status:** Spec — needs implementation plan + execution.
**Date:** 2026-05-25
**Predecessors:**
- [2026-05-24 30-account funnel design](./2026-05-24-rocky-bot-30-account-funnel-design.md) — deployed; saturated within 30 min
- [2026-05-25 rocky-bot position-cap fix design](./2026-05-25-rocky-bot-position-cap-fix-design.md) — deployed; cap-gate fires correctly but margin still saturates because of phantom locked margin in `accounts.locked`

## Problem

After deploying the bot-side position-cap fix (15 commits unpushed at HEAD `1ae6f1a`), the 30-account funnel still saturated within 30 min: max(`accounts.locked`) = $98.83, `-2010` count = 1309 over 30 min, 26 of 30 accounts pinned over $80.

The bot-side gate **is firing correctly** — startup journal showed 3430 cap-skip events in 5 min with messages like:

```
ladder[mm-l3-sell-050bps,BTC-PERP] at cap: pos=0.000000 mark=77227.35 would_be_notional=154.45 cap=150.00 → skip place
```

But the backend invariant claimed by 2026-05-24 commit `7709280`:

```
accounts.locked == sum(positions.locked_margin) + sum(orders_open.margin_locked)
```

is severely violated in production. Per-account inspection (sample 4 at t=32min):

| account | acct.locked | pos+ord | **phantom** |
|---|---|---|---|
| mm-l1-sell-09bps | 98.83 | 25.29 | **73.54** |
| mm-l1-sell-08bps | 98.10 | 24.17 | **73.93** |
| taker-5 | 96.74 | 19.23 | **77.50** |
| mm-l1-sell-06bps | 96.05 | 33.96 | **62.09** |
| mm-l1-sell-07bps | 95.99 | 25.01 | **70.98** |
| taker-4 | 95.98 | 25.99 | **69.98** |

Phantom = $30–$78 per saturated account.

## Root Cause

Read `services/internal-ledger/src/apply.rs:141-152`:

```rust
let taker_leverage: u32 = if taker_order_margin.is_zero() {
    1
} else {
    let lev_d = (notional / taker_order_margin).round_dp(0);
    rust_decimal::prelude::ToPrimitive::to_u32(&lev_d).unwrap_or(1).max(1)
};
```

When `fetch_order_margin` returns `Decimal::ZERO` for a given order, leverage falls back to **1** (instead of the actual 10× the position was sized at). `apply_margin_recompute` then computes `new_locked = |qty| × entry / 1 = full notional` instead of `notional / 10`, and `accounts::lock_margin(maker_growth)` adds the inflated value to `accounts.locked`. The order's proportional margin release returns `Decimal::ZERO` (no order row exists), so there's no offsetting unlock. The difference between the inflated lock and the eventually-correct `positions.locked_margin` (which gets overwritten by the next real fill) becomes phantom margin in `accounts.locked`.

**Why orders go missing:** the rocky-backend services (matching-engine, internal-ledger, api-gateway) have been running natively (not Docker) since May 24 and were never restarted across either T8 (yesterday) or T5 (today) SQL resets. Matching-engine's in-memory order book holds stale order references that point at rows the SQL reset wiped from `orders_open`. When ME matches a fresh aggressive against one of those stale makers, internal-ledger sees a `TradeMatched` event with a `maker_order` UUID that doesn't exist in `orders_open` → leverage=1 path → phantom margin.

Math check: BTC L1 at $77000, qty 0.0005 → notional $38.5. Leverage-10 margin = $3.85. Leverage-1 margin = $38.50. Per-fill phantom = $34.65. Observed average phantom ~$60-$75 = roughly 2 stale-match fills per account. Matches the data.

The 2026-05-24 backend margin-leak fix is correct for the happy path. It just doesn't defend against missing orders.

## Solution

Two changes, shipped together across rocky-backend and rocky-bot:

### Change A: Backend phantom-trade refusal (rocky-backend)

In `services/internal-ledger/src/apply.rs`, immediately after both `fetch_order_margin` calls (apply.rs:98-99), add:

```rust
if taker_order_margin.is_zero() || maker_order_margin.is_zero() {
    error!(
        trade_id = %msg.trade_id,
        taker_order = %msg.taker_order,
        maker_order = %msg.maker_order,
        symbol = %msg.symbol,
        taker_missing = taker_order_margin.is_zero(),
        maker_missing = maker_order_margin.is_zero(),
        "phantom trade: order not found in orders_open — refusing trade and asking matching-engine to drop orphan(s)"
    );
    // Publish cancels for the orphan order(s) so matching-engine drops them
    // from its in-memory book. Subject + payload match service.rs:240-255.
    for (oid, missing) in [
        (msg.taker_order, taker_order_margin.is_zero()),
        (msg.maker_order, maker_order_margin.is_zero()),
    ] {
        if missing {
            #[derive(serde::Serialize)]
            struct CancelMsg { order_id: Uuid, symbol: String }
            let _ = nats.publish_json(
                &format!("orders.cancelled.{}", msg.symbol),
                &CancelMsg { order_id: oid, symbol: msg.symbol.clone() },
            ).await;
        }
    }
    // Transaction has no writes yet — early return rolls it back implicitly.
    return Ok(());
}
```

This requires plumbing `&async_nats::Client` into `apply_trade_matched`. The caller in `nats_in.rs::run_trade_matched_consumer` already owns the client — pass it through:

```rust
// services/internal-ledger/src/nats_in.rs
// Change line 28 from:
if let Err(e) = apply_trade_matched(&pool, &store, parsed).await {
// to:
if let Err(e) = apply_trade_matched(&pool, &store, &nats, parsed).await {
```

`apply_trade_matched` signature gets a new `nats: &async_nats::Client` parameter inserted before `msg`.

**Key invariants preserved:**
- Returns `Ok(())` (not `Err`) — we don't want the NATS consumer to retry the phantom trade forever
- Early return is BEFORE any DB writes (the prior `store.append_in_tx`, `positions::apply_fill`, etc.) — txn rolls back cleanly
- Publishing the cancel is best-effort (ignore failure) — if NATS is down, the next reset.sh run will clean up

### Change B: Operational reset script (rocky-bot)

New file: `scripts/reset.sh`. One-shot reset of all funnel state. Idempotent.

Steps (in order):
1. SSH: `systemctl --user stop rocky-bot`
2. SSH + docker exec psql: zero `positions.qty` + `positions.locked_margin`, return `accounts.locked` → `accounts.available`, DELETE all rows from `orders_open` for `mm-%` and `taker-%` labelled users
3. SSH: kill matching-engine PID + relaunch via `nohup ./target/release/matching-engine &`
4. Sleep 3 seconds (ME startup time — it reloads from the now-empty `orders_open`)
5. SSH: `systemctl --user restart rocky-bot`

Uses ssh ControlMaster (already enabled from prior round's commits `ed23a13` / `9215324`). All SSH operations route through one connection.

**Why this works:** With the matching engine's in-memory book flushed and re-synced against an empty `orders_open`, the first batch of bot orders form a clean book. The backend fix from Change A is the safety net for any future race where an orphan slips through (e.g., a cancel-vs-fill race, a process restart that loses messages in flight).

## Files Changed

| File | Change |
|---|---|
| `rocky-backend/services/internal-ledger/src/apply.rs` | Add phantom-trade check + publish cancels + early return after the two `fetch_order_margin` calls. Add `nats: &async_nats::Client` parameter. |
| `rocky-backend/services/internal-ledger/src/nats_in.rs` | Pass `&nats` to `apply_trade_matched`. |
| `rocky-backend/services/internal-ledger/tests/phantom_trade.rs` (new) OR extend existing integration test file | Test: seed a real maker order, send a `TradeMatched` with a non-existent taker UUID, assert no row changes + cancel NATS published. |
| `rocky-bot/scripts/reset.sh` (new) | One-shot reset script (40-line bash). chmod +x. |

## Untouched

- `services/internal-ledger/src/margin.rs` — formula is correct; only the leverage derivation was wrong
- `services/internal-ledger/src/projections/*.rs` — accounts/orders/positions logic is correct
- All other rocky-backend crates and services
- All rocky-bot strategy files (the position-cap gate from yesterday's commits stays as-is)
- rocky-bot `deploy.sh`, `mint-30.sh`, `.keys.json`
- Funnel geometry (qty table, offset bps grid, 30-account layout)

## Testing

### Backend regression test

Use `sqlx::test` with the existing test fixtures. Outline:

```rust
#[sqlx::test]
async fn phantom_taker_order_is_refused(pool: PgPool) {
    // Arrange:
    //   - Seed users + USDC accounts
    //   - Seed ONE real maker order in orders_open
    //   - Snapshot accounts.locked + positions before
    //   - Spin up a NATS test client and subscribe to "orders.cancelled.>"
    //
    // Act:
    //   - Build a TradeMatched with taker_order = Uuid::new_v4() (non-existent)
    //   - Call apply_trade_matched(&pool, &store, &nats, msg)
    //
    // Assert:
    //   - returns Ok(())
    //   - accounts.locked unchanged
    //   - positions unchanged
    //   - orders_open unchanged (the real maker order still has its full qty)
    //   - one OrderCancelled message received for the taker_order UUID
}
```

Plus run the existing `db467d8` regression tests for `internal-ledger` to confirm no happy-path regression.

### Bot-side

No new bot tests. `scripts/reset.sh` is operational — verified by running it as part of the deploy procedure.

## Deploy Procedure

1. **Local**: `cargo build -p internal-ledger --release` then `cargo test -p internal-ledger` (all green including the new phantom test)
2. **Local**: `bash -n rocky-bot/scripts/reset.sh && chmod +x rocky-bot/scripts/reset.sh`
3. **EC2 backend**: `bash rocky-backend/scripts/dev/services-remote.sh build && bash rocky-backend/scripts/dev/services-remote.sh restart internal-ledger` (compiles + replaces the running binary)
4. **Local**: `bash rocky-bot/scripts/reset.sh` (one-shot reset + restart of bot + matching-engine)
5. **30-min monitor** (4 samples every 10 min, same query shape as last round):
   - **Acceptance:** `max(locked) < $50` at sample 4
   - **Acceptance:** all samples `over_80 == 0`
   - **Acceptance:** `-2010` count over 30 min `< 30`
   - **Acceptance:** recent trades within last minute
6. **If pass:**
   - Push rocky-backend commits: `cd rocky-backend && git push origin main`
   - Push rocky-bot commits: `cd rocky-bot && git push origin main` (the 15 prior unpushed commits + any new reset.sh commit)
7. **If fail:** stop the bot, do not push either repo, report the latest sample output

## Out of Scope

- Schema changes (the bug is in computation, not data model)
- Adding a `leverage` column to `positions` to recover when orders are missing (refusing the trade is simpler + correct)
- Reconciling already-polluted production data — `reset.sh` returns state to clean zero, so existing pollution is irrelevant
- Bot-side strategy changes (the cap-gate from yesterday's commits is correct)
- Persistence model for matching-engine in-memory book (a much bigger redesign; today's "kill + restart" is fine for the demo environment)
- Reconciliation tooling to detect future invariant violations in production (worth doing eventually, but YAGNI for this fix)

# Margin-Leak Instrumentation Design

**Status:** Spec — diagnostic round, no production fix.
**Date:** 2026-05-25
**Predecessors:**
- [2026-05-25 phantom-trade fix](./2026-05-25-phantom-trade-fix-design.md) — fixed one leak source (matching-engine stale book → leverage=1 fallback); verified working in production but margin saturation persists, so a second independent leak exists.

## Problem

After two production fixes (bot-side position-cap and backend phantom-trade refusal), the 30-account funnel still saturates `accounts.locked` within 13 minutes. Sample 2 (t=13min) showed:
- max(`locked`) = $97.50
- 17 of 30 accounts over $80
- -2010 errors = 642 in 15 min
- Phantom-trade ERROR count = 1 (the new check engaged once, then no more)

Per-account invariant query confirms `accounts.locked − sum(positions.locked_margin) − sum(orders_open.margin_locked) = $45-$84` of unexplained "phantom" locked margin per saturated account.

**Static code review found no bug.** Every traced path (`place_order`, `cancel_order`, `apply_trade_matched`, `apply_margin_recompute`, partial fills, cancel-vs-fill races) preserves the invariant. The leak is real but invisible without runtime evidence.

## Goal

Add runtime instrumentation that pinpoints **the exact trade event** that breaks the invariant `accounts.locked == sum(positions.locked_margin) + sum(orders_open.margin_locked)`. This round produces diagnostic data, not a production fix. A follow-up spec will design the actual fix once we know what's breaking.

## Solution

Add a per-user invariant check at the END of `apply.rs::apply_trade_matched`, just before `tx.commit()`. Read `(locked, sum(positions.locked_margin), sum(orders_open.margin_locked))` for both `taker_user` and `maker_user`. If the difference exceeds a rounding tolerance ($0.01), emit `tracing::error!` with all relevant context. Always commit the transaction (do not roll back — this is observation, not enforcement).

The first trade event that fires the ERROR will give us:
- Trade identifiers (`trade_id`, `taker_order`, `maker_order`, `symbol`, `price`, `qty`)
- Per-user before/after numbers (`pre_qty`, `pre_entry`, `pre_locked`, `signed_fill`, `locked`, `pos_sum`, `ord_sum`, `diff`)
- Which branch of `recompute()` ran (open / add / reduce / close / cross-zero)

Five to ten such log lines from a 5-minute bot run should reveal the pattern. The follow-up fix spec uses that data to make a targeted code change.

## Files Changed

| File | Change |
|---|---|
| `rocky-backend/services/internal-ledger/src/apply.rs` | Add private helper `async fn read_user_invariant(tx, user_id, asset) -> sqlx::Result<(Decimal, Decimal, Decimal, Decimal)>` returning `(locked, pos_sum, ord_sum, diff)`. Call it at the end of `apply_trade_matched` for both users; if `diff.abs() > 0.01`, emit `error!()` with full context. Commit unchanged. |

## Untouched

- Every other rocky-backend file (margin.rs, projections, service.rs, fees.rs, funding.rs, chain_events.rs)
- All rocky-bot files (cap-gate from prior rounds stays as-is)
- `scripts/reset.sh` (still has the documented ME-restart-env bug; use manual recipe for this round)
- Tests — the live deployment is the experiment; if the ERROR fires we have the data, if not we look elsewhere
- Cargo.toml — no new dependencies (uses already-imported `tracing::error` and `sqlx::Decimal`)

## Helper Function Sketch

```rust
async fn read_user_invariant<'t>(
    tx: &mut sqlx::Transaction<'t, sqlx::Postgres>,
    user_id: Uuid,
    asset: &str,
) -> sqlx::Result<(Decimal, Decimal, Decimal, Decimal)> {
    let (locked,): (Decimal,) = sqlx::query_as(
        "SELECT locked FROM ledger.accounts WHERE user_id = $1 AND asset = $2"
    ).bind(user_id).bind(asset).fetch_one(&mut **tx).await?;
    let (pos_sum,): (Option<Decimal>,) = sqlx::query_as(
        "SELECT SUM(locked_margin) FROM ledger.positions WHERE user_id = $1"
    ).bind(user_id).fetch_one(&mut **tx).await?;
    let (ord_sum,): (Option<Decimal>,) = sqlx::query_as(
        "SELECT SUM(margin_locked) FROM ledger.orders_open WHERE user_id = $1"
    ).bind(user_id).fetch_one(&mut **tx).await?;
    let pos_sum = pos_sum.unwrap_or(Decimal::ZERO);
    let ord_sum = ord_sum.unwrap_or(Decimal::ZERO);
    let diff = locked - pos_sum - ord_sum;
    Ok((locked, pos_sum, ord_sum, diff))
}
```

The call site at the end of `apply_trade_matched`, just before `tx.commit()`:

```rust
let tolerance = Decimal::from_str_exact("0.01").unwrap();
for (label, user_id) in [("taker", msg.taker_user), ("maker", msg.maker_user)] {
    let (locked, pos_sum, ord_sum, diff) =
        read_user_invariant(&mut tx, user_id, &asset).await?;
    if diff.abs() > tolerance {
        error!(
            trade_id = %msg.trade_id,
            taker_order = %msg.taker_order,
            maker_order = %msg.maker_order,
            symbol = %msg.symbol,
            price = %price,
            qty = %qty,
            who = label,
            user_id = %user_id,
            locked = %locked,
            pos_sum = %pos_sum,
            ord_sum = %ord_sum,
            diff = %diff,
            "invariant violated after apply_trade_matched"
        );
    }
}
```

## Deploy Procedure

1. **Local:** code change + `cargo build -p internal-ledger` + `cargo clippy -p internal-ledger -- -D warnings` + commit (only `apply.rs`; leave pre-existing dirty files alone)
2. **EC2 backend:** `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart`
3. **EC2 manual reset** (reset.sh has a documented ME-restart-env bug):
   - `ssh ... 'systemctl --user stop rocky-bot'`
   - `psql` over docker exec: zero positions.qty + locked_margin, transfer locked→available, DELETE orders_open for funnel accounts (same SQL as `scripts/reset.sh` step 2 — that part is correct)
   - `pkill -f target/release/matching-engine` — then re-launch via `services-remote.sh restart` (the easier path: restart ALL services together, which gets ME fresh with the right env)
   - `systemctl --user restart rocky-bot`
4. **Run bot 5 min** — let it generate trades + fills + cancels
5. **Inspect logs:**
   - `ssh ... 'tail -50000 ~/rocky-backend-stack/internal-ledger.log | grep "invariant violated" | head -10'`
   - If hits: capture the first 3-5 occurrences with full context. Report findings.
   - If zero hits: the leak isn't in `apply_trade_matched`. Move investigation to `place_order` / `cancel_order` / `chain_events.rs` in a follow-up round.
6. **Stop bot:** `ssh ... 'systemctl --user stop rocky-bot'`
7. **Do NOT push.** This is purely diagnostic.

## Acceptance

Two valid outcomes — both are useful:
- **ERROR fires with data:** we have the smoking gun for the leak path inside `apply_trade_matched`. Next round writes a fix spec targeting the broken branch.
- **No ERROR over 5 min:** the leak is outside `apply_trade_matched` (likely `place_order` or `cancel_order`). Next round adds the same instrumentation to those paths.

Either outcome unblocks the next iteration.

## Out of Scope

- The actual fix for the leak (this round just gathers evidence)
- Fixing `scripts/reset.sh` (manual ops for now)
- Pushing any commits (rocky-backend currently has 2 unpushed commits from prior round; rocky-bot has 16 — both stay unpushed until the leak is actually fixed)
- Adding the same instrumentation to `place_order`, `cancel_order`, `apply_margin_recompute`, or `chain_events` (only if step 5 returns no hits)
- Tests — the live deployment is the experiment; the diagnostic message is the test artifact

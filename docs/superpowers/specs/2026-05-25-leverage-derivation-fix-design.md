# Leverage-Derivation Fix Design

**Status:** Spec — the actual fix for the persistent margin leak.
**Date:** 2026-05-25
**Predecessors:**
- [2026-05-25 phantom-trade fix](./2026-05-25-phantom-trade-fix-design.md) — fixed leverage=1 fallback when order missing (verified working).
- [2026-05-25 margin-leak instrumentation](./2026-05-25-margin-leak-instrumentation-design.md) — diagnostic round that captured the smoking gun.

## Problem

The 2026-05-25 diagnostic round caught **956 invariant violations in 30 min** with these signatures:
- 180 leak events (`diff` increased), 754 preservations (correct trades on already-leaked accounts), **0 decreases** — leak is one-way
- Both taker (506) and maker (450) affected
- Diff values are **quantized**, not random rounding (0.30, 1.12, 1.26, 1.40, 2.57, …)
- First violation's `pos_sum = 6.521959142857142857` — the repeating `142857` is the decimal expansion of `1/7`, confirming **leverage was computed as 7 instead of the expected 10**

## Root Cause

`services/internal-ledger/src/apply.rs:141-152` derives leverage from the order's stored margin:

```rust
let taker_leverage: u32 = if taker_order_margin.is_zero() {
    1
} else {
    let lev_d = (notional / taker_order_margin).round_dp(0);
    rust_decimal::prelude::ToPrimitive::to_u32(&lev_d).unwrap_or(1).max(1)
};
```

`notional = price * qty` where `price` is the FILL price (passed in the `TradeMatched` message). `taker_order_margin` was stored at PLACEMENT time using the order's intended price. When fill price differs from placement price — or when an order is partially filled and its remaining margin has been proportionally decremented — `notional / order_margin` rounds to the wrong integer (e.g., 9 or 11 instead of 10).

`apply_margin_recompute` then computes `new_locked = |qty| × entry / wrong_lev`, which doesn't match the order's `margin_released = pre_locked × fill_q / pre_rem` (which assumed correct lev). The mismatch silently inflates `accounts.locked` against the position+order sum.

## Why Derivation Was Used

`ledger_v1::PlaceOrderRequest` (the gRPC into internal-ledger) only carries `margin_required` — not leverage. The upstream `trading_v1::PlaceOrderRequest` HAS a `leverage: u32` field, but at the trading-api → ledger boundary the leverage is consumed (used to compute `margin = price * qty / leverage`) and then discarded. internal-ledger has to guess.

The trading-api/api-gateway layer already hardcodes `leverage: 10` for all funnel orders (`api-gateway/src/fapi/routes_orders.rs:96 // default until /v1/leverage endpoint lands`). The demo runs at single, uniform leverage.

## Solution

Replace the derivation with a **hard-coded constant** matching the demo's actual leverage. Since the entire stack already pins leverage to 10 above the ledger layer, this is a true single-source-of-truth fix with no migration, no proto change, no bot change.

```rust
// Demo v1: all perps trade at fixed leverage 10. The trading-api layer
// already enforces this (api-gateway hardcodes leverage=10 in PlaceOrder).
// When multi-leverage support lands, add a `leverage` column to orders_open
// and plumb it through the ledger_v1 proto — see future spec.
const LEVERAGE_V1: u32 = 10;
let taker_leverage = LEVERAGE_V1;
let maker_leverage = LEVERAGE_V1;
```

The downstream `apply_margin_recompute(... taker_leverage, ...)` and `apply_margin_recompute(... maker_leverage, ...)` calls stay unchanged — they just receive the correct constant instead of a possibly-wrong derived value.

The diagnostic invariant logger from round 3 (commit `e32ae17`) **stays in place** as a safety net. After this fix it should go quiet (0 violations).

## Files Changed

| File | Change |
|---|---|
| `rocky-backend/services/internal-ledger/src/apply.rs` | Replace lines 141-152 (the two `if .is_zero() { 1 } else { ... derive ... }` blocks) with the `const LEVERAGE_V1: u32 = 10;` declaration and two `let xxx_leverage = LEVERAGE_V1;` assignments. Add one unit test pinning the constant. |

## Untouched

- All other internal-ledger files (margin.rs formulas are correct; they just need the right leverage input)
- All proto definitions (no schema/contract change)
- trading-api / api-gateway (already plumb leverage=10 above the ledger)
- rocky-bot (zero change)
- Database schema (no migration)
- `scripts/reset.sh` (still has the documented ME-restart-env bug; manual ops for now)
- The diagnostic invariant logger from `e32ae17` (kept as safety net)

## Tests

One unit test added at the bottom of apply.rs `#[cfg(test)] mod tests` block (if one exists; otherwise create it):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leverage_v1_is_ten() {
        // Demo v1 invariant. If this constant changes, you also need to
        // update trading-api + api-gateway leverage path AND write a
        // multi-leverage migration that adds a `leverage` column to
        // orders_open / positions and plumbs it through ledger_v1 proto.
        assert_eq!(LEVERAGE_V1, 10);
    }
}
```

This is a documentation test — it pins the constant so any future change forces a developer to read the comment.

Existing integration tests (`margin_invariant.rs`) continue to pass — they exercise valid scenarios where leverage=10 was assumed. The fix actually MAKES them more reliable since the prior derivation could randomly round to 9 or 11 even in those tests.

## Deploy Procedure

1. **Local:**
   ```
   cargo build -p internal-ledger
   cargo test -p internal-ledger      # 1 new + existing unit tests pass
   cargo clippy -p internal-ledger -- -D warnings
   ```
2. **Local commit** (only `apply.rs`; pre-existing dirty files left alone):
   ```
   git add services/internal-ledger/src/apply.rs
   git commit -m "fix(internal-ledger): use LEVERAGE_V1=10 constant instead of error-prone derivation"
   ```
3. **EC2 backend:** `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart`
4. **Manual reset** (reset.sh still buggy):
   - SSH: `systemctl --user stop rocky-bot`
   - psql via `docker exec -i ... <<'SQL'` stdin-pipe pattern: zero `positions.qty`+`locked_margin`, transfer `locked→available`, DELETE `orders_open` for funnel accounts (same SQL as prior round)
   - SSH: `systemctl --user restart rocky-bot`
5. **5-min smoke test:** run bot 5 min, check `/tmp/rocky-services/internal-ledger.log` for "invariant violated" count. Acceptance: **0 violations**.
6. **30-min monitor (only if 5-min smoke passes):** 4 samples. Acceptance: max(locked) < $50, over_80 == 0, -2010 count < 30.
7. **Push both repos (only if 30-min monitor passes):**
   - rocky-backend has 4 unpushed commits (e67b63f phantom-fix + fd6b9e2 test-infra + e32ae17 invariant-log + the new leverage-fix)
   - rocky-bot has 16 unpushed commits

## Acceptance

- **Step 5 — 5-min smoke:** `grep -c "invariant violated" /tmp/rocky-services/internal-ledger.log` returns 0. If > 0, the leverage derivation wasn't the (only) bug; iterate.
- **Step 6 — 30-min monitor:** `max(locked) < $50` AND `over_80 == 0` AND `-2010 < 30`. If acceptance fails despite 0 invariant violations, the leak is somewhere outside `apply_trade_matched` and we add instrumentation to `place_order` / `cancel_order` in a future round.
- **Step 7:** both `git push origin main` succeed; both `log..HEAD` empty.

## Out of Scope

- Multi-leverage support (add column to orders_open / positions + plumb through ledger_v1 proto + handle weighted-avg leverage on position adds) — future spec when /v1/leverage endpoint lands
- Removing the diagnostic invariant logger (keep as safety net; 0 violations means no noise)
- Fixing `scripts/reset.sh` ME-restart-env bug (manual ops for now)
- Schema migration (no DB change needed)
- Bot-side changes (zero change)

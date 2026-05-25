# rocky-bot Position-Cap Fix Design

**Status:** Spec — needs implementation plan + execution.
**Date:** 2026-05-25
**Predecessor:** [2026-05-24 rocky-bot 30-account funnel design](./2026-05-24-rocky-bot-30-account-funnel-design.md) (deployed, regressed within 30 min)

## Problem

The 30-account funnel bot deployed on 2026-05-24 (commits `fb1101f`..`d858ecd`) saturates wallet margin within ~30 min of uptime, then spams `-2010 insufficient balance` (~95×/min).

Monitor evidence (sample 3 at 33 min uptime, all 30 funnel accounts):

| Layer / role | Accounts | Locked margin (USD) |
|---|---|---|
| L1 BUY/SELL ladders (5–10 bps) | 10/12 | **$97–$99.76** — saturated |
| Takers | 2/5 | $98 — saturated |
| L1 BUY 09bps | 1 | $85 — climbing |
| L1 SELL 08bps + 3 takers | 4 | $65–$77 — climbing |
| L2 BUY 15bps | 1 | $50 |
| Anchor + L3 (50–100 bps) | 5 | $19–$25 — bounded |
| L2 outer (20–30 bps) | 6 | $11–$19 — bounded |
| L1 SELL 10bps | 1 | $9 — outlier (recently cancelled) |

L3 ladders and outer L2 stay bounded because they sit 50+ bps from mid and rarely fill. L1 ladders, sitting inside ±10 bps, fill on nearly every iteration as Binance mid wobbles past them. **Each fill creates a perp position whose margin is locked separately from order margin**, and the bot — having no inventory awareness — keeps quoting the same side, creating more fills, growing the position monotonically until the wallet is empty.

## Root Cause

Backend behavior is correct. The 2026-05-24 `internal-ledger` fix (commit `7709280`) properly releases order margin on fill. But the resulting **position** locks margin separately, and rocky-bot's `LadderMakerLoop` / `AnchorMakerLoop` never query position. They place orders solely based on `open_orders()` being empty for their side, so every fill triggers a replacement order that creates another fill, in perpetuity.

`TakerLoop` already queries `position_risk` and flips to the reducing side when `notional > caps.max_notional_usdc` (default $200). It still saturated because: (a) $200 cap was too loose for a $100 wallet, and (b) takers iterate every 30s — too slow to drain the inventory the L1 ladders generate.

This is a bot strategy bug, not a race condition or async-cancel issue.

## Solution

Add position-cap gating to `LadderMakerLoop` and `AnchorMakerLoop`. Tighten `RiskCaps.max_notional_usdc` from $200 to $150 for all 30 accounts. Add a small symmetry fix to `TakerLoop` (cancel growing-side stale orders when flipping). No backend changes.

### Per-iteration gating logic (uniform across all 3 strategies, applied before placing)

```
pos_amt = position_risk(symbol)[0].positionAmt   # may be 0 if no open position
mark    = position_risk(symbol)[0].markPrice
sign    = +1 if side == "BUY" else -1
would_be_pos_amt = pos_amt + sign * qty
would_be_notional = abs(would_be_pos_amt * mark)

if would_be_notional > caps.max_notional_usdc:
    if same_side_live_order_exists:
        cancel it     # free order margin + prevent further accumulation
    return            # do NOT place — at cap
# else: fall through to existing cancel-replace-or-place logic
```

Key invariants:
- The check is one-sided. A BUY ladder at cap never blocks the SELL side; an opposite-side actor (the matching ladder rung, the anchor, or a taker) cycles inventory back to flat.
- Position-reducing moves are never gated. A BUY ladder long $150 with a fresh SELL by the opposite ladder pushes inventory down; both keep operating.
- Cancelling the stale same-side order while capped is essential — otherwise the open order continues to fill and inventory keeps growing past the cap.

### Cap value

`max_notional_usdc = 150.0` per (account, symbol) — uniform for all 30 accounts. Rationale:

- Position margin at cap = $15 per symbol per account (10× leverage)
- Two symbols × $15 = $30 max position margin
- + order margin ($3.8 BTC L1 + $2.1 ETH L1 = $5.9) = ~$36 max locked
- Per-account headroom: $64 — comfortable for fee accrual, order rotation, and the brief in-flight margin during cancel-replace

### Self-draining steady state

When an L1 BUY account at position cap stops placing BUY:
1. Its existing BUY open order is cancelled (gating step)
2. The opposing L1 SELL ladder at the same bps still places SELL orders → those eventually fill, taking some of the matching BUY position back
3. Taker accounts (now also tightened to $150) cross spreads in both directions
4. Within ~minutes the BUY account's net position drops below $150 → cap releases → ladder resumes placing

This produces an oscillation, not monotonic growth.

## Files Changed

| File | Change |
|---|---|
| `rocky_bot/strategies/ladder.py` | Add position-cap gating to `iterate_once`. Insert position query + would-be check + same-side cancel between wallet poll and open-orders fetch. |
| `rocky_bot/strategies/anchor.py` | Same gating, applied independently per side (BUY half and SELL half) since the anchor quotes both. |
| `rocky_bot/strategies/taker.py` | When current `notional > cap` and side flips to reducing, also cancel any existing growing-side open order before placing. Minor change to existing cycle logic. |
| `rocky_bot/main.py` | One-line: `CircuitBreaker(RiskCaps(max_notional_usdc=150.0))` per account (was `RiskCaps()`). |
| `tests/test_ladder.py` | Add 2 tests: `test_skips_place_when_position_would_exceed_cap`, `test_places_when_position_reducing`. |
| `tests/test_anchor.py` | Add 2 tests: `test_gates_buy_side_only_when_long`, `test_gates_both_sides_independently`. |
| `tests/test_taker.py` | Add 1 test: `test_cancels_growing_side_order_when_at_cap`. |

## Untouched

- `rocky_bot/risk.py` — `RiskCaps.max_notional_usdc` field already exists; only default is being overridden in `main.py`. Other tests using `RiskCaps()` continue to pass at the existing $200 default.
- `rocky_bot/accounts.py`, `config.py`, `binance_feed.py`, `rocky_client.py`, `sign.py`, `symbol_map.py` — no changes
- `scripts/mint-30.sh`, `deploy.sh` — no changes
- `.keys.json` — existing 30 accounts reused (no re-mint, no re-seed)
- Funnel geometry (offset bps, qty per layer) — unchanged
- rocky-backend — no changes (margin-release-on-fill is already correct from commit `7709280`)

## Testing

All new tests use the same `AsyncMock` + `FakeFeed` patterns from T4/T5. New tests stub `client.position_risk` to return a controlled `positionAmt` + `markPrice`. The cap-gating logic should be reachable in isolation: position over cap → assert `client.place_order.assert_not_called()` and `client.cancel_order` called once for the stale same-side order.

Full pytest suite must remain green (currently 46 tests; this change adds 5, bringing the total to 51).

ruff must remain clean across `rocky_bot/` and `tests/`.

## Deploy Procedure

1. Local: `pytest` (51 pass) + `ruff check rocky_bot/ tests/` (clean)
2. SSH: stop the (currently `inactive`) bot service is already done. Flatten all 30 funnel accounts' perp positions via SQL UPDATE to start clean:
   ```sql
   UPDATE ledger.positions SET position_amt = 0, updated_at = now()
     WHERE user_id IN (SELECT user_id FROM auth.api_keys
                        WHERE label LIKE 'mm-%' OR label LIKE 'taker-%');
   ```
   (Existing locked margin on each account will release once positions are zeroed; available will return to ~$100.)
3. `./deploy.sh` — rsync new code + restart `rocky-bot` user service
4. 30-min monitor (same SQL query as the original T8 monitor, sampled every 10 min):
   - **Acceptance:** `max(locked)` across all 30 accounts stays **under $50** at sample 3
   - **Acceptance:** `-2010` count over 30 min stays **under 30**
   - **Acceptance:** recent-trades tape continues showing activity within last minute
5. If acceptance passes: `git push origin main` (pushes the 11 prior commits + the 2–3 fix commits from this spec)

## Out of Scope

- Backend changes — margin-release-on-fill is already correct
- Reseeding accounts or re-minting `.keys.json`
- Changing funnel geometry (qty table, offset bps grid)
- Cleaning up the 2 orphan accounts from earlier failed mint attempts (cosmetic, harmless)
- Adding `position_risk` result caching across (account, symbol) loops — current ~30 extra HTTP/sec is well within capacity; YAGNI until profiling shows it matters
- Per-role cap differentiation (ladder vs anchor vs taker) — uniform $150 first; revisit only if real data shows it's wrong

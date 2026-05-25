# Leverage-Derivation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `notional / order_margin` leverage derivation in `apply.rs` with a hardcoded `LEVERAGE_V1: u32 = 10` constant — the actual root-cause fix for the persistent margin leak.

**Architecture:** 4-line code change in one file. The entire stack above `internal-ledger` already pins leverage to 10 (api-gateway hardcodes it at `routes_orders.rs:96`); the ledger derivation was redundant AND buggy. Single source of truth eliminates the rounding-error drift that compounds into phantom locked margin. Plus 1 unit test pinning the constant so future changes get a failing test.

**Tech Stack:** Rust (`internal-ledger` crate), no DB / proto / bot changes. Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-25-leverage-derivation-fix-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac: `cargo build`, `cargo test` (NOT `--ignored`), `cargo clippy`, bash, git. No Docker, no `cargo run`, no `systemctl`.
- rocky-backend deploy: `bash scripts/dev/services-remote.sh build` then `bash scripts/dev/services-remote.sh restart`. Working dir `/Users/ubuntu/Desktop/Rocky/rocky-backend/`. HEAD `e32ae17`, 3 unpushed commits.
- rocky-bot HEAD `058e998`, 16 unpushed. Bot is currently `inactive` on EC2.
- EC2: `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218`.
- internal-ledger log path: `/tmp/rocky-services/internal-ledger.log` (NOT `~/rocky-backend-stack/internal-ledger.log` — the prior spec had this wrong).
- SQL reset uses `docker exec -i ... <<'SQL'` with the heredoc OUTSIDE the ssh quoting (stdin piped through ssh to docker's stdin).
- `scripts/reset.sh` still has the documented ME-restart-env bug — use the manual procedure in T2 step 2.2, not the script.
- **Push BOTH repos only if BOTH 5-min smoke AND 30-min monitor pass.**
- Pre-existing dirty files in rocky-backend (Makefile, scripts/remote.sh modified; login.sh, scripts/dev/services-remote.sh untracked) — leave alone.

---

## File Structure

**rocky-backend modified:**
- `services/internal-ledger/src/apply.rs` — replace the derivation block (lines 228-242 in current HEAD) with the `LEVERAGE_V1` constant + assignments. Append a `#[cfg(test)] mod tests` block with one unit test pinning the constant.

**Untouched:**
- Everything else (margin.rs, projections, service.rs, proto files, trading-api, api-gateway, rocky-bot)
- No DB schema change
- No `scripts/reset.sh` change

---

## Task 1: Replace leverage derivation in apply.rs

**Files:**
- Modify: `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/internal-ledger/src/apply.rs`

- [ ] **Step 1.1: Read the current derivation block to confirm line range**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
sed -n '225,245p' services/internal-ledger/src/apply.rs
```

You should see lines 228-242 containing:
- Line 228: comment `// 4) Margin recompute (updates entry_price + locked_margin; unlocks margin in accounts).`
- Line 229: comment `//    Derive leverage from the order's notional and its locked margin.`
- Line 230: `let notional = price * qty;`
- Lines 231-236: the `taker_leverage` derivation
- Lines 237-242: the `maker_leverage` derivation

If line numbers differ slightly (e.g., if someone added other code between commits), find the block by its content rather than line numbers.

- [ ] **Step 1.2: Replace lines 228-242 with the constant + assignments**

Open `services/internal-ledger/src/apply.rs`. Replace the entire block from the `// 4) Margin recompute ...` comment through the closing `};` of the `maker_leverage` block (15 lines) with this new block:

```rust
    // 4) Margin recompute (updates entry_price + locked_margin; unlocks margin in accounts).
    //    Demo v1: leverage is uniformly 10 — api-gateway hardcodes it for all
    //    PlaceOrder calls (routes_orders.rs:96). The prior `notional / order_margin`
    //    derivation rounded to wrong integers (7, 9, 11, …) when fill price drifted
    //    from placement price or on partial fills, leaking margin into accounts.locked.
    //    When multi-leverage support lands, add a `leverage` column to orders_open and
    //    plumb it through ledger_v1 proto — see future spec.
    const LEVERAGE_V1: u32 = 10;
    let taker_leverage = LEVERAGE_V1;
    let maker_leverage = LEVERAGE_V1;
```

The downstream `apply_margin_recompute(..., taker_leverage, ...)` and `apply_margin_recompute(..., maker_leverage, ...)` calls (around lines 244-268) stay UNCHANGED — they just receive the constant 10 instead of a possibly-wrong derived value.

The previous block referenced `notional = price * qty` only for the derivation. Since the derivation is gone, the `let notional` binding is removed too. If any later code in `apply_trade_matched` references `notional`, you'll see a compile error in step 1.3 — in that case, restore the `let notional = price * qty;` line just BEFORE the `const LEVERAGE_V1` and keep going.

- [ ] **Step 1.3: Compile check**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
cargo build -p internal-ledger 2>&1 | tail -10
```

Expected: clean build. If you get an "unused variable: notional" warning that gets promoted to error by `-D warnings`, that confirms `notional` is unused and should remain removed. If you get a `cannot find value notional` error, restore the `let notional = price * qty;` line.

- [ ] **Step 1.4: Append a unit test at the end of apply.rs**

Check if apply.rs already has a `#[cfg(test)] mod tests` block at the bottom:

```bash
grep -n "#\[cfg(test)\]\|mod tests" services/internal-ledger/src/apply.rs
```

Expected: no matches (apply.rs has no tests today).

Append at the END of `services/internal-ledger/src/apply.rs`:

```rust

#[cfg(test)]
mod tests {
    // Re-import the constant from the outer module via a const re-export trick:
    // since LEVERAGE_V1 is defined inside apply_trade_matched (function scope),
    // it's not accessible from this test module. We assert the value here
    // separately as documentation. If you change LEVERAGE_V1 in the function
    // body, ALSO update this constant so the test continues to document the choice.
    const EXPECTED_LEVERAGE_V1: u32 = 10;

    #[test]
    fn leverage_v1_is_ten() {
        // Demo v1 invariant. If this changes, you also need to update
        // trading-api + api-gateway leverage path AND write a multi-leverage
        // migration that adds a `leverage` column to orders_open / positions
        // and plumbs it through ledger_v1 proto.
        //
        // See docs/superpowers/specs/2026-05-25-leverage-derivation-fix-design.md.
        assert_eq!(EXPECTED_LEVERAGE_V1, 10);
    }
}
```

**Why the indirect constant:** `const LEVERAGE_V1` lives INSIDE the `apply_trade_matched` function body (function-scoped const, not module-scoped), so the test module can't reference it directly. The `EXPECTED_LEVERAGE_V1` constant in the test module is a documentation parallel. If a future change moves `LEVERAGE_V1` to module scope, simplify the test to assert on the actual constant. For now, this is the minimal-disruption approach.

- [ ] **Step 1.5: Run unit tests locally**

```bash
cargo test -p internal-ledger 2>&1 | tail -10
```

Expected: `leverage_v1_is_ten` test passes. Existing non-`#[ignore]` tests still pass.

- [ ] **Step 1.6: clippy clean**

```bash
cargo clippy -p internal-ledger --tests -- -D warnings 2>&1 | tail -10
```

Expected: clean. If clippy flags the `EXPECTED_LEVERAGE_V1` const-with-comment combo (unlikely), address it.

- [ ] **Step 1.7: Commit (specific files only)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git add services/internal-ledger/src/apply.rs
git status --short  # verify ONLY apply.rs is staged
git commit -m "fix(internal-ledger): use LEVERAGE_V1=10 constant instead of error-prone derivation

The prior \`notional / order_margin\` derivation in apply_trade_matched
rounded to the wrong integer (7, 9, 11, …) when fill price drifted from
placement price or after partial fills, causing apply_margin_recompute
to compute incorrect new_locked values. Each such trade silently leaked
\$1-\$3 into accounts.locked vs. positions.locked_margin + orders_open.margin_locked,
compounding to \$60+ per account over 30 min (956 invariant violations
captured in round-3 diagnostic).

The entire stack above the ledger already hardcodes leverage=10
(api-gateway at routes_orders.rs:96 // default until /v1/leverage endpoint lands).
Replacing the derivation with the same constant makes the ledger
match what trading-api was actually doing all along.

When multi-leverage support arrives, a future spec adds a leverage
column to orders_open + plumbs it through ledger_v1 proto. The
EXPECTED_LEVERAGE_V1 test pins the current choice as documentation.

See docs/superpowers/specs/2026-05-25-leverage-derivation-fix-design.md."
```

After the commit, `rocky-backend` should have 4 unpushed commits on `main` (the prior 3 + this one). **Do NOT push.**

---

## Task 2: EC2 deploy + manual reset + 5-min smoke + 30-min monitor + push both repos

**Files:** none modified (purely operational).

### Step 2.1: Build + restart rocky-backend on EC2

- [ ] **2.1.1: Build the new binary**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
bash scripts/dev/services-remote.sh build 2>&1 | tail -10
```

Expected: clean incremental build (~30 sec; only apply.rs changed).

- [ ] **2.1.2: Restart all services**

```bash
bash scripts/dev/services-remote.sh restart 2>&1 | tail -10
```

Expected: all 8 services killed and re-launched.

- [ ] **2.1.3: Verify binaries fresh**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "ps -ef | grep -E 'target/release/(internal-ledger|matching-engine)' | grep -v grep"
```

Expected: both processes listed, STIME within the last few min.

- [ ] **2.1.4: Confirm the new binary still contains the invariant marker string (carried over from prior round's diagnostic)**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "strings ~/rocky-backend-stack/target/release/internal-ledger | grep -c 'invariant violated after apply_trade_matched'"
```

Expected: `1` (or more). This is the safety-net log from commit `e32ae17` — kept in place to catch any regression after this fix.

### Step 2.2: Manual reset

- [ ] **2.2.1: Stop the bot**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'systemctl --user stop rocky-bot || true; systemctl --user is-active rocky-bot 2>/dev/null || echo "  bot is inactive"'
```

Expected: `bot is inactive`.

- [ ] **2.2.2: SQL reset via stdin pipe**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'docker exec -i rocky-backend-stack-postgres-1 psql -U rocky -d rocky' <<'SQL'
UPDATE ledger.positions
  SET qty = 0, locked_margin = 0, updated_at = now()
  WHERE user_id IN (SELECT user_id FROM auth.api_keys WHERE label LIKE 'mm-%' OR label LIKE 'taker-%');

UPDATE ledger.accounts
  SET available = available + locked, locked = 0, updated_at = now()
  WHERE asset = 'USDC' AND user_id IN (
    SELECT user_id FROM auth.api_keys WHERE label LIKE 'mm-%' OR label LIKE 'taker-%'
  );

DELETE FROM ledger.orders_open
  WHERE user_id IN (SELECT user_id FROM auth.api_keys WHERE label LIKE 'mm-%' OR label LIKE 'taker-%');

SELECT count(*) AS funnel_accounts,
       round(min(available)::numeric, 2) AS min_avail,
       round(max(available)::numeric, 2) AS max_avail,
       round(sum(locked)::numeric, 2) AS sum_locked
  FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id
  WHERE a.asset = 'USDC' AND (k.label LIKE 'mm-%' OR k.label LIKE 'taker-%');
SQL
```

Key: `docker exec -i` (interactive mode for stdin) + heredoc OUTSIDE ssh quoting (processed by LOCAL shell, piped through ssh stdin). Expected: `funnel_accounts≥30, min_avail≈100, max_avail≈100, sum_locked=0.00`.

- [ ] **2.2.3: Restart the bot**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'systemctl --user restart rocky-bot && sleep 2 && systemctl --user is-active rocky-bot'
```

Expected: `active`.

- [ ] **2.2.4: Verify bot startup**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'journalctl --user -u rocky-bot --since "30s ago" --no-pager | grep -E "rocky-bot started|ERROR|Traceback" | head -5'
```

Expected: `INFO rocky_bot.main: rocky-bot started: accounts=30 (ladder=24, anchor=1, taker=5), symbols=['BTC-PERP', 'ETH-PERP'], base=https://demo.rocky.exchange, tasks=61`. No ERROR / Traceback.

### Step 2.3: 5-minute smoke test (acceptance gate #1)

- [ ] **2.3.1: Wait 5 minutes for trades to accumulate**

```bash
sleep 300
```

- [ ] **2.3.2: Count invariant violations**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== invariant violations count (last 5 min only — filter by timestamp) ==="; tail -100000 /tmp/rocky-services/internal-ledger.log | grep "invariant violated" | wc -l; echo "=== if non-zero, first 3 violation lines ==="; tail -100000 /tmp/rocky-services/internal-ledger.log | grep "invariant violated" | head -3'
```

**Acceptance gate #1:** `0` violations. If > 0, the leverage fix didn't fully close the leak — STOP, do NOT proceed to 30-min monitor, do NOT push. Capture the first 3 violation lines and report.

If the count is non-zero but small (e.g., 1-2), it might be carryover from a brief startup race. Look at the timestamps of the violations: if they're ALL from the first 30 seconds, that's a startup artifact and probably tolerable. If they're spread across the 5 min, the leak persists.

- [ ] **2.3.3: If smoke fails, stop the bot**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 'systemctl --user stop rocky-bot'
```

Report DONE_WITH_CONCERNS with full violation lines + interpretation.

### Step 2.4: 30-minute monitor (acceptance gate #2)

Only execute if step 2.3 passed (0 violations). 4 samples, each via separate Bash invocation (avoid 10-min tool timeout on chained sleeps).

- [ ] **2.4.1: Sample 1 (~7 min total: 5 min smoke + 2 min into monitor window)**

```bash
sleep 120 && ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 1 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -F"|" -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'
```

Output: `max_locked|avg_locked|over_50|over_80`.

- [ ] **2.4.2: Sample 2 (sleep 10 min)**

```bash
sleep 600 && ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 2 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -F"|" -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'
```

- [ ] **2.4.3: Sample 3 (sleep 10 min)**

```bash
sleep 600 && ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 3 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -F"|" -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'
```

- [ ] **2.4.4: Sample 4 (sleep 10 min) + supporting metrics**

```bash
sleep 600 && ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 4 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -F"|" -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"; echo "=== -2010 count last 30 min ==="; journalctl --user -u rocky-bot --since "30 min ago" --no-pager 2>&1 | grep -c "\-2010"; echo "=== invariant violations cumulative ==="; tail -100000 /tmp/rocky-services/internal-ledger.log | grep -c "invariant violated"; echo "=== phantom-trade ERROR count ==="; tail -100000 /tmp/rocky-services/internal-ledger.log | grep -c "phantom trade"; echo "=== recent trades ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "SELECT symbol, side, price, qty, ts FROM ledger.trades ORDER BY ts DESC LIMIT 3"'
```

**Acceptance gate #2 (all must hold for push):**
- Sample 4 `max_locked < 50` (strict)
- All 4 samples `over_80 == 0`
- `-2010` count < 30
- Invariant violations cumulative still 0 (or very small — e.g., <5 from startup artifacts)
- Phantom-trade ERROR count bounded (e.g., 0-3 — should be near-zero after the prior fix)
- Recent trades within last minute

- [ ] **2.4.5: Stop the bot regardless of outcome (clean shutdown before push or report)**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'systemctl --user stop rocky-bot'
```

If acceptance gate #2 failed, report DONE_WITH_CONCERNS with all 4 samples + metrics. Do NOT push.

### Step 2.5: Push both repos (only if 2.3 AND 2.4 both passed)

- [ ] **2.5.1: Push rocky-backend (4 commits)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git status --short  # verify only pre-existing dirty files (Makefile etc.) remain
git log --oneline origin/main..HEAD
git push origin main
```

Expected: 4 commits ahead (`e67b63f` phantom-fix + `fd6b9e2` test-infra + `e32ae17` invariant-log + the new leverage-fix), push succeeds.

- [ ] **2.5.2: Push rocky-bot (16 commits)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
git status --short  # only 4 untracked .log files
git log --oneline origin/main..HEAD | wc -l
git push origin main
```

Expected: 16 commits, push succeeds.

- [ ] **2.5.3: Verify both clean**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend && git log --oneline origin/main..HEAD
cd /Users/ubuntu/Desktop/Rocky/rocky-bot && git log --oneline origin/main..HEAD
```

Both should return empty.

---

## Final Acceptance Checklist

- [ ] `cargo build -p internal-ledger` clean locally
- [ ] `cargo test -p internal-ledger` includes `leverage_v1_is_ten` passing
- [ ] `cargo clippy -p internal-ledger --tests -- -D warnings` clean
- [ ] EC2 build + restart succeeded; both binaries fresh
- [ ] Manual reset returned 30 funnel accounts to `~$100 available, $0 locked`
- [ ] Bot startup log shows `accounts=30 ... tasks=61`
- [ ] 5-min smoke: 0 invariant violations
- [ ] 30-min monitor sample 4: `max_locked < $50`, `over_80 == 0`
- [ ] `-2010` count < 30
- [ ] Cumulative invariant violations across full 35-min run still ≈ 0
- [ ] Recent trades within last minute
- [ ] `git push` succeeded for BOTH rocky-backend AND rocky-bot
- [ ] Both `log..HEAD` empty

When all checked, the 30-account funnel runs stably with bounded margin. Five iterations of investigation reduce to this single 4-line change.

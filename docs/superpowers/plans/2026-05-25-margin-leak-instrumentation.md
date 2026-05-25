# Margin-Leak Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runtime invariant check at the end of `apply_trade_matched` that produces an ERROR log line whenever a trade leaves `accounts.locked ≠ sum(positions.locked_margin) + sum(orders_open.margin_locked)` for either user. Deploy, run 5 min, inspect logs.

**Architecture:** Single helper function (`read_user_invariant`) plus a call site loop over `(taker, maker)` users right before `tx.commit()`. Always commits the txn (observation, not enforcement). The first ERROR line gives us the trade context that breaks the invariant; from there a follow-up round writes the actual fix.

**Tech Stack:** Rust (`internal-ledger` crate), sqlx, `tracing`. Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-25-margin-leak-instrumentation-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac: `cargo build`, `cargo test` (NOT `--ignored`), `cargo clippy`, bash, git. **No Docker, no `cargo run`, no `systemctl`, no running services.**
- rocky-backend deploy: `bash scripts/dev/services-remote.sh build` then `bash scripts/dev/services-remote.sh restart`. Working dir `/Users/ubuntu/Desktop/Rocky/rocky-backend/`. HEAD `fd6b9e2`, 2 unpushed.
- rocky-bot HEAD `058e998`, 16 unpushed. Bot is currently `inactive` on EC2.
- EC2: `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218`.
- internal-ledger runs via nohup on EC2; logs at `~/rocky-backend-stack/internal-ledger.log` (NOT systemd journal).
- `scripts/reset.sh` has a documented ME-restart-env bug — use the manual recipe in T2 step 2.3, not `bash scripts/reset.sh`.
- **This is diagnostic-only. Do NOT `git push` anything.**
- Pre-existing dirty files in rocky-backend (Makefile, scripts/remote.sh modified; login.sh, scripts/dev/services-remote.sh untracked) — leave alone.

---

## File Structure

**rocky-backend modified:**
- `services/internal-ledger/src/apply.rs` — add helper `read_user_invariant`; call it at the end of `apply_trade_matched` for both users; emit `error!` with full context when `|diff| > 0.01`.

**Untouched:**
- Everything else.

---

## Task 1: Add invariant check + ERROR log to apply.rs

**Files:**
- Modify: `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/internal-ledger/src/apply.rs`

- [ ] **Step 1.1: Read the current end of `apply_trade_matched` to find the insertion point**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
sed -n '230,270p' services/internal-ledger/src/apply.rs
```

You should see the closing portion of `apply_trade_matched`: the maker_growth block, the two `orders::insert_trade_row` calls, then `tx.commit().await?;` then `Ok(())`. The invariant check goes RIGHT BEFORE `tx.commit().await?;`.

- [ ] **Step 1.2: Confirm `use tracing::error;` is already imported**

```bash
grep -n "use tracing" services/internal-ledger/src/apply.rs
```

Expected: `use tracing::error;` (added by T1 of the prior round, commit `e67b63f`). If missing, add it at the top of the file with the other `use` statements.

- [ ] **Step 1.3: Add the helper function near the top of apply.rs (after `fetch_position_pre`)**

Find the `fetch_position_pre` function (around line 54-70) and add this new helper immediately after it (before `pub async fn apply_trade_matched`):

```rust
/// Diagnostic helper: read `accounts.locked` and the two component sums
/// (sum of position locked_margin + sum of order margin_locked) for a user
/// inside an existing transaction. Returns `(locked, pos_sum, ord_sum, diff)`
/// where `diff = locked - pos_sum - ord_sum`. A nonzero `diff` indicates the
/// invariant `accounts.locked == sum(positions.locked_margin) + sum(orders_open.margin_locked)`
/// has been violated.
///
/// Used by the end-of-apply_trade_matched assertion (margin-leak-instrumentation spec).
async fn read_user_invariant<'t>(
    tx: &mut sqlx::Transaction<'t, sqlx::Postgres>,
    user_id: Uuid,
    asset: &str,
) -> Result<(Decimal, Decimal, Decimal, Decimal), sqlx::Error> {
    let locked: Decimal = sqlx::query_scalar(
        r#"SELECT locked FROM ledger.accounts
           WHERE user_id = $1 AND asset = $2"#,
    )
    .bind(user_id)
    .bind(asset)
    .fetch_optional(&mut **tx)
    .await?
    .unwrap_or(Decimal::ZERO);

    let pos_sum: Decimal = sqlx::query_scalar::<_, Option<Decimal>>(
        r#"SELECT SUM(locked_margin) FROM ledger.positions WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await?
    .unwrap_or(Decimal::ZERO);

    let ord_sum: Decimal = sqlx::query_scalar::<_, Option<Decimal>>(
        r#"SELECT SUM(margin_locked) FROM ledger.orders_open WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await?
    .unwrap_or(Decimal::ZERO);

    let diff = locked - pos_sum - ord_sum;
    Ok((locked, pos_sum, ord_sum, diff))
}
```

- [ ] **Step 1.4: Add the call site inside `apply_trade_matched`, right before `tx.commit()`**

Find the line `tx.commit().await?;` near the end of `apply_trade_matched` (probably around line 262-265). Insert the following BEFORE that line:

```rust
    // ── Diagnostic invariant check ──────────────────────────────────────────
    // Verify accounts.locked == sum(positions.locked_margin) + sum(orders_open.margin_locked)
    // for both taker and maker. Logs ERROR (no rollback) when it doesn't hold.
    // See docs/superpowers/specs/2026-05-25-margin-leak-instrumentation-design.md.
    let tolerance = Decimal::from_str("0.01").unwrap();
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

The `Decimal::from_str` call needs `use std::str::FromStr;` at the top of the file (or `from_str_exact("0.01").unwrap()` if the crate version supports it without import). Check what's already imported with:

```bash
grep -n "use std::" services/internal-ledger/src/apply.rs
grep -n "FromStr" services/internal-ledger/src/apply.rs
```

If `FromStr` isn't imported, prefer this alternative that doesn't need the import:

```rust
    let tolerance = Decimal::new(1, 2);  // 0.01
```

(`Decimal::new(mantissa, scale)` gives `mantissa × 10^-scale`, so `(1, 2)` = `0.01`.)

Use whichever import-free form fits cleanly with what's already in the file.

- [ ] **Step 1.5: Compile check**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
cargo build -p internal-ledger 2>&1 | tail -10
```

Expected: clean build. If errors mention missing imports, add what's needed at the top of apply.rs.

- [ ] **Step 1.6: Unit tests still pass (non-`--ignored`)**

```bash
cargo test -p internal-ledger 2>&1 | tail -10
```

Expected: same count as before, all pass (the `#[ignore]`-gated integration tests still don't run locally).

- [ ] **Step 1.7: clippy clean**

```bash
cargo clippy -p internal-ledger --tests -- -D warnings 2>&1 | tail -10
```

Expected: clean. If clippy flags the new helper (e.g., `too_many_arguments` — it shouldn't, the helper has 3 args), address as needed.

- [ ] **Step 1.8: Commit (specific files only)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git add services/internal-ledger/src/apply.rs
git status --short  # verify ONLY apply.rs is staged; pre-existing dirty files untouched
git commit -m "diag(internal-ledger): log invariant violation at end of apply_trade_matched

Reads accounts.locked, sum(positions.locked_margin), sum(orders_open.margin_locked)
for both taker_user and maker_user inside the same txn before commit. If the
diff exceeds \$0.01, emits tracing::error! with full trade context (trade_id,
order_ids, symbol, price, qty, per-user diff). Always commits the txn —
this is observation, not enforcement.

Diagnostic-only round. The first ERROR line will pinpoint the trade event
that breaks the invariant, enabling a targeted fix in the next round.

See docs/superpowers/specs/2026-05-25-margin-leak-instrumentation-design.md."
```

The rocky-backend repo will now show 3 unpushed commits ahead of origin/main (`e67b63f` T1 + `fd6b9e2` T1b + the new one).

---

## Task 2: Deploy + manual reset + 5-min bot run + log inspection

**Files:** none modified.

### Step 2.1: Build + restart rocky-backend on EC2

- [ ] **2.1.1: Build the new binary**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
bash scripts/dev/services-remote.sh build 2>&1 | tail -10
```

Expected: clean incremental build (~30 sec since only apply.rs changed). If the build fails, fix locally and retry.

- [ ] **2.1.2: Restart all services (gets ME and ledger fresh)**

```bash
bash scripts/dev/services-remote.sh restart 2>&1 | tail -10
```

Expected: all 8 services killed then re-launched in dependency order.

- [ ] **2.1.3: Verify both binaries are running fresh**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "ps -ef | grep -E 'target/release/(internal-ledger|matching-engine)' | grep -v grep"
```

Expected: both processes listed, STIME within last few min.

- [ ] **2.1.4: Confirm the new binary contains the invariant marker string**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "strings ~/rocky-backend-stack/target/release/internal-ledger | grep -c 'invariant violated after apply_trade_matched'"
```

Expected: `1` (or more). If `0`, the binary wasn't rebuilt — re-run 2.1.1 + 2.1.2.

### Step 2.2: Manual reset (reset.sh has bugs — do it directly)

- [ ] **2.2.1: Stop the bot**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'systemctl --user stop rocky-bot || true; systemctl --user is-active rocky-bot 2>/dev/null || echo "  bot is inactive"'
```

Expected: `bot is inactive`.

- [ ] **2.2.2: SQL reset (positions, accounts.locked, orders_open) for funnel accounts**

Pipe stdin through ssh into `docker exec -i` so the heredoc is processed by the LOCAL shell, not the remote one (sidesteps the quoting bug the prior round hit with the nested heredoc):

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

Note the `-i` flag on `docker exec` (interactive mode) and the heredoc OUTSIDE the ssh quoting. Expected: `funnel_accounts≥30, min_avail≈100, max_avail≈100, sum_locked=0.00`. (May show 32 if 2 orphan accounts still exist from prior rounds — that's fine.)

- [ ] **2.2.3: Restart matching-engine (services-remote.sh already restarted it in 2.1.2, but if 2.2.2 produced orphan order rows from the old book, do another restart to flush)**

Since 2.1.2 already restarted ME, AND 2.2.2 emptied `orders_open`, ME's in-memory book should now have nothing matching `orders_open` either. So ME doesn't need another restart.

But verify ME is still up:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "ps -ef | grep 'target/release/matching-engine' | grep -v grep"
```

Expected: process listed. If missing (crashed during reset), do `bash scripts/dev/services-remote.sh restart` again.

- [ ] **2.2.4: Restart the bot**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'systemctl --user restart rocky-bot && sleep 2 && systemctl --user is-active rocky-bot'
```

Expected: `active`.

- [ ] **2.2.5: Confirm bot startup log is clean**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'journalctl --user -u rocky-bot --since "30s ago" --no-pager | grep -E "rocky-bot started|ERROR|Traceback" | head -5'
```

Expected: `INFO rocky_bot.main: rocky-bot started: accounts=30 (ladder=24, anchor=1, taker=5), symbols=['BTC-PERP', 'ETH-PERP'], base=https://demo.rocky.exchange, tasks=61`. No ERROR / Traceback.

### Step 2.3: Run bot 5 minutes, then inspect logs

- [ ] **2.3.1: Wait 5 minutes for trades to accumulate**

```bash
sleep 300
```

- [ ] **2.3.2: Stop the bot**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'systemctl --user stop rocky-bot'
```

- [ ] **2.3.3: Grep internal-ledger.log for invariant violations**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== invariant violations count ==="; tail -100000 ~/rocky-backend-stack/internal-ledger.log | grep -c "invariant violated after apply_trade_matched"; echo "=== first 5 invariant violations (full lines) ==="; tail -100000 ~/rocky-backend-stack/internal-ledger.log | grep "invariant violated after apply_trade_matched" | head -5; echo "=== invariant violations by who ==="; tail -100000 ~/rocky-backend-stack/internal-ledger.log | grep "invariant violated after apply_trade_matched" | grep -oE "who=\"[a-z]+\"" | sort | uniq -c; echo "=== phantom-trade ERROR count ==="; tail -100000 ~/rocky-backend-stack/internal-ledger.log | grep -c "phantom trade"; echo "=== post-run invariant per-account ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -F"|" -A -c "SELECT k.label, round(a.locked::numeric, 2) AS acct_locked, round(COALESCE((SELECT sum(p.locked_margin) FROM ledger.positions p WHERE p.user_id = a.user_id), 0)::numeric, 2) AS pos_sum, round(COALESCE((SELECT sum(o.margin_locked) FROM ledger.orders_open o WHERE o.user_id = a.user_id), 0)::numeric, 2) AS ord_sum, round((a.locked - COALESCE((SELECT sum(p.locked_margin) FROM ledger.positions p WHERE p.user_id = a.user_id), 0) - COALESCE((SELECT sum(o.margin_locked) FROM ledger.orders_open o WHERE o.user_id = a.user_id), 0))::numeric, 2) AS phantom FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'') ORDER BY phantom DESC LIMIT 10"'
```

This produces 5 sections:
1. **Count of invariant violations** — total ERROR lines from the new check
2. **First 5 full ERROR lines** — capture them verbatim; these are the diagnostic gold
3. **who= breakdown** — were taker, maker, or both implicated?
4. **Phantom-trade ERROR count** — should be similar to last round (a few at startup, then 0)
5. **Per-account invariant after the run** — top 10 by `phantom` column

- [ ] **2.3.4: Report findings**

Two valid outcomes — both are useful:

**Outcome A — ERROR fires:** capture the first 3-5 violation log lines with FULL context (trade_id, taker_order, maker_order, symbol, price, qty, who, user_id, locked, pos_sum, ord_sum, diff). Also report the count, who= breakdown, and post-run phantom-per-account.

**Outcome B — No violations:** the leak is OUTSIDE `apply_trade_matched`. Report 0 violations. The post-run per-account phantom (section 5) should ALSO be ≈ 0 if all leaks are in apply_trade_matched. If section 5 shows phantom > 0 but section 1 shows 0 violations, the leak is in `place_order` / `cancel_order` / `chain_events.rs` — note this for the next round's spec.

- [ ] **2.3.5: Do NOT push**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git log --oneline origin/main..HEAD | wc -l
```

Expected: `3` (e67b63f T1 phantom-check + fd6b9e2 T1b test-infra + new diag commit). They stay local.

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
git log --oneline origin/main..HEAD | wc -l
```

Expected: `16`. They stay local.

---

## Final Acceptance Checklist

- [ ] `cargo build -p internal-ledger` clean locally; `cargo test -p internal-ledger` (unit tests) green
- [ ] `cargo clippy -p internal-ledger --tests -- -D warnings` clean
- [ ] Backend deploy succeeded; both binaries fresh
- [ ] EC2 binary contains "invariant violated after apply_trade_matched" marker string
- [ ] Manual reset returned 30 funnel accounts to `$100 available, $0 locked`
- [ ] Bot ran 5 minutes, stopped cleanly
- [ ] Log inspection captured: violation count, first 3-5 full ERROR lines, who= breakdown, phantom-trade count, post-run per-account phantom
- [ ] Neither repo pushed

When all checked, report findings to the controller. The next round writes the actual fix spec based on the captured diagnostic data.

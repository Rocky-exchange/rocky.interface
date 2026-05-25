# Phantom-Trade Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the rocky-backend phantom-margin leak (apply.rs leverage-1 fallback when an order is missing from `orders_open`) and add a rocky-bot operational reset script so the matching-engine in-memory book stays synchronized with the ledger.

**Architecture:** Two code changes in different repos, shipped together. (1) `services/internal-ledger/src/apply.rs` gains a phantom-trade check after the two `fetch_order_margin` calls — early return + publish `OrderCancelled` NATS messages so matching-engine drops the orphan(s). (2) `rocky-bot/scripts/reset.sh` performs the full reset dance: stop bot → SQL reset → restart matching-engine → restart bot. The 15 bot commits from yesterday's position-cap fix are correct and will be pushed alongside.

**Tech Stack:** Rust (rocky-backend internal-ledger crate, sqlx + async_nats), Bash (reset script), Postgres SQL. Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-25-phantom-trade-fix-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac is code-only. Allowed: `cargo build`, `cargo test` (NOT `--ignored`), `cargo clippy`, `bash -n`, `chmod`, `git`. **NOT allowed:** Docker, `cargo test --ignored` (needs Docker for testcontainers), running services.
- `cargo test --ignored` for the new integration test runs on **EC2** (Docker available there).
- rocky-backend deploy: `bash scripts/dev/services-remote.sh build` then `bash scripts/dev/services-remote.sh restart` (currently restarts ALL services together — that's fine; we want a clean ME restart anyway). HEAD: `8d954dd`, clean tree.
- rocky-bot deploy: `./deploy.sh`. HEAD: `1ae6f1a` (the cap-fix commits). 15 commits unpushed on `main`.
- EC2: `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218`. ssh ControlMaster already enabled.
- `.keys.json` is present locally + EC2; do NOT re-mint.
- Bot is currently **inactive** on EC2.
- Do NOT `git push` either repo until T3 acceptance passes.

---

## File Structure

**rocky-backend modified:**
- `services/internal-ledger/src/apply.rs` — add phantom-trade check after the two `fetch_order_margin` calls; add `nats: &async_nats::Client` parameter to `apply_trade_matched`
- `services/internal-ledger/src/nats_in.rs` — pass `&nats` through (1-line change)
- `services/internal-ledger/tests/margin_invariant.rs` — extend `setup()` to also start a NATS testcontainer; update `match_fill()` signature; append one new test `phantom_taker_order_is_refused`

**rocky-bot added:**
- `scripts/reset.sh` — single bash script, ~50 lines

**Untouched:**
- All other rocky-backend files (margin.rs, projections, etc.) — formulas are correct
- All rocky-bot Python code (cap-fix commits stay as-is)
- `Cargo.toml` (async_nats is already a workspace dependency since funding.rs and service.rs use it)
- `deploy.sh`, `mint-30.sh`, `.keys.json`

**Test count progression:** rocky-backend currently has the existing `margin_invariant.rs` integration tests (run only with `--ignored` on EC2). This plan adds one new test in the same file.

---

## Task 1: rocky-backend — phantom-trade check in apply.rs + test infrastructure update

**Files:**
- Modify: `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/internal-ledger/src/apply.rs`
- Modify: `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/internal-ledger/src/nats_in.rs`
- Modify: `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/internal-ledger/tests/margin_invariant.rs`

**Approach:** Code change first (compile-verified locally), then extend the integration test infrastructure to start NATS alongside Postgres, then append a new phantom-refusal test. The new test runs on EC2 with `--ignored`; locally we only confirm it compiles via `cargo build`.

- [ ] **Step 1.1: Modify `apply.rs` — add `nats` parameter + phantom check**

Read `apply.rs:73-104` first to confirm current signature + body. Then:

(a) Change the function signature on line 73 to insert `&async_nats::Client`:

```rust
pub async fn apply_trade_matched<'a>(
    pool: &PgPool,
    store: &EventStore<'a>,
    nats: &async_nats::Client,
    msg: TradeMatchedMsg,
) -> anyhow::Result<()> {
```

(b) Immediately after the two `fetch_order_margin` calls (currently lines 98-99), insert the phantom check. The full block from line 98 to the existing `// 2) Append event with real fee amounts.` comment becomes:

```rust
    let taker_order_margin = fetch_order_margin(&mut tx, msg.taker_order).await?;
    let maker_order_margin = fetch_order_margin(&mut tx, msg.maker_order).await?;

    // Phantom-trade defence: if either order_id is not present in orders_open,
    // matching-engine's in-memory book is out of sync with the ledger (e.g.,
    // after an operator-side SQL reset that didn't restart ME, or a cancel-vs-
    // fill race). The leverage-derivation downstream would silently fall back
    // to 1, inflating accounts.locked by ~10x. Refuse the trade and ask ME to
    // drop the orphan(s) from its book.
    //
    // See docs/superpowers/specs/2026-05-25-phantom-trade-fix-design.md.
    if taker_order_margin.is_zero() || maker_order_margin.is_zero() {
        tracing::error!(
            trade_id = %msg.trade_id,
            taker_order = %msg.taker_order,
            maker_order = %msg.maker_order,
            symbol = %msg.symbol,
            taker_missing = taker_order_margin.is_zero(),
            maker_missing = maker_order_margin.is_zero(),
            "phantom trade: order not found in orders_open — refusing and asking matching-engine to drop orphan(s)"
        );
        #[derive(serde::Serialize)]
        struct CancelMsg {
            order_id: Uuid,
            symbol: String,
        }
        for (oid, missing) in [
            (msg.taker_order, taker_order_margin.is_zero()),
            (msg.maker_order, maker_order_margin.is_zero()),
        ] {
            if missing {
                let payload = serde_json::to_vec(&CancelMsg {
                    order_id: oid,
                    symbol: msg.symbol.clone(),
                })
                .unwrap_or_default();
                let _ = nats
                    .publish(
                        format!("orders.cancelled.{}", msg.symbol),
                        payload.into(),
                    )
                    .await;
            }
        }
        // tx has no writes yet — dropping it without commit rolls back implicitly.
        return Ok(());
    }

    let (taker_pre_qty, _taker_pre_avg, taker_pre_entry, taker_pre_locked) =
        fetch_position_pre(&mut tx, msg.taker_user, &msg.symbol).await?;
```

Confirm that `Uuid` is already in scope (it is — line 12). `tracing::error!` macro is available (used elsewhere in apply.rs? Let me note — `tracing` may not be imported in apply.rs currently; check and add `use tracing::error;` at the top of the file if needed. If `tracing` is already in `Cargo.toml`, the import is the only addition).

(c) Add the import at the top of `apply.rs` if not present:

```rust
use tracing::error;
```

(Then use `error!` instead of `tracing::error!` in the block above for consistency.)

Adjust the block to use the imported `error!`:

```rust
        error!(
            trade_id = %msg.trade_id,
            ...
```

- [ ] **Step 1.2: Modify `nats_in.rs` — pass `&nats` to `apply_trade_matched`**

Read `nats_in.rs:28` to confirm. Change:

```rust
        if let Err(e) = apply_trade_matched(&pool, &store, parsed).await {
```

to:

```rust
        if let Err(e) = apply_trade_matched(&pool, &store, &nats, parsed).await {
```

That's the only change in `nats_in.rs`.

- [ ] **Step 1.3: Compile check (catch signature ripples)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
cargo build -p internal-ledger 2>&1 | tail -20
```

Expected: clean build. If `tracing` import is missing, add it. If any other callsite of `apply_trade_matched` exists (search with `grep -rn 'apply_trade_matched' services/internal-ledger/`) and breaks, add the `&nats_client` parameter at each site.

- [ ] **Step 1.4: Update the integration test setup to also start NATS**

Open `services/internal-ledger/tests/margin_invariant.rs`. The existing `setup()` function (lines 25-46) starts Postgres only. Extend it to also start a NATS container and return the client.

Replace the existing `setup()` function with:

```rust
async fn setup() -> (
    PgPool,
    std::sync::Arc<ServiceSigner>,
    async_nats::Client,
    testcontainers::ContainerAsync<GenericImage>,
    testcontainers::ContainerAsync<GenericImage>,
) {
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
    let pg_port = pg.get_host_port_ipv4(5432).await.unwrap();
    let url = format!("postgres://rocky:rocky@127.0.0.1:{pg_port}/rocky");
    let pool = internal_ledger::db::connect(&url).await.unwrap();
    internal_ledger::migrate::run(&pool).await.unwrap();
    let signer = std::sync::Arc::new(
        ServiceSigner::from_provider(&InMemoryKeyProvider::new_random())
            .await
            .unwrap(),
    );

    let nats_container = GenericImage::new("nats", "2.10-alpine")
        .with_wait_for(WaitFor::message_on_stderr("Server is ready"))
        .start()
        .await
        .unwrap();
    let nats_port = nats_container.get_host_port_ipv4(4222).await.unwrap();
    let nats = async_nats::connect(format!("nats://127.0.0.1:{nats_port}"))
        .await
        .unwrap();

    (pool, signer, nats, pg, nats_container)
}
```

The return type now includes `async_nats::Client` and the NATS container handle (held to keep the container alive for the test duration).

- [ ] **Step 1.5: Update `match_fill` to take + pass `&nats`**

In the same file (`margin_invariant.rs`), find `match_fill` (lines 124-155) and add the nats parameter:

```rust
#[allow(clippy::too_many_arguments)]
async fn match_fill(
    pool: &PgPool,
    signer: &std::sync::Arc<ServiceSigner>,
    nats: &async_nats::Client,
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
        nats,
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
```

Then update every call to `setup().await` to destructure 5 values (was 3):

```rust
let (pool, signer, nats, _pg_container, _nats_container) = setup().await;
```

And every call to `match_fill(&pool, &signer, ...)` to pass `&nats`:

```rust
match_fill(&pool, &signer, &nats, buyer, buy_open, seller, sell_open, symbol, Side::Buy, price, qty).await;
```

Both `open_close_cycles_no_locked_drift` and `partial_fill_preserves_invariant` need this update. Read each test body and update every callsite mechanically.

- [ ] **Step 1.6: Append the new phantom-refusal test**

At the END of `margin_invariant.rs`, append:

```rust
#[tokio::test]
#[ignore = "requires docker"]
async fn phantom_taker_order_is_refused() {
    use futures::StreamExt;

    let (pool, signer, nats, _pg_container, _nats_container) = setup().await;

    let buyer = Uuid::now_v7();
    let seller = Uuid::now_v7();
    fund(&pool, buyer, "1000").await;
    fund(&pool, seller, "1000").await;

    let symbol = "BTC-PERP";
    let price = "50000";
    let qty = "0.01";
    let margin = d("100"); // 0.01 * 50000 / 5

    // Seed ONE real maker order. The taker order will be a non-existent UUID.
    let real_maker = Uuid::now_v7();
    seed_open_order(&pool, real_maker, seller, symbol, Side::Sell, d(price), d(qty), margin).await;

    // Subscribe to cancel messages BEFORE the call.
    let mut cancel_sub = nats
        .subscribe(format!("orders.cancelled.{}", symbol))
        .await
        .unwrap();

    // Snapshot ledger state before.
    let buyer_locked_before = account_locked(&pool, buyer).await;
    let buyer_avail_before = account_available(&pool, buyer).await;
    let seller_locked_before = account_locked(&pool, seller).await;
    let seller_avail_before = account_available(&pool, seller).await;
    let seller_orders_before = sum_order_locked(&pool, seller).await;

    // Act: phantom taker order (taker_order is a fresh UUID never inserted).
    let phantom_taker = Uuid::now_v7();
    let store = EventStore::new(&pool, &signer);
    let result = apply_trade_matched(
        &pool,
        &store,
        &nats,
        TradeMatchedMsg {
            trade_id: Uuid::now_v7(),
            taker_order: phantom_taker,
            maker_order: real_maker,
            taker_user: buyer,
            maker_user: seller,
            symbol: symbol.to_string(),
            taker_side: Side::Buy,
            price: price.to_string(),
            qty: qty.to_string(),
        },
    )
    .await;

    // Assert: returns Ok (so the NATS consumer doesn't retry forever).
    assert!(result.is_ok(), "phantom trade should return Ok, got: {:?}", result);

    // Assert: ledger state unchanged for both users.
    assert_eq!(account_locked(&pool, buyer).await, buyer_locked_before, "buyer locked changed");
    assert_eq!(account_available(&pool, buyer).await, buyer_avail_before, "buyer available changed");
    assert_eq!(account_locked(&pool, seller).await, seller_locked_before, "seller locked changed");
    assert_eq!(account_available(&pool, seller).await, seller_avail_before, "seller available changed");
    assert_eq!(sum_order_locked(&pool, seller).await, seller_orders_before, "seller orders unchanged");

    // Assert: a cancel message was published for the phantom taker order.
    // (Best-effort: drain the subscription for up to 2s.)
    let cancel_msg = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        cancel_sub.next(),
    )
    .await
    .ok()
    .flatten()
    .expect("expected an OrderCancelled NATS message for the phantom taker");
    let payload: serde_json::Value = serde_json::from_slice(&cancel_msg.payload).unwrap();
    assert_eq!(
        payload["order_id"].as_str().unwrap(),
        phantom_taker.to_string(),
        "cancel should be for the phantom taker UUID"
    );
}
```

- [ ] **Step 1.7: Compile + run unit tests (no `--ignored`) locally**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
cargo build -p internal-ledger 2>&1 | tail -5
cargo test -p internal-ledger 2>&1 | tail -10
```

Expected: clean build, all non-`#[ignore]` tests pass. The new `phantom_taker_order_is_refused` test does NOT run locally because of `#[ignore]`. The existing `open_close_cycles_no_locked_drift` and `partial_fill_preserves_invariant` also don't run (also `#[ignore]`). Both will be validated on EC2 in T3.

- [ ] **Step 1.8: clippy clean**

```bash
cargo clippy -p internal-ledger -- -D warnings 2>&1 | tail -10
```

Expected: no warnings. If clippy flags the new function-with-many-arguments pattern, add `#[allow(clippy::too_many_arguments)]` to the function (the existing helpers already use this).

- [ ] **Step 1.9: Commit**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git add services/internal-ledger/src/apply.rs services/internal-ledger/src/nats_in.rs services/internal-ledger/tests/margin_invariant.rs
git commit -m "fix(internal-ledger): refuse phantom trades + ask matching-engine to drop orphans

When fetch_order_margin returns 0 for either side of a TradeMatched,
the trade is phantom — matching-engine's in-memory book references
an order_id that no longer exists in orders_open. Previously the
leverage derivation downstream silently fell back to leverage=1,
inflating accounts.locked by ~10x per stale match.

Now: log ERROR, publish OrderCancelled NATS for the orphan(s) so ME
drops them, return Ok(()) so the consumer doesn't retry forever.
The transaction has no writes yet so it rolls back implicitly.

apply_trade_matched gains a &async_nats::Client parameter; the only
caller (nats_in.rs) already owns the client.

See docs/superpowers/specs/2026-05-25-phantom-trade-fix-design.md."
```

---

## Task 2: rocky-bot — `scripts/reset.sh` operational reset

**Files:**
- Create: `/Users/ubuntu/Desktop/Rocky/rocky-bot/scripts/reset.sh`

- [ ] **Step 2.1: Write `scripts/reset.sh`**

Create `/Users/ubuntu/Desktop/Rocky/rocky-bot/scripts/reset.sh`:

```bash
#!/usr/bin/env bash
# Full reset of the 30-account funnel state on EC2.
# Stops the bot → SQL-zeros positions + locked margin + open orders →
# restarts matching-engine (flushes its in-memory book) → restarts the bot.
#
# Idempotent — safe to re-run.
#
# Usage:
#   bash scripts/reset.sh

set -euo pipefail

SSH_HOST=${SSH_HOST:-ubuntu@13.231.118.218}
SSH_KEY=${SSH_KEY:-~/.ssh/rocky-canton-sandbox.pem}
BACKEND_DIR=${BACKEND_DIR:-rocky-backend-stack}

# Use ssh ControlMaster for connection multiplexing (matches deploy.sh / mint-30.sh).
CTRL_PATH="${TMPDIR:-/tmp}/rocky-reset-$$"
SSH_OPTS=(-i "${SSH_KEY/#\~/$HOME}" -o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPath="$CTRL_PATH" -o ControlPersist=60)

cleanup() { ssh "${SSH_OPTS[@]}" -O exit "$SSH_HOST" 2>/dev/null || true; }
trap cleanup EXIT

ssh_run() { ssh "${SSH_OPTS[@]}" "$SSH_HOST" "$@"; }

echo "==> 1/5 stopping rocky-bot service" >&2
ssh_run 'systemctl --user stop rocky-bot || true; systemctl --user is-active rocky-bot 2>/dev/null || echo "  bot is inactive"'

echo "==> 2/5 SQL reset: positions=0, accounts.locked→available, orders_open emptied" >&2
ssh_run "docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky <<'SQL'
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
SQL"

echo "==> 3/5 restarting matching-engine (kills PID, re-launches via nohup)" >&2
ssh_run "pkill -f 'target/release/matching-engine' 2>/dev/null || true; sleep 2; cd ~/${BACKEND_DIR} && SYMBOLS='BTC-PERP,ETH-PERP' BIND_ADDR_QUERY='127.0.0.1:50081' nohup ./target/release/matching-engine >> matching-engine.log 2>&1 & disown"

echo "==> 4/5 waiting 3s for matching-engine to come up" >&2
sleep 3

echo "==> 5/5 restarting rocky-bot" >&2
ssh_run 'systemctl --user restart rocky-bot && systemctl --user is-active rocky-bot'

echo "==> reset complete. Tail journal with:" >&2
echo "    ssh -i $SSH_KEY $SSH_HOST 'journalctl --user -u rocky-bot --since \"30s ago\" --no-pager | tail -20'" >&2
```

- [ ] **Step 2.2: chmod + syntax check**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
chmod +x scripts/reset.sh
bash -n scripts/reset.sh && echo "syntax ok"
```

Expected: `syntax ok`.

- [ ] **Step 2.3: Commit**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
git add scripts/reset.sh
git commit -m "feat: scripts/reset.sh — one-shot funnel reset (SQL + ME restart)

Stops bot → SQL-zeros positions + locked + open orders → restarts
matching-engine (so its in-memory book re-syncs from the now-empty
orders_open table) → restarts bot. Idempotent.

Required after the rocky-backend phantom-trade fix lands so the
30-account funnel can start from a true zero baseline."
```

---

## Task 3: EC2 deploy backend + run --ignored tests + reset + 30-min monitor + push both repos

**Files:** none modified.

### Step 3.1: Build + restart rocky-backend on EC2

- [ ] **3.1.1: Deploy backend (build + restart all services)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
bash scripts/dev/services-remote.sh build
bash scripts/dev/services-remote.sh restart
```

Expected:
- `build` step: rsync source to EC2, `cargo build --release` for internal-ledger + matching-engine + canton-bridge + ... (could take ~5-10 min on first build, faster on incremental)
- `restart` step: kills all services then re-launches in dependency order

If `build` fails on a compile error, fix locally first and retry.

- [ ] **3.1.2: Sanity-check that internal-ledger is up with the new build**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "ps -ef | grep -E 'target/release/(internal-ledger|matching-engine)' | grep -v grep"
```

Expected: both processes listed, recent STARTTIME (within the last minute).

### Step 3.2: Run the new --ignored integration tests on EC2

- [ ] **3.2.1: Run all integration tests including the new phantom test**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "cd ~/rocky-backend-stack && cargo test --release -p internal-ledger -- --ignored 2>&1 | tail -30"
```

Expected: `test result: ok` for at least 3 tests (the 2 prior margin_invariant tests + the new `phantom_taker_order_is_refused`). If `phantom_taker_order_is_refused` fails, STOP — don't proceed to reset/deploy. Capture the failure output and report.

If the existing 2 tests fail (`open_close_cycles_no_locked_drift`, `partial_fill_preserves_invariant`), the signature change in T1 broke them — debug locally first.

### Step 3.3: Run the bot reset script

- [ ] **3.3.1: Run `scripts/reset.sh` from local**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
bash scripts/reset.sh
```

Expected output:
- `1/5 stopping rocky-bot service` — `bot is inactive`
- `2/5 SQL reset` — final count: `funnel_accounts=30, min_avail≈100.00, max_avail≈100.00, sum_locked=0.00`
  - Note: may show 32 accounts if there are 2 orphan accounts from earlier failed mint runs — that's fine; they don't affect the funnel
- `3/5 restarting matching-engine` — silent
- `4/5 waiting 3s`
- `5/5 restarting rocky-bot` — `active`

- [ ] **3.3.2: Verify bot startup**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'journalctl --user -u rocky-bot --since "30s ago" --no-pager | grep -E "rocky-bot started|ERROR|Traceback" | head -5'
```

Expected: a startup line `INFO rocky_bot.main: rocky-bot started: accounts=30 (ladder=24, anchor=1, taker=5), symbols=['BTC-PERP', 'ETH-PERP'], base=https://demo.rocky.exchange, tasks=61`. No ERROR / Traceback.

### Step 3.4: 30-minute monitor (4 samples)

Same monitor cadence as the prior plan's T5. Use 4 separate Bash invocations with `sleep 600` between them (not one chained `&&` — avoids tool timeout).

- [ ] **3.4.1: Sample 1 (~2 min after deploy)**

```bash
sleep 60 && ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 1 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -F"|" -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'
```

Format: `max_locked|avg_locked|over_50|over_80`.

- [ ] **3.4.2: Sample 2 (sleep 10 min, then sample)**

```bash
sleep 600 && ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 2 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -F"|" -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'
```

- [ ] **3.4.3: Sample 3 (sleep 10 min)**

```bash
sleep 600 && ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 3 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -F"|" -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"'
```

- [ ] **3.4.4: Sample 4 + supporting metrics**

```bash
sleep 600 && ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'echo "=== sample 4 at $(date -Iseconds) ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -At -F"|" -c "SELECT round(max(locked)::numeric, 2), round(avg(locked)::numeric, 2), count(*) FILTER (WHERE locked > 50) AS over_50, count(*) FILTER (WHERE locked > 80) AS over_80 FROM ledger.accounts a JOIN auth.api_keys k ON k.user_id = a.user_id WHERE a.asset = '\''USDC'\'' AND (k.label LIKE '\''mm-%'\'' OR k.label LIKE '\''taker-%'\'')"; echo "=== -2010 count last 30 min ==="; journalctl --user -u rocky-bot --since "30 min ago" --no-pager 2>&1 | grep -c "\-2010"; echo "=== phantom-trade ERROR count ==="; journalctl --user -u internal-ledger --since "30 min ago" --no-pager 2>&1 | grep -c "phantom trade"; echo "=== recent trades ==="; docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "SELECT symbol, side, price, qty, ts FROM ledger.trades ORDER BY ts DESC LIMIT 3"'
```

**Acceptance criteria (all must hold for the push step):**
- **Sample 4 `max_locked < 50`** (strict)
- **All 4 samples: `over_80 == 0`**
- **`-2010` count < 30** over 30 min
- **`phantom trade` ERROR count is bounded** (a handful at startup as ME's stale book gets drained is OK; should taper to zero by sample 4)
- **Recent trades within last minute** (proves the bot is actively quoting)

If any acceptance criterion fails, **STOP, do not push**, capture all sample outputs, report DONE_WITH_CONCERNS.

If `max_locked` is climbing monotonically across samples AND any sample exceeds $50, the fix didn't take. Most likely cause: matching-engine wasn't actually restarted by reset.sh, or internal-ledger isn't running the new code.

- [ ] **3.4.5: If acceptance fails, stop the bot**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 'systemctl --user stop rocky-bot'
```

Report failure with sample output. Do NOT push.

### Step 3.5: Push both repos to GitHub (only if 3.4 passed)

- [ ] **3.5.1: Push rocky-backend**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git status --short
git log --oneline origin/main..HEAD
git push origin main
```

Expected: 1 commit ahead (the phantom-fix commit from T1), `git push` succeeds.

- [ ] **3.5.2: Push rocky-bot**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-bot
git status --short
git log --oneline origin/main..HEAD | wc -l
git push origin main
```

Expected: 16 commits ahead (15 prior + 1 reset.sh from T2), `git push` succeeds.

- [ ] **3.5.3: Verify both clean**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend && git log --oneline origin/main..HEAD
cd /Users/ubuntu/Desktop/Rocky/rocky-bot && git log --oneline origin/main..HEAD
```

Expected: both empty.

---

## Final Acceptance Checklist

- [ ] `cargo build -p internal-ledger` clean locally; `cargo test -p internal-ledger` (unit tests) green
- [ ] `cargo clippy -p internal-ledger -- -D warnings` clean
- [ ] `bash -n scripts/reset.sh` ok; script has execute bit
- [ ] EC2 `services-remote.sh build && restart` completes; both binaries running fresh
- [ ] EC2 `cargo test -p internal-ledger -- --ignored` shows all 3 tests passing (existing 2 + new phantom test)
- [ ] `bash scripts/reset.sh` returns `funnel_accounts≥30, sum_locked=0.00, bot=active`
- [ ] Bot startup log shows `accounts=30 (ladder=24, anchor=1, taker=5), tasks=61`
- [ ] Sample 4: `max(locked) < $50`, `over_80 == 0`
- [ ] `-2010` count over 30 min < 30
- [ ] `phantom trade` ERROR count tapers (a few at startup, none by sample 4)
- [ ] Recent trades within last minute
- [ ] `git push` succeeded for both rocky-backend AND rocky-bot; both `log..HEAD` empty

When all checked, the 30-account funnel runs stably with bounded margin, and both repos' fix commits are on `origin/main`.

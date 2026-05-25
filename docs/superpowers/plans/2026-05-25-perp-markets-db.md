# Perp Markets DB-backed Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the perp symbol list from a hardcoded Rust Vec into a `ledger.markets` table, then expose a tab-style symbol switcher on the frontend perp page so users can toggle between BTC-PERP and ETH-PERP.

**Architecture:** Backend migration adds the table + seeds 2 rows. `/v1/markets` reads the table instead of the Vec. Frontend hook fetches the list; tabs component navigates between `/perp/[symbol]` URLs. ETH already trades end-to-end on the matching engine + bot — this is pure UI/config exposure work.

**Tech Stack:** Rust (`api-gateway`, `internal-ledger` crates), Postgres, TypeScript/Next.js (`mtc-exchange`). Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-25-perp-markets-db-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac: `cargo build`, `cargo clippy` for rocky-backend; `npm run lint`, `npm run build` for mtc-exchange; bash + git. **No Docker, no `cargo run`, no `systemctl`.**
- rocky-backend deploy: `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart` — internal-ledger applies pending migrations on startup.
- EC2: `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218`.
- Bot is currently **active** on EC2 (just restarted at 09:49). Don't touch the bot.
- Migration SQL uses `SET LOCAL search_path = ledger;` (not bare `SET`) — lesson learned from prior round's `_sqlx_migrations` leak.
- Pre-existing dirty files in rocky-backend: Makefile, scripts/remote.sh modified; login.sh, scripts/dev/services-remote.sh untracked. Leave alone.
- rocky-backend HEAD `dd653e6` (0 unpushed). rocky-bot HEAD `058e998` (0 unpushed). Both clean.
- Frontend repo at `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/`, HEAD `da32ff3`, on `main`, working tree clean.

---

## File Structure

**rocky-backend new:**
- `services/internal-ledger/migrations/20260525001_markets.sql`

**rocky-backend modified:**
- `services/api-gateway/src/routes/markets.rs` (rewrite `list_markets`, optionally drop `markets_catalog`)

**mtc-exchange new:**
- `src/hooks/useMarkets.ts`
- `src/components/SymbolSwitcher.tsx`

**mtc-exchange modified:**
- `src/app/perp/[symbol]/page.tsx` (insert `<SymbolSwitcher />` inline in the existing row-1 grid cell, alongside `<TopBar />`)

**Untouched:**
- `src/app/page.tsx`, `src/components/TopNav.tsx`, `src/app/devpanel/page.tsx` (defaults stay at BTC-PERP; tabs handle switching once user is on a perp page)
- matching-engine + bot env (`SYMBOLS=BTC-PERP,ETH-PERP` already covers both pairs)

---

## Task 1: Backend — migration + DB-backed list_markets

**Files:**
- Create: `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/internal-ledger/migrations/20260525001_markets.sql`
- Modify: `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/api-gateway/src/routes/markets.rs`

- [ ] **Step 1.1: Create the migration file**

Create `/Users/ubuntu/Desktop/Rocky/rocky-backend/services/internal-ledger/migrations/20260525001_markets.sql` with EXACTLY this content:

```sql
-- Perp markets catalog (DB-backed replacement for hardcoded markets_catalog Vec).
-- SET LOCAL (not bare SET) so the search_path change is transaction-scoped and
-- doesn't leak onto the pooled connection between migrations.

SET LOCAL search_path = ledger;

CREATE TABLE IF NOT EXISTS ledger.markets (
    symbol         TEXT PRIMARY KEY,
    base           TEXT NOT NULL,
    quote          TEXT NOT NULL,
    max_leverage   INTEGER NOT NULL,
    tick_size      TEXT NOT NULL,
    min_qty        TEXT NOT NULL,
    display_order  INTEGER NOT NULL DEFAULT 0,
    active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO ledger.markets (symbol, base, quote, max_leverage, tick_size, min_qty, display_order)
VALUES
    ('BTC-PERP', 'BTC', 'USDC', 100, '0.01', '0.001', 1),
    ('ETH-PERP', 'ETH', 'USDC', 100, '0.01', '0.01',  2)
ON CONFLICT (symbol) DO NOTHING;
```

- [ ] **Step 1.2: Read the current `list_markets` to confirm context**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
sed -n '20,40p' services/api-gateway/src/routes/markets.rs
```

You should see `markets_catalog()` (lines 20-31) and `list_markets()` (lines 33-35). The router at line 218 wires `/v1/markets → list_markets`. `list_markets` is parameterless today.

- [ ] **Step 1.3: Replace `list_markets` with a DB-backed query**

In `services/api-gateway/src/routes/markets.rs`, replace lines 33-35 (the current `async fn list_markets`) with:

```rust
async fn list_markets(
    State(state): State<Arc<MarketsState>>,
) -> Result<Json<Vec<MarketInfo>>, (StatusCode, String)> {
    let rows: Vec<(String, String, String, i32, String, String)> = sqlx::query_as(
        "SELECT symbol, base, quote, max_leverage, tick_size, min_qty
         FROM ledger.markets
         WHERE active = TRUE
         ORDER BY display_order, symbol",
    )
    .fetch_all(&state.pg)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(
        rows.into_iter()
            .map(|(symbol, base, quote, max_leverage, tick_size, min_qty)| MarketInfo {
                symbol,
                base,
                quote,
                max_leverage: max_leverage as u32,
                tick_size,
                min_qty,
            })
            .collect(),
    ))
}
```

Also keep `markets_catalog()` (the hardcoded Vec) untouched for now — it may be referenced by tests or other modules. Removing it is YAGNI for this round.

- [ ] **Step 1.4: Verify route registration already passes `State<Arc<MarketsState>>`**

```bash
grep -n "list_markets\|MarketsState" services/api-gateway/src/routes/markets.rs | head -10
```

The router builder at line ~218 should look like `.route("/v1/markets", get(list_markets)).with_state(...)` or similar. Since the per-symbol routes (ticker, orderbook, etc.) already use `State<Arc<MarketsState>>`, the state is already wired into this router — `list_markets` will inherit it automatically once its signature accepts the state extractor. If for any reason the router uses a different state scope for `list_markets`, fix it to match the per-symbol routes.

- [ ] **Step 1.5: Compile + clippy**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
cargo build -p api-gateway 2>&1 | tail -10
cargo clippy -p api-gateway -- -D warnings 2>&1 | tail -10
```

Expected: both clean. If clippy flags an unused `markets_catalog` (dead code), add `#[allow(dead_code)]` above the fn declaration — we're keeping it as a backup.

Also build internal-ledger to confirm the migration file is valid SQL syntax (sqlx::migrate! parses migration files at compile time):

```bash
cargo build -p internal-ledger 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 1.6: Commit backend changes**

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
git add services/internal-ledger/migrations/20260525001_markets.sql services/api-gateway/src/routes/markets.rs
git status --short  # verify ONLY these 2 files are staged; pre-existing dirty files untouched
git commit -m "feat(api-gateway,internal-ledger): DB-backed perp markets catalog

Migration 20260525001_markets adds ledger.markets table (symbol, base,
quote, max_leverage, tick_size, min_qty, display_order, active) and
seeds BTC-PERP + ETH-PERP rows.

list_markets in api-gateway now reads from the table instead of the
hardcoded markets_catalog Vec, enabling new pairs to be added via SQL
INSERT (matching-engine env still needs updating separately).

Uses SET LOCAL search_path to avoid the sqlx _sqlx_migrations leak
pattern that bit us in an earlier round.

See docs/superpowers/specs/2026-05-25-perp-markets-db-design.md."
```

After the commit, rocky-backend has 1 unpushed commit on `main`. **Do NOT push yet** — deployment + frontend land first.

---

## Task 2: Frontend — useMarkets hook + SymbolSwitcher component + perp page integration

**Files:**
- Create: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/hooks/useMarkets.ts`
- Create: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/components/SymbolSwitcher.tsx`
- Modify: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/perp/[symbol]/page.tsx`

- [ ] **Step 2.1: Create `useMarkets` hook**

Create `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/hooks/useMarkets.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";

export type Market = {
  symbol: string;
  base: string;
  quote: string;
  max_leverage: number;
  tick_size: string;
  min_qty: string;
};

/**
 * Fetch the perp markets catalog once on mount.
 * Returns `null` while loading, then `Market[]` (possibly empty on error).
 */
export function useMarkets(): Market[] | null {
  const [markets, setMarkets] = useState<Market[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/markets")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Market[]) => {
        if (!cancelled) setMarkets(data);
      })
      .catch(() => {
        if (!cancelled) setMarkets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return markets;
}
```

- [ ] **Step 2.2: Create `SymbolSwitcher` component**

Create `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/components/SymbolSwitcher.tsx`:

```typescript
"use client";

import Link from "next/link";
import { useMarkets } from "@/hooks/useMarkets";

export default function SymbolSwitcher({ active }: { active: string }) {
  const markets = useMarkets();
  if (!markets) {
    return <div className="h-9" />; // skeleton placeholder while loading
  }
  return (
    <div className="flex gap-1 items-center">
      {markets.map((m) => {
        const isActive = active === m.symbol;
        return (
          <Link
            key={m.symbol}
            href={`/perp/${m.symbol}`}
            className={`px-3 py-1 text-sm font-medium rounded border-b-2 transition-colors ${
              isActive
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {m.base}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2.3: Modify the perp page to render `SymbolSwitcher` in the row-1 cell**

Read the current top of the perp page first to confirm the structure:

```bash
sed -n '1,40p' /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/perp/\[symbol\]/page.tsx
```

You should see the imports (lines 1-9), `PerpSymbolPage` function (line 11), then the grid layout starting at line 22. The row-1 cell wrapping `<TopBar symbol={symbol} />` is at approximately lines 30-37.

Make TWO edits to `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/perp/[symbol]/page.tsx`:

**Edit A** — add the import alongside the other component imports. After the existing import line `import BottomTabs from "@/components/perp/BottomTabs";`, add:

```typescript
import SymbolSwitcher from "@/components/SymbolSwitcher";
```

**Edit B** — inside the row-1 grid cell (the `<div className="col-span-3 px-2 flex items-center rounded" ...>` that wraps `<TopBar symbol={symbol} />`), render `<SymbolSwitcher />` BEFORE `<TopBar />`, separated by a small vertical divider. Change this block:

```tsx
      <div
        className="col-span-3 px-2 flex items-center rounded"
        style={{ background: "var(--ltr-bg-panel)", borderRadius: "var(--ltr-radius)", border: "1px solid var(--ltr-border-soft)" }}
      >
        <TopBar symbol={symbol} />
      </div>
```

to:

```tsx
      <div
        className="col-span-3 px-2 flex items-center gap-3 rounded"
        style={{ background: "var(--ltr-bg-panel)", borderRadius: "var(--ltr-radius)", border: "1px solid var(--ltr-border-soft)" }}
      >
        <SymbolSwitcher active={symbol} />
        <div className="w-px h-5 bg-zinc-700" />
        <TopBar symbol={symbol} />
      </div>
```

Changes: added `gap-3` to the flex container, added `<SymbolSwitcher />` and a vertical divider before `<TopBar />`. Row height (40px from `gridTemplateRows`) stays the same — switcher tabs are sized to fit (text-sm + py-1 ≈ 26px).

- [ ] **Step 2.4: Lint + build locally**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
npm run lint 2>&1 | tail -10
```

Expected: clean. If lint flags the unused `Link` import in some file or the new files (e.g., missing trailing comma, unused variable), fix and re-run.

```bash
npm run build 2>&1 | tail -15
```

Expected: clean Next.js build with no type errors.

- [ ] **Step 2.5: Commit frontend changes**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
git add src/hooks/useMarkets.ts src/components/SymbolSwitcher.tsx src/app/perp/\[symbol\]/page.tsx
git status --short  # verify only these 3 files are staged
git commit -m "feat(perp): symbol switcher tabs on /perp/[symbol] page

useMarkets hook fetches /api/v1/markets once on mount, returns
typed Market[]. SymbolSwitcher renders one tab per market with
emerald underline on the active symbol; clicking a tab navigates
to /perp/{symbol}, refreshing all per-symbol data fetches via
the existing useParams flow.

Backend migration in this round seeds BTC-PERP + ETH-PERP rows;
the same component automatically picks up future pairs added
to ledger.markets without a frontend code change.

See docs/superpowers/specs/2026-05-25-perp-markets-db-design.md."
```

After this commit, mtc-exchange has 1 unpushed commit. **Do NOT push yet** — deploy + visual verification happen below.

---

## Deploy + verify (inline, not its own task)

Once T1 and T2 are both committed locally:

### Step D.1: Deploy backend

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend
bash scripts/dev/services-remote.sh build 2>&1 | tail -10
bash scripts/dev/services-remote.sh restart 2>&1 | tail -10
```

Expected: clean build, all 8 services restart. internal-ledger runs the new migration on startup.

### Step D.2: Verify migration ran

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "SELECT symbol, base, quote, max_leverage, display_order, active FROM ledger.markets ORDER BY display_order"'
```

Expected: 2 rows (BTC-PERP, ETH-PERP) with their seeded values.

### Step D.3: Verify API

```bash
curl -s https://demo.rocky.exchange/api/v1/markets | python3 -m json.tool
```

Expected: JSON array of 2 objects, each with `symbol`, `base`, `quote`, `max_leverage`, `tick_size`, `min_qty`.

If the curl returns 404 or unexpected shape, check that the api-gateway restarted and is on the new binary:

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  "ps -ef | grep 'target/release/api-gateway' | grep -v grep"
```

Expected: process with recent STIME.

### Step D.4: Frontend deploy

Frontend deploy mechanism depends on the project's setup (Vercel push, custom CI, etc.). At minimum, the local `npm run build` from step 2.4 verified the code is valid. To put it on `demo.rocky.exchange`:

- If the frontend deploys via `git push`: `cd mtc-exchange && git push origin main`. Wait for the CI/CD to build + deploy.
- If the frontend deploys manually: `npm run build && <rsync/scp/upload built assets to the server>`. Check the project's README or `package.json` deploy script.

**Ask the user for the exact deploy mechanism if unclear.**

### Step D.5: Manual smoke test

Visit `https://demo.rocky.exchange/perp/BTC-PERP` in a browser. Verify:
- Two tabs appear at the top of the page (BTC + ETH), inline with the existing TopBar
- BTC tab has the emerald underline (active state)
- Clicking ETH navigates to `/perp/ETH-PERP`, the URL changes, ETH tab now highlighted
- Orderbook, kline chart, position panel all refresh and show ETH data
- Click BTC tab → navigates back to `/perp/BTC-PERP`, BTC data renders

If the tabs don't appear: hard-refresh the page (browser cache). If `/api/v1/markets` returns an error in the browser network panel, check api-gateway logs on EC2.

### Step D.6: Push both repos

Only push if smoke test passes:

```bash
cd /Users/ubuntu/Desktop/Rocky/rocky-backend && git push origin main
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange && git push origin main
```

Expected: both push succeeds.

---

## Final Acceptance Checklist

- [ ] Migration file syntactically valid (`cargo build -p internal-ledger` clean)
- [ ] `cargo build -p api-gateway` clean
- [ ] `cargo clippy -p api-gateway -- -D warnings` clean
- [ ] `npm run lint` clean in mtc-exchange
- [ ] `npm run build` clean in mtc-exchange
- [ ] Backend deployed; `ledger.markets` table has 2 rows
- [ ] `curl /v1/markets` returns the 2 markets
- [ ] Frontend deployed
- [ ] Browser test: tabs render on `/perp/BTC-PERP`, switching to ETH works, both pairs show their own data
- [ ] Both repos pushed to `origin/main`; both `git log..HEAD` empty

Bot stays untouched throughout — it's already trading both pairs.

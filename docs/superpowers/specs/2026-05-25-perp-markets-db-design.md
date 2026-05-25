# Perp Markets DB Design

**Status:** Spec — ready for implementation plan.
**Date:** 2026-05-25

## Problem

The perp UI hardcodes `BTC-PERP` everywhere (login redirect, TopNav, perp page default). The backend already exposes `/v1/markets` with both BTC-PERP and ETH-PERP, but the catalog is a hardcoded Rust `Vec`. ETH already trades end-to-end on the matching engine + bot, but users can't reach the ETH market from the UI.

User asked for:
1. Add ETH to the frontend (and "CC" — deferred to a later round, undefined ticker)
2. Move the symbol list configuration into the database
3. Expose the list via API
4. Frontend lets users switch symbols

## Solution

Two changes, no behavioral disruption:

1. **Backend** — replace the hardcoded `markets_catalog()` Vec with a `ledger.markets` table read. Migration seeds the same two rows (BTC-PERP, ETH-PERP) that the Vec used to hold.
2. **Frontend** — fetch `/v1/markets` and render a tab-style symbol switcher on the perp page. URL stays the source of truth (`/perp/[symbol]`); switcher just navigates between symbols. All existing per-symbol data fetches already key off the URL — no other component changes.

## Out of Scope

- The "CC" pair the user mentioned — ticker undefined, no price feed. Deferred to a future spec once the user names a concrete symbol.
- Matching-engine + bot still consume env-var `SYMBOLS=BTC-PERP,ETH-PERP` (not the DB). Adding a NEW pair later requires updating ME + bot env + restart, in addition to the DB INSERT. Documented in the deploy section.
- `src/app/devpanel/page.tsx` hardcoded SYMBOLS list — dev-only page, not user-facing
- `src/app/page.tsx` login redirect and `src/components/TopNav.tsx` Perp link — both keep `/perp/BTC-PERP` as the default landing. The switcher tabs handle navigation once the user is on a perp page.

## Files Changed

| File | Change |
|---|---|
| `rocky-backend/services/internal-ledger/migrations/20260525001_markets.sql` (new) | CREATE TABLE `ledger.markets` + seed BTC-PERP + ETH-PERP rows |
| `rocky-backend/services/api-gateway/src/routes/markets.rs` | Replace `markets_catalog()` Vec with `SELECT FROM ledger.markets`; wire `State(MarketsState)` into `list_markets` |
| `rockey-demo-new/mtc-exchange/src/hooks/useMarkets.ts` (new) | React hook fetching `/api/v1/markets`, returns `Market[]` or `null` while loading |
| `rockey-demo-new/mtc-exchange/src/components/SymbolSwitcher.tsx` (new) | Tab-style buttons rendering BTC / ETH; active tab driven by `active` prop, click navigates via `next/link` |
| `rockey-demo-new/mtc-exchange/src/app/perp/[symbol]/page.tsx` | Insert `<SymbolSwitcher active={symbol} />` near the top of the existing page render |

## Migration Detail

`services/internal-ledger/migrations/20260525001_markets.sql`:

```sql
SET LOCAL search_path = ledger;  -- LOCAL so it doesn't leak across migration boundary

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

Key points:
- `SET LOCAL` (not bare `SET`) — txn-scoped, doesn't leak to sqlx's `_sqlx_migrations` INSERT (lesson from prior round)
- `ON CONFLICT DO NOTHING` — re-running the migration is safe; doesn't double-insert
- `display_order` lets us reorder tabs without changing primary key

## Backend Code Detail

`services/api-gateway/src/routes/markets.rs::list_markets` becomes (replacing lines 33-35):

```rust
async fn list_markets(
    State(state): State<Arc<MarketsState>>,
) -> Result<Json<Vec<MarketInfo>>, (StatusCode, String)> {
    let rows: Vec<(String, String, String, i32, String, String)> = sqlx::query_as(
        "SELECT symbol, base, quote, max_leverage, tick_size, min_qty
         FROM ledger.markets WHERE active = TRUE
         ORDER BY display_order, symbol"
    )
    .fetch_all(&state.pg)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(
        rows.into_iter()
            .map(|(symbol, base, quote, lev, ts, mq)| MarketInfo {
                symbol, base, quote,
                max_leverage: lev as u32,
                tick_size: ts,
                min_qty: mq,
            })
            .collect()
    ))
}
```

The existing `markets_catalog()` Vec stays as a private fallback (used by tests and as documentation) — OR is deleted entirely. Recommendation: delete it (YAGNI). Tests that need a markets list should query the test DB.

Route registration at `markets.rs:218` already wires `State<Arc<MarketsState>>` for the per-symbol routes, so this just adds the same state to `list_markets`.

## Frontend Code Detail

`src/hooks/useMarkets.ts`:

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

export function useMarkets(): Market[] | null {
  const [markets, setMarkets] = useState<Market[] | null>(null);
  useEffect(() => {
    fetch("/api/v1/markets")
      .then((r) => r.json())
      .then((data: Market[]) => setMarkets(data))
      .catch(() => setMarkets([]));
  }, []);
  return markets;
}
```

`src/components/SymbolSwitcher.tsx`:

```typescript
"use client";
import Link from "next/link";
import { useMarkets } from "@/hooks/useMarkets";

export default function SymbolSwitcher({ active }: { active: string }) {
  const markets = useMarkets();
  if (!markets) return <div className="h-9" />;  // skeleton while loading
  return (
    <div className="flex gap-1 border-b border-zinc-800">
      {markets.map((m) => {
        const isActive = active === m.symbol;
        return (
          <Link
            key={m.symbol}
            href={`/perp/${m.symbol}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
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

`src/app/perp/[symbol]/page.tsx`:
- Add at the top of the file: `import SymbolSwitcher from "@/components/SymbolSwitcher";`
- Render `<SymbolSwitcher active={symbol} />` as the first child of the main page container, before the existing trading UI

All other components on the page already key off `symbol` from the URL param (orderbook, position, trade form, etc.) — no other changes needed.

## Tests

Backend: optional. The migration is straightforward DDL + INSERT; if it runs without error, it's correct. Live deploy verifies via `curl /v1/markets`.

Frontend: none new. Manual smoke test during deploy verifies tabs render and switching navigates correctly.

## Deploy Procedure

1. **Local backend:**
   ```
   cargo build -p api-gateway -p internal-ledger
   cargo clippy -p api-gateway -p internal-ledger -- -D warnings
   ```
2. **EC2 backend:** `bash scripts/dev/services-remote.sh build && bash scripts/dev/services-remote.sh restart`. The internal-ledger startup runs pending migrations, creating `ledger.markets` and seeding rows.
3. **Verify migration ran:**
   ```
   ssh ... 'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "SELECT symbol, base, display_order FROM ledger.markets ORDER BY display_order"'
   ```
   Expected: 2 rows (BTC-PERP, ETH-PERP).
4. **Verify API:**
   ```
   curl https://demo.rocky.exchange/api/v1/markets | jq
   ```
   Expected: JSON array of 2 objects, both with all fields populated.
5. **Local frontend:**
   ```
   cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
   npm run lint
   npm run build
   ```
6. **Frontend deploy:** existing deploy mechanism (Vercel push or whatever the project uses)
7. **Manual smoke:** visit `https://demo.rocky.exchange/perp/BTC-PERP` — verify two tabs (BTC, ETH) appear at the top, BTC tab is highlighted. Click ETH → URL becomes `/perp/ETH-PERP`, ETH tab highlights, orderbook + position data refresh for ETH.

## Adding a New Pair Later (e.g., "CC-PERP")

This is OUTSIDE the current spec but documented here so the user knows what's involved:

1. **Insert into DB:**
   ```sql
   INSERT INTO ledger.markets (symbol, base, quote, max_leverage, tick_size, min_qty, display_order)
   VALUES ('CC-PERP', 'CC', 'USDC', 100, '0.01', '1', 3);
   ```
2. **Matching engine env:** update `SYMBOLS=BTC-PERP,ETH-PERP,CC-PERP` in `scripts/dev/services-remote.sh` (line 197 ME start command). Restart ME.
3. **Bot:**
   - Add to `rocky_bot/main.py:24 SYMBOLS` list
   - Add to `rocky_bot/accounts.py::_QTY_TABLE` (ladder qty per layer)
   - Add to `rocky_bot/strategies/taker.py::TAKE_QTY_BY_SYMBOL`
   - Add to `rocky_bot/binance_feed.py` (source pair mapping — needs an actual Binance feed pair)
   - Add to `rocky_bot/symbol_map.py::rocky_to_binance`
   - Redeploy bot
4. **Frontend:** automatically picks up the new pair from `/v1/markets` — no code change needed (this is the win).

The frontend-only step (1) is the demonstrable benefit of this DB-backed design.

## Acceptance

- Migration creates `ledger.markets` with 2 seeded rows
- `/v1/markets` returns those 2 rows
- Frontend renders BTC + ETH tabs on `/perp/[symbol]` page
- Clicking ETH tab navigates to `/perp/ETH-PERP` and the page renders ETH data (orderbook, position, etc.)
- BTC-PERP behavior unchanged (regression check)

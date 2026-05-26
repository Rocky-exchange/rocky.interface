# CC Deposit Feature Design

**Status:** Spec — ready for implementation plan.
**Date:** 2026-05-26

## Problem

User wants to top up a "CC" balance from the UI. CC is a new asset name in the system — not yet tradable (no CC-PERP market). Today's only deposit path is `/devpanel`'s "Seed Deposit" button for USDC, which is a devnet-only debug tool. Regular users have no way to add CC (or any asset) from the user-facing UI.

The user clarified:
1. **CC is eventually tradable** but for now is just a balance row in `ledger.accounts`
2. **Deposit UI lives in the TopNav account modal** — visible from every page
3. **Logged-in user only** — frontend reads token from localStorage, server accepts the call (matches the existing seed endpoint's security model — devnet demo)
4. **User-entered amount** with a default placeholder

## Solution

Add one new Next.js BFF route (`/api/perp/deposits/cc`) that proxies to the existing backend `/v1/deposits/seed` with `asset: "CC"`. Add a deposit input + button + balance display to the existing TopNav account modal. No backend change — `accounts.asset TEXT NOT NULL` has no constraint, so the backend already accepts arbitrary asset strings. The existing per-asset balance route `/api/perp/account/[asset]/route.ts` is already asset-parameterized, so fetching the CC balance is free.

## Architecture

```
TopNav modal (already exists)
  ├── existing: MTC balance display
  ├── existing: USDC balance display
  ├── NEW: CC balance display (uses existing /api/perp/account/CC route)
  ├── NEW: deposit section — input + "充值 CC" button
  │       └── POST /api/perp/deposits/cc {user_id, amount}
  │             └── passthroughJSON to backend /v1/deposits/seed {user_id, asset:"CC", amount}
  │                   └── credits ledger.accounts (user_id, asset="CC") += amount
  └── existing: Party ID, Logout
```

After a successful deposit, refresh the CC balance display from the API (calls `/api/perp/account/CC` again).

## Files Changed

### mtc-exchange — new
- `src/app/api/perp/deposits/cc/route.ts` (~6 lines): Next.js BFF route. POST passes through to backend `/v1/deposits/seed` with `asset: "CC"` injected.

### mtc-exchange — modified
- `src/components/TopNav.tsx` (~50 lines added): CC balance state + fetch in `fetchSummary` + new modal section (input + button + status text)

### Untouched
- All backend code (`/v1/deposits/seed` already accepts any asset string)
- All other frontend code
- Bot (uses API keys, doesn't touch user deposit flow)
- Database schema (`ledger.accounts` already supports arbitrary assets)
- TopNav layout outside the modal (button placement, branding, etc.)

## New Route Detail

`src/app/api/perp/deposits/cc/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { passthroughJSON } from "@/lib/perp/bff";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // User-facing CC deposit (NOT devToolsOnly — visible to all logged-in users).
  // Injects asset="CC" so the request body to backend becomes
  // {user_id, asset:"CC", amount}.
  const body = await req.json();
  const upstreamReq = new Request(req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, asset: "CC" }),
  });
  return passthroughJSON(upstreamReq as NextRequest, "POST", "/v1/deposits/seed");
}
```

(Implementation detail: `passthroughJSON` reads the request body from the passed NextRequest, so we rebuild the request with the injected `asset` field before passing through.)

## TopNav Modal Changes

Three additions to `src/components/TopNav.tsx`:

1. **State (top of component):**
   ```typescript
   const [ccBalance, setCcBalance] = useState<number | null>(null);
   const [ccAmount, setCcAmount] = useState("");
   const [ccDepositing, setCcDepositing] = useState(false);
   const [ccDepositError, setCcDepositError] = useState("");
   ```

2. **Inside `fetchSummary`, fetch CC balance** (parallel to existing USDC fetch):
   ```typescript
   // CC balance (separate asset row in ledger.accounts).
   try {
     const perpUid = getPerpUserId();
     if (perpUid) {
       const r = await fetch(`/api/perp/account/CC?user_id=${encodeURIComponent(perpUid)}`);
       if (r.ok) {
         const d = await r.json();
         const avail = parseFloat(d?.available || "0");
         if (!isNaN(avail)) setCcBalance(avail);
       }
     }
   } catch {}
   ```

3. **New "Deposit CC" section** in the modal body (between the existing balances and the Party ID block). Includes balance display, input, button, error text.

4. **Deposit handler:**
   ```typescript
   async function depositCC() {
     const userId = getPerpUserId();
     if (!userId) { setCcDepositError("not logged in"); return; }
     const amt = parseFloat(ccAmount);
     if (isNaN(amt) || amt <= 0) { setCcDepositError("enter a positive amount"); return; }
     setCcDepositing(true);
     setCcDepositError("");
     try {
       const r = await fetch("/api/perp/deposits/cc", {
         method: "POST",
         headers: { "content-type": "application/json" },
         body: JSON.stringify({ user_id: userId, amount: String(amt) }),
       });
       if (!r.ok) {
         const t = await r.text();
         throw new Error(`deposit failed (${r.status}): ${t.slice(0, 100)}`);
       }
       setCcAmount("");
       fetchSummary(); // refresh balance
     } catch (e: unknown) {
       setCcDepositError(e instanceof Error ? e.message : "deposit failed");
     } finally {
       setCcDepositing(false);
     }
   }
   ```

## UI Layout

The modal body currently has 3 sections divided by `border-b border-zinc-800`:
1. Header (avatar + email/username)
2. Balances (MTC + USDC + Ledger)
3. Party ID (copy button)
4. Actions (Logout)

Insert a NEW section between (2) and (3):
- "CC 余额" + balance number (cyan, like USDC)
- Input + "充值" button row
- Optional error text below

## Validation Rules

- **amount:** parse as float; reject `<= 0` or `NaN`
- **logged-in:** check `getPerpUserId()` returns a value before allowing the request

No client-side max (backend deposit endpoint will eventually reject if needed). The seed endpoint takes amount as a string and forwards it as-is to Canton.

## Out of Scope

- CC-PERP trading market (future spec when CC becomes tradable)
- Withdraw CC
- Transaction history for CC deposits
- Server-side JWT validation (the existing seed endpoint doesn't validate either — matches the demo security model)
- Multi-asset deposit UI (this spec is CC-only; pattern can be templated later)

## Deploy Procedure

1. **Local frontend:** `npm run lint && npm run build` from `mtc-exchange/`
2. **Commit:** single commit with the 2 file changes
3. **Frontend deploy:** `bash deploy-devnet.sh`
4. **Browser smoke:**
   - Open `https://demo.rocky.exchange/perp/BTC-PERP` (logged in)
   - Click the username pill (top-right) to open the account modal
   - See a new "CC 余额" row showing `0.00 CC`
   - In the deposit row, type `5000` and click "充值"
   - Button shows loading state briefly
   - On success: input clears; CC balance updates to `5000.00 CC`
   - Click again with `2500` → balance becomes `7500.00 CC`
   - Try empty input → button disabled OR error shown
   - Try negative amount → error shown
5. **Push** if smoke passes: `git push origin main` for mtc-exchange.

## Acceptance

- `/api/perp/deposits/cc` exists and proxies correctly
- TopNav modal shows CC balance row (defaults to `0.00 CC` for new users)
- Deposit input + button render correctly
- Successful deposit increments the balance shown in the modal
- Invalid input (empty / non-numeric / negative) is rejected client-side
- Backend `ledger.accounts` shows the new `CC` row for the user after deposit
- No regression: existing USDC balance + MTC balance + party ID + logout still work
- Bot uninterrupted (`systemctl --user is-active rocky-bot` → `active`)

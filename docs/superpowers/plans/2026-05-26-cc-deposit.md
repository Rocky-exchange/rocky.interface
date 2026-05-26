# CC Deposit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Deposit CC" feature to the TopNav account modal — user types an amount, clicks a button, their CC balance increments.

**Architecture:** One new Next.js BFF route (`/api/perp/deposits/cc`) that injects `asset: "CC"` and passes through to the existing backend `/v1/deposits/seed`. Four surgical edits to `TopNav.tsx`: state, CC balance fetch in `fetchSummary`, new modal section (balance + input + button), and deposit handler. No backend change, no schema change — `accounts.asset` is a free-form TEXT and `/api/perp/account/[asset]` already handles any asset string.

**Tech Stack:** Next.js 16 (App Router), TypeScript. Spec: `/Users/ubuntu/Desktop/Rocky/rocky.interface/docs/superpowers/specs/2026-05-26-cc-deposit-design.md`.

**Operational reminders for executor (HARD constraints):**
- Local Mac: `npm install / lint / build` for mtc-exchange, bash, git. No Docker.
- mtc-exchange deploy: `bash deploy-devnet.sh` (T2 only).
- EC2: `ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218`.
- Bot is currently **active** on EC2 — don't touch it.
- Backend is unchanged; no `services-remote.sh` invocation needed.
- mtc-exchange HEAD `9b0c8cb`, on `main`, working tree clean, 0 unpushed before this plan.
- 4 pre-existing untracked `.log` files in mtc-exchange — leave alone.
- Do NOT `git push` until T2 browser smoke passes.

---

## File Structure

**New:**
- `mtc-exchange/src/app/api/perp/deposits/cc/route.ts`

**Modified:**
- `mtc-exchange/src/components/TopNav.tsx` (4 surgical edits: state, fetchSummary, new modal section, handler)

**Untouched:**
- All backend (`/v1/deposits/seed` already accepts arbitrary `asset` strings)
- All other frontend files
- Database schema
- `mtc-exchange/.env.local` / `.env.local.example` (no new env needed)
- Bot

---

## Task 1: Code changes (new route + TopNav.tsx edits)

**Files:**
- Create: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/api/perp/deposits/cc/route.ts`
- Modify: `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/components/TopNav.tsx`

- [ ] **Step 1.1: Create the BFF route**

Create `/Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/app/api/perp/deposits/cc/route.ts` with EXACTLY this content:

```typescript
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.ROCKY_BACKEND_URL || "http://127.0.0.1:8080";

export const dynamic = "force-dynamic";

// User-facing CC deposit. Injects asset="CC" then POSTs to backend
// /v1/deposits/seed. NOT devToolsOnly — every logged-in user can call it.
//
// Inlines the passthrough rather than reusing passthroughJSON because we
// need to mutate the body (add `asset` field) before forwarding.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const upstream = `${BACKEND}/v1/deposits/seed`;
    const r = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...body, asset: "CC" }),
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") || "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "backend_unreachable", detail: msg }, { status: 502 });
  }
}
```

The inline implementation matches the shape of the existing `passthroughJSON` helper in `src/lib/perp/bff.ts` but mutates the body before forwarding.

- [ ] **Step 1.2: Read current TopNav state block (verify lines)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
sed -n '52,62p' src/components/TopNav.tsx
```

You should see:
```typescript
  const [party, setParty] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [mtcBalance, setMtcBalance] = useState(0);
  const [usdcAvailable, setUsdcAvailable] = useState<number | null>(null);
  const [ledgerEnd, setLedgerEnd] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
```

- [ ] **Step 1.3: Add CC state**

Find the line `const [copied, setCopied] = useState(false);` and replace it with:

```typescript
  const [copied, setCopied] = useState(false);
  const [ccBalance, setCcBalance] = useState<number | null>(null);
  const [ccAmount, setCcAmount] = useState("");
  const [ccDepositing, setCcDepositing] = useState(false);
  const [ccDepositError, setCcDepositError] = useState("");
```

This adds 4 new state slots after the existing `copied` state.

- [ ] **Step 1.4: Add CC balance fetch inside `fetchSummary`**

Find this block inside the `fetchSummary` function (around lines 86-97):

```typescript
    // USDC: perp-side account, derived user_id (UUIDv5 of party).
    try {
      const perpUid = getPerpUserId();
      if (perpUid) {
        const r = await fetch(`/api/perp/account/USDC?user_id=${encodeURIComponent(perpUid)}`);
        if (r.ok) {
          const d = await r.json();
          const avail = parseFloat(d?.available || "0");
          if (!isNaN(avail)) setUsdcAvailable(avail);
        }
      }
    } catch {}
  }, [party, token]);
```

Replace with (adds a parallel CC fetch block BEFORE the closing `}, [party, token]);`):

```typescript
    // USDC: perp-side account, derived user_id (UUIDv5 of party).
    try {
      const perpUid = getPerpUserId();
      if (perpUid) {
        const r = await fetch(`/api/perp/account/USDC?user_id=${encodeURIComponent(perpUid)}`);
        if (r.ok) {
          const d = await r.json();
          const avail = parseFloat(d?.available || "0");
          if (!isNaN(avail)) setUsdcAvailable(avail);
        }
      }
    } catch {}
    // CC: separate asset row in ledger.accounts.
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
  }, [party, token]);
```

- [ ] **Step 1.5: Add the `depositCC` handler**

Find the existing `copyParty` function (search for `async function copyParty` — should be around line 119-128). After the `copyParty` function (and before the line `const onDashboard = pathname === "/dashboard" ...` derived state), add the new handler:

```typescript
  async function depositCC() {
    const userId = getPerpUserId();
    if (!userId) {
      setCcDepositError("not logged in");
      return;
    }
    const amt = parseFloat(ccAmount);
    if (isNaN(amt) || amt <= 0) {
      setCcDepositError("enter a positive amount");
      return;
    }
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
      fetchSummary(); // refresh balance immediately
    } catch (e: unknown) {
      setCcDepositError(e instanceof Error ? e.message : "deposit failed");
    } finally {
      setCcDepositing(false);
    }
  }
```

- [ ] **Step 1.6: Add the new modal section between Balances and Party ID**

Find this in the modal body (around lines 225-245):

```tsx
            {/* Balances */}
            <div className="px-5 py-4 space-y-3 border-b border-zinc-800">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">MTC 余额</span>
                <span className="text-base font-mono font-semibold text-emerald-400">
                  {fmt(mtcBalance, 4)} <span className="text-xs text-zinc-400 font-normal">MTC</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">USDC 可用 (perp)</span>
                <span className="text-base font-mono font-semibold text-cyan-300">
                  {usdcAvailable === null ? "—" : fmt(usdcAvailable, 2)}
                  <span className="text-xs text-zinc-400 font-normal ml-1">USDC</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">Ledger</span>
                <span className="text-sm font-mono text-zinc-300">Block #{ledgerEnd}</span>
              </div>
            </div>

            {/* Party ID */}
```

Insert the CC section between the closing `</div>` of Balances and the `{/* Party ID */}` comment:

```tsx
            {/* Balances */}
            <div className="px-5 py-4 space-y-3 border-b border-zinc-800">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">MTC 余额</span>
                <span className="text-base font-mono font-semibold text-emerald-400">
                  {fmt(mtcBalance, 4)} <span className="text-xs text-zinc-400 font-normal">MTC</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">USDC 可用 (perp)</span>
                <span className="text-base font-mono font-semibold text-cyan-300">
                  {usdcAvailable === null ? "—" : fmt(usdcAvailable, 2)}
                  <span className="text-xs text-zinc-400 font-normal ml-1">USDC</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">Ledger</span>
                <span className="text-sm font-mono text-zinc-300">Block #{ledgerEnd}</span>
              </div>
            </div>

            {/* CC Deposit */}
            <div className="px-5 py-4 border-b border-zinc-800 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">CC 余额</span>
                <span className="text-base font-mono font-semibold text-amber-300">
                  {ccBalance === null ? "—" : fmt(ccBalance, 2)}
                  <span className="text-xs text-zinc-400 font-normal ml-1">CC</span>
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1000"
                  value={ccAmount}
                  onChange={(e) => setCcAmount(e.target.value)}
                  disabled={ccDepositing}
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                />
                <button
                  onClick={depositCC}
                  disabled={ccDepositing || !ccAmount.trim()}
                  className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {ccDepositing ? "充值中…" : "充值 CC"}
                </button>
              </div>
              {ccDepositError && (
                <div className="text-[11px] text-rose-400">{ccDepositError}</div>
              )}
            </div>

            {/* Party ID */}
```

The new section: amber-colored CC balance display + flex row with number input + amber "充值 CC" button + optional error text.

- [ ] **Step 1.7: Lint locally**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
npm run lint 2>&1 | tail -15
```

Expected: no NEW errors on TopNav.tsx or the new route file. The project has ~66 pre-existing lint errors elsewhere — those are not your concern.

- [ ] **Step 1.8: Build locally**

```bash
npm run build 2>&1 | tail -15
```

Expected: clean Next.js build with no type errors. **Note:** the local Mac sandbox cannot reach `fonts.gstatic.com` and the Next.js Geist font fetch will fail. If you see `Failed to fetch Geist from Google Fonts`, that's environmental and not a code issue — verify type-correctness instead via:

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no output (zero type errors). EC2 will build cleanly (has internet) in T2.

- [ ] **Step 1.9: Commit (specific files only)**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
git add src/app/api/perp/deposits/cc/route.ts src/components/TopNav.tsx
git status --short  # verify ONLY these 2 files are staged (4 pre-existing .log files may show as untracked — leave them)
git commit -m "feat(deposit): CC top-up button in TopNav account modal

New BFF route /api/perp/deposits/cc injects asset=\"CC\" and proxies
to the existing backend /v1/deposits/seed.

TopNav modal now shows a CC balance row (amber, alongside MTC + USDC)
and a deposit input + button. User types amount, clicks 充值 CC,
balance increments. No fixed amount — user enters whatever they want.

Reuses existing /api/perp/account/[asset] route for the balance fetch
(asset-parameterized, supports CC automatically).

Backend unchanged: ledger.accounts.asset accepts arbitrary strings.

See docs/superpowers/specs/2026-05-26-cc-deposit-design.md."
```

After commit: mtc-exchange has 1 unpushed commit on `main`. **Do NOT push.**

---

## Task 2: Deploy + browser smoke + push

**Files:** none modified (purely operational).

Wall-clock budget: ~5 min (frontend-only deploy is fast).

- [ ] **Step 2.1: Deploy frontend**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
bash deploy-devnet.sh 2>&1 | tail -20
```

Expected: rsync source → npm ci (probably no-op, deps unchanged) → npm run build (clean on EC2 with real network) → Stopping :8080 → Starting next start on :8080 → legacy smoke POST `/api/auth alice-test` returns 400 (expected — alice-test isn't a registered email).

If `npm run build` fails on EC2 with a real error (not the local Geist font issue), STOP and report.

- [ ] **Step 2.2: API smoke — POST the new deposit endpoint**

You need a logged-in user. The previous round created `test1@example.com / password123 / testuser1` — use that. First grab the user_id by re-logging in:

```bash
LOGIN=$(curl -s -X POST https://demo.rocky.exchange/api/auth \
  -H 'Content-Type: application/json' \
  -d '{"email":"test1@example.com","password":"password123"}')
echo "$LOGIN" | python3 -m json.tool
USER_ID=$(echo "$LOGIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['user_id'])")
echo "USER_ID=$USER_ID"
```

Note: the `user_id` from `/api/auth` is the `auth.users.user_id` UUID. The deposit endpoint expects the perp `user_id` (UUIDv5 of party, derived by `getPerpUserId`). These may DIFFER. Check by looking at how the frontend's `getPerpUserId` derives it from party:

```bash
grep -n "getPerpUserId\|uuidv5" /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange/src/lib/perp/userId.ts | head -10
```

If `getPerpUserId` returns the SAME UUID the backend expects (UUIDv5 of party), and the backend's `accounts.user_id` is set on first interaction (e.g., via the seed call), the deposit should work with that derived UUID. In the live UI, the browser computes the correct one via `getPerpUserId()`. For this curl test, derive it the same way (or just skip the API curl and rely on browser smoke 2.3 below).

If the curl is too fiddly, **skip to Step 2.3 (browser smoke)** — the browser-side `getPerpUserId()` will produce the right value automatically.

- [ ] **Step 2.3: Browser smoke (the authoritative test)**

Open `https://demo.rocky.exchange` in a browser. Log in with `test1@example.com / password123` (or register a fresh email if test1 doesn't exist). Then:

1. Click the username pill in the top-right → account modal opens
2. **Verify a new "CC 余额" row exists** below USDC. Should display `— CC` initially (loading) then `0.00 CC` (or whatever the current balance is — if you've deposited before, that number).
3. **Verify the deposit input + "充值 CC" button** appears below the balance row.
4. Type `5000` in the input. Click "充值 CC".
   - Button briefly shows "充值中…" while the request is in flight
   - On success: input clears, CC balance updates (visible in the modal) — wait up to 10 seconds for the polling interval to refresh, OR re-open the modal
5. Type `2500` and click again. CC balance should increment further (now ~7500).
6. Try `0` → button stays enabled but on click → see red error text "enter a positive amount"
7. Try `-100` → same error
8. Clear input → button disables (per the `!ccAmount.trim()` check)

- [ ] **Step 2.4: Verify backend state**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 \
  'docker exec rocky-backend-stack-postgres-1 psql -U rocky -d rocky -c "SELECT user_id, asset, round(available::numeric, 2) AS available FROM ledger.accounts WHERE asset = '\''CC'\'' ORDER BY available DESC LIMIT 10"'
```

Expected: at least 1 row with asset='CC' and a positive available amount matching what you deposited in the browser.

- [ ] **Step 2.5: Verify bot still active**

```bash
ssh -i ~/.ssh/rocky-canton-sandbox.pem ubuntu@13.231.118.218 'systemctl --user is-active rocky-bot'
```

Expected: `active`.

- [ ] **Step 2.6: Push mtc-exchange**

Only if 2.3 + 2.4 both passed:

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange
git log --oneline origin/main..HEAD
git push origin main 2>&1 | tail -3
```

Expected: 1 commit pushed.

- [ ] **Step 2.7: Verify clean**

```bash
cd /Users/ubuntu/Desktop/Rocky/rockey-demo-new/mtc-exchange && git log --oneline origin/main..HEAD
```

Expected: empty.

---

## Final Acceptance Checklist

- [ ] `npx tsc --noEmit` clean locally
- [ ] `bash deploy-devnet.sh` succeeded on EC2
- [ ] Browser: TopNav modal shows new "CC 余额" row
- [ ] Browser: typing amount + clicking "充值 CC" increments the balance
- [ ] Browser: empty / zero / negative inputs handled with the right UX
- [ ] `SELECT FROM ledger.accounts WHERE asset = 'CC'` shows the deposited row
- [ ] Bot still `active`
- [ ] mtc-exchange pushed; `git log --oneline origin/main..HEAD` empty

When all checked, users can top up CC from any page via the account modal.

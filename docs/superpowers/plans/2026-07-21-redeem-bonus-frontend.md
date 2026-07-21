# Rocky Redeem Bonus Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the production Primit trial-funds experience to Rocky with Canton session authentication, canonical `/v1/bonus/*` APIs, `USDCx` presentation, and centralized order/withdrawal safeguards.

**Architecture:** A self-contained `modules/lighter/features/bonus` feature owns DTOs, SWR hooks, pages, and presentational components. It uses Rocky's exchange-session Bearer and Canton party as cache identity. Existing shared order and withdrawal adapters remain the only integration points, so desktop/mobile callers cannot bypass precheck or recall UX.

**Tech Stack:** React 18, TypeScript 5, React Router 5, SWR 2, Lingui 4, Sass modules, Vitest, Testing Library, Canton wallet session utilities.

---

Canonical design: `/Users/hellojk/git/rocky/rocky-backend/docs/superpowers/specs/2026-07-21-redeem-bonus-port-design.md`.

Behavior/UI reference only: Primit frontend `origin/main` at `9153085f`. Do not import its wagmi address, EVM chain, `/api/v1/bonus/v1`, or `/lighter/bonus` assumptions.

## File map

### New files

- `src/modules/lighter/features/bonus/api/bonus.types.ts` — exact public DTO and stable error types.
- `src/modules/lighter/features/bonus/api/bonus.api.ts` — relative API client using Rocky exchange-session headers.
- `src/modules/lighter/features/bonus/api/bonus.api.test.ts` — URL, auth, body, and error mapping tests.
- `src/modules/lighter/features/bonus/api/useBonus.ts` — identity-keyed SWR hooks and cache invalidation.
- `src/modules/lighter/features/bonus/api/useBonus.test.tsx` — Canton identity/cache isolation tests.
- `src/modules/lighter/features/bonus/api/useBonusOrderGate.ts` — common opening-order UX precheck.
- `src/modules/lighter/features/bonus/components/BonusBadge.tsx` and `.module.scss` — TopNav badge/states.
- `src/modules/lighter/features/bonus/components/BonusBalanceCard.tsx` and `.module.scss` — `USDCx` balance split.
- `src/modules/lighter/features/bonus/components/BonusCountdown.tsx` — 7-day lifecycle countdown.
- `src/modules/lighter/features/bonus/components/BonusHistoryList.tsx` and `.module.scss` — cursor-paginated attribution history.
- `src/modules/lighter/features/bonus/components/BonusBadge.test.tsx` — empty/active/frozen/expired states.
- `src/modules/lighter/features/bonus/pages/BonusPage.tsx` and `.module.scss` — responsive status/rules/history page.
- `src/modules/lighter/features/bonus/pages/RedeemCodePage.tsx` and `.module.scss` — normalized redeem flow.
- `src/modules/lighter/features/bonus/pages/bonusPages.test.tsx` — disconnected/mobile/redeem behavior.
- `src/modules/lighter/adapters/usePlaceOrderAdapter.spec.tsx` — centralized order-gate regression coverage.
- `src/app/MainRoutes.spec.tsx` — canonical route registration coverage.

### Modified files

- `src/app/MainRoutes.tsx` — add `/bonus` and `/bonus/redeem` inside Rocky runtime providers.
- `src/modules/lighter/components/TopNav/TopNav.tsx`, `TopNav.module.scss` — surface the badge without changing wallet behavior.
- `src/modules/lighter/adapters/usePlaceOrderAdapter.ts` — precheck opening orders once.
- `src/shared/lib/canton-wallet/funds.ts` — recall free bonus before every platform withdrawal.
- `src/shared/lib/canton-wallet/funds.test.ts` — preflight ordering, failure, and response coverage.
- `src/shared/lib/canton-wallet/CantonFundsModal.tsx` — display recalled `USDCx` and refresh data.
- `src/shared/lib/canton-wallet/CantonFundsModal.test.tsx` — recall notice coverage.
- `src/locales/en/messages.po`, `src/locales/zh/messages.po` and generated Lingui catalogs — all new copy.

## Task 1: Define the Rocky bonus API boundary

**Files:**
- Create: `src/modules/lighter/features/bonus/api/bonus.types.ts`
- Create: `src/modules/lighter/features/bonus/api/bonus.api.ts`
- Create: `src/modules/lighter/features/bonus/api/bonus.api.test.ts`

- [ ] **Step 1: Write failing request and stable-error tests**

Cover all of the following in `bonus.api.test.ts` with `vi.stubGlobal("fetch", fetchMock)` and `localStorage.setItem("rocky_exchange_session", "session-1")`:

1. `fetchBonusStatus()` sends `GET /v1/bonus/status` with `Authorization: Bearer session-1`.
2. `fetchBonusHistory({limit: 20, before: "cursor/one"})` URL-encodes the cursor.
3. `checkBonusOrder()` sends symbol, lowercase side, `is_opening`, and leverage.
4. `redeemBonusCode()` sends normalized code and request ID.
5. `recallBonusForWithdraw()` sends only its request ID.
6. A `409` JSON response becomes `BonusApiError` preserving `status`, `code`, and safe `message`.
7. An empty/non-JSON `503` becomes code `bonus_request_failed`, never raw response text.

The first test should be:

```ts
it("uses the canonical status URL and Rocky exchange session", async () => {
  localStorage.setItem("rocky_exchange_session", "session-1");
  fetchMock.mockResolvedValue(jsonResponse({ has_bonus: false }));

  await fetchBonusStatus();

  expect(fetchMock).toHaveBeenCalledWith(
    "/v1/bonus/status",
    expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ Authorization: "Bearer session-1" }),
    })
  );
});
```

- [ ] **Step 2: Run and verify RED**

```bash
yarn test:ci src/modules/lighter/features/bonus/api/bonus.api.test.ts
```

Expected: FAIL because the API modules do not exist.

- [ ] **Step 3: Add exact decimal-string DTOs**

Use the backend field names without a camel-case translation layer:

```ts
export type BonusLifecycleStatus = "active" | "expired_pending" | "recalled" | "frozen";

export type BonusStatusResponse = {
  has_bonus: boolean;
  bonus_account_id?: string;
  status?: BonusLifecycleStatus;
  grant_tier?: string;
  bonus_initial?: string;
  bonus_balance?: string;
  bonus_locked_in_margin?: string;
  bonus_consumed_total?: string;
  bonus_recalled_total?: string;
  max_leverage?: number;
  granted_at?: string;
  expires_at?: string;
};

export type BonusBalanceInfoResponse = {
  total_available: string;
  available: string;
  locked: string;
  principal_free: string;
  principal_locked: string;
  bonus_free: string;
  bonus_locked: string;
  effective_withdrawable: string;
  status?: BonusLifecycleStatus;
};

export type BonusHistoryRow = {
  id: string;
  event_type: string;
  total_cost: string;
  bonus_share: string;
  principal_share: string;
  attribution_rule: string;
  source_trade_id?: string;
  source_funding_id?: string;
  occurred_at: string;
};

export type BonusHistoryResponse = { rows: BonusHistoryRow[]; next_cursor?: string };
export type BonusOrderDecision = {
  decision: "pass" | "reject";
  reason_code?: string;
  message?: string;
  bonus_balance: string;
  total_available: string;
  bonus_ratio_pct: string;
  net_direction?: string;
};
export type BonusRedeemResponse = {
  bonus_account_id: string;
  amount: string;
  granted_at: string;
  expires_at: string;
  replayed: boolean;
};
export type BonusRecallResponse = {
  recalled_amount: string;
  bonus_balance_after: string;
  bonus_locked_after: string;
  effective_withdrawable: string;
  replayed: boolean;
};
```

Add `BonusApiError extends Error` with `status`, `code`, and `data` fields.

- [ ] **Step 4: Implement one authenticated request helper**

```ts
import { exchangeSessionHeaders } from "@/shared/lib/canton-wallet/session";

async function bonusRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  new Headers(exchangeSessionHeaders()).forEach((value, key) => headers.set(key, value));
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`/v1/bonus${path}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new BonusApiError(data.message || "Bonus request failed", {
      status: response.status,
      code: data.error || "bonus_request_failed",
      data,
    });
  }
  return data as T;
}
```

Export `fetchBonusStatus`, `fetchBonusBalanceInfo`, `fetchBonusHistory`, `checkBonusOrder`, `redeemBonusCode`, and `recallBonusForWithdraw`. Do not export a configurable base URL. The redeem helper trims and uppercases the code; the page remains responsible for validation.

- [ ] **Step 5: Run GREEN and commit**

```bash
yarn test:ci src/modules/lighter/features/bonus/api/bonus.api.test.ts
git add src/modules/lighter/features/bonus/api
git commit -m "feat(bonus): add Canton-authenticated bonus API client"
```

Expected: test command exits 0.

## Task 2: Add Canton-identity SWR hooks and coordinated invalidation

**Files:**
- Create: `src/modules/lighter/features/bonus/api/useBonus.ts`
- Create: `src/modules/lighter/features/bonus/api/useBonus.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Render hooks inside `<SWRConfig value={{provider: () => new Map(), dedupingInterval: 0}}>` and mock `useCantonSession` plus the API module. Assert:

1. Disconnected sessions never fetch.
2. Party `party-a` produces keys containing `party-a`.
3. Rerendering as `party-b` fetches fresh data rather than reusing `party-a`.
4. Status refresh interval is 30 seconds and balance is 10 seconds.
5. `invalidateBonusData()` revalidates status, balance, and history keys.
6. Dispatching `rocky:bonus-data-changed` revalidates mounted hooks.

- [ ] **Step 2: Run and verify RED**

```bash
yarn test:ci src/modules/lighter/features/bonus/api/useBonus.test.tsx
```

Expected: FAIL because the hooks do not exist.

- [ ] **Step 3: Implement session-keyed hooks**

Expose this public surface:

```ts
export const BONUS_DATA_CHANGED_EVENT = "rocky:bonus-data-changed";
export function notifyBonusDataChanged(): void;
export function useBonusStatus(): SWRResponse<BonusStatusResponse, BonusApiError>;
export function useBonusBalance(): SWRResponse<BonusBalanceInfoResponse, BonusApiError>;
export function useBonusHistory(limit?: number): {
  rows: BonusHistoryRow[];
  error?: BonusApiError;
  isLoading: boolean;
  hasMore: boolean;
  loadMore(): void;
  refresh(): Promise<unknown>;
};
```

Each hook reads `{connected, party}` from `useCantonSession()`. Use `null` keys until `connected && party`, and include `party` in every key:

```ts
const key = connected && party ? ["bonus-status", party] : null;
return useSWR(key, fetchBonusStatus, { refreshInterval: 30_000 });
```

Use `useSWRInfinite` for history with key `["bonus-history", party, limit, before]`. Register a window-event listener that calls each hook's local `mutate`; clean it up on unmount. `notifyBonusDataChanged` dispatches `new Event(BONUS_DATA_CHANGED_EVENT)`.

- [ ] **Step 4: Run GREEN and commit**

```bash
yarn test:ci src/modules/lighter/features/bonus/api/useBonus.test.tsx
git add src/modules/lighter/features/bonus/api/useBonus.ts \
  src/modules/lighter/features/bonus/api/useBonus.test.tsx
git commit -m "feat(bonus): add Canton-scoped bonus data hooks"
```

Expected: test command exits 0.

## Task 3: Build responsive status and redemption pages

**Files:**
- Create: `src/modules/lighter/features/bonus/components/BonusBalanceCard.tsx`
- Create: `src/modules/lighter/features/bonus/components/BonusBalanceCard.module.scss`
- Create: `src/modules/lighter/features/bonus/components/BonusCountdown.tsx`
- Create: `src/modules/lighter/features/bonus/components/BonusHistoryList.tsx`
- Create: `src/modules/lighter/features/bonus/components/BonusHistoryList.module.scss`
- Create: `src/modules/lighter/features/bonus/pages/BonusPage.tsx`
- Create: `src/modules/lighter/features/bonus/pages/BonusPage.module.scss`
- Create: `src/modules/lighter/features/bonus/pages/RedeemCodePage.tsx`
- Create: `src/modules/lighter/features/bonus/pages/RedeemCodePage.module.scss`
- Create: `src/modules/lighter/features/bonus/pages/bonusPages.test.tsx`

- [ ] **Step 1: Write failing page behavior tests**

Mock `useCantonSession`, the bonus hooks/API, and `TopNav`. Cover:

1. Disconnected `/bonus` renders a Connect wallet action and does not invent zero balances.
2. No-bonus state renders a Redeem trial funds link to `/bonus/redeem`.
3. Active state renders bonus/free/locked/effective-withdrawable figures suffixed `USDCx`, expiry countdown, 50/50 attribution rule, 60% direction rule, and history.
4. Frozen and expired-pending states render explicit non-tradable notices.
5. Redeem input transforms lowercase to uppercase and removes characters outside `[A-Z0-9-]`, capped at 32 characters.
6. Empty/short invalid code does not call the API.
7. API rejection displays its safe message and retains the entered code.
8. Success calls `notifyBonusDataChanged()` and redirects to `/bonus`.
9. A viewport at 390px renders all primary actions without a separate mobile route.

Use a memory history so redirects are asserted through `history.location.pathname`.

- [ ] **Step 2: Run and verify RED**

```bash
yarn test:ci src/modules/lighter/features/bonus/pages/bonusPages.test.tsx
```

Expected: FAIL because page/components do not exist.

- [ ] **Step 3: Implement reusable visual components**

`BonusBalanceCard` receives the balance DTO and renders exactly four user-facing rows: total platform balance, available trial funds, trial funds in margin, and effective withdrawable balance. All labels use `<Trans>` and all decimals use one shared formatter:

```ts
export function formatUsdcx(value?: string, maximumFractionDigits = 2): string {
  const amount = Number(value ?? "0");
  return `${Number.isFinite(amount) ? amount.toLocaleString(undefined, { maximumFractionDigits }) : "0"} USDCx`;
}
```

`BonusCountdown` accepts `expiresAt`, updates once per second, clamps at zero, and renders days/hours/minutes/seconds. `BonusHistoryList` maps `trade_fee`, `realized_pnl`, `funding`, and recall rows to translated labels, displays bonus/principal shares, and exposes a Load more button only when `hasMore`.

- [ ] **Step 4: Implement the pages with Rocky navigation**

Both pages render `TopNav` and one responsive `<main>`. `BonusPage` uses `useBonusStatus`, `useBonusBalance`, and `useBonusHistory(20)`. It must not call the API while disconnected. The active content includes:

- remaining trial balance and expiry;
- the balance card;
- 50% trial-funds attribution for fees/loss/funding, capped by remaining bonus;
- profits are principal and trial funds are non-withdrawable;
- maximum leverage from the API;
- 60% net-direction limitation;
- attribution history.

`RedeemCodePage` generates one idempotency key per submit attempt using `crypto.randomUUID()` with a timestamp/random fallback and calls:

```ts
await redeemBonusCode({ code: normalizedCode, request_id: `bonus-redeem-${nonce}` });
notifyBonusDataChanged();
history.replace("/bonus");
```

Disable submit while pending, prevent double submit, and use `aria-live="polite"` for feedback.

- [ ] **Step 5: Implement one responsive layout**

Use source Primit spacing/hierarchy as reference, but Rocky variables/colors and no EVM account UI. At `max-width: 768px`, stack all cards, make the primary button full width, preserve a minimum 44px tap target, allow long decimals to wrap, and keep page padding at least 16px.

- [ ] **Step 6: Run GREEN, lint these files, and commit**

```bash
yarn test:ci src/modules/lighter/features/bonus/pages/bonusPages.test.tsx
yarn eslint src/modules/lighter/features/bonus/components src/modules/lighter/features/bonus/pages
git add src/modules/lighter/features/bonus/components \
  src/modules/lighter/features/bonus/pages
git commit -m "feat(bonus): add responsive status and redeem pages"
```

Expected: commands exit 0.

## Task 4: Register routes and expose the TopNav badge

**Files:**
- Create: `src/modules/lighter/features/bonus/components/BonusBadge.tsx`
- Create: `src/modules/lighter/features/bonus/components/BonusBadge.module.scss`
- Create: `src/modules/lighter/features/bonus/components/BonusBadge.test.tsx`
- Create: `src/app/MainRoutes.spec.tsx`
- Modify: `src/app/MainRoutes.tsx`
- Modify: `src/modules/lighter/components/TopNav/TopNav.tsx`
- Modify: `src/modules/lighter/components/TopNav/TopNav.module.scss`

- [ ] **Step 1: Write failing badge/navigation tests**

Mock `useBonusStatus` and assert:

1. Disconnected and no-bonus users see a `Redeem` badge linked to `/bonus/redeem`.
2. Active users see the remaining amount in `USDCx` linked to `/bonus`.
3. Frozen users see `Trial funds frozen` and expired-pending users see `Trial funds expiring`; neither is styled as healthy.
4. Loading uses a fixed-width skeleton with an accessible `Loading trial funds` label.
5. `MainRoutes` recognizes both paths instead of falling through to `/trade`.

- [ ] **Step 2: Run and verify RED**

```bash
yarn test:ci src/modules/lighter/features/bonus/components/BonusBadge.test.tsx \
  src/app/MainRoutes.spec.tsx
```

Expected: FAIL because the badge does not exist.

- [ ] **Step 3: Implement the badge**

Keep the badge display-only and let pages own actions. Render a `<NavLink>` with state-specific text, never a clickable nested button. Use `bonus_balance` from status and `formatUsdcx`; use semantic `data-status` values for CSS/tests.

- [ ] **Step 4: Wire routes and navigation**

Add these routes before the fallback in `MainRoutes.tsx`:

```tsx
<Route exact path="/bonus">
  <LighterTradeRuntimeProviders><BonusPage /></LighterTradeRuntimeProviders>
</Route>
<Route exact path="/bonus/redeem">
  <LighterTradeRuntimeProviders><RedeemCodePage /></LighterTradeRuntimeProviders>
</Route>
```

Render `<BonusBadge />` in `TopNav` at the start of the right-hand area, before `rightExtra`/language/wallet controls. Add responsive styles that preserve the wallet control; on narrow screens shorten the active copy but retain `aria-label` with the full amount.

- [ ] **Step 5: Run GREEN and commit**

```bash
yarn test:ci src/modules/lighter/features/bonus/components/BonusBadge.test.tsx \
  src/modules/lighter/features/bonus/pages/bonusPages.test.tsx \
  src/app/MainRoutes.spec.tsx
git add src/app/MainRoutes.tsx \
  src/app/MainRoutes.spec.tsx \
  src/modules/lighter/components/TopNav \
  src/modules/lighter/features/bonus/components/BonusBadge*
git commit -m "feat(bonus): add Rocky routes and navigation badge"
```

Expected: tests exit 0.

## Task 5: Gate opening orders in the common adapter

**Files:**
- Create: `src/modules/lighter/features/bonus/api/useBonusOrderGate.ts`
- Modify: `src/modules/lighter/adapters/usePlaceOrderAdapter.ts`
- Create: `src/modules/lighter/adapters/usePlaceOrderAdapter.spec.tsx`

- [ ] **Step 1: Write failing adapter tests**

Mock `usePrimitOrderSubmit`, `useTradeState`, and `useBonusOrderGate`. Assert:

1. Opening BUY sends `{symbol, side: "buy", is_opening: true, leverage}` before `submitOrder`.
2. Opening SELL sends lowercase `sell`.
3. `reduceOnly: true` bypasses the UX check and still submits.
4. A decision `{decision: "reject", reason_code, message}` throws `BonusOrderRejectedError` and never submits.
5. A network/5xx exception from the optional UX precheck logs one warning and still submits, because the ledger order command remains authoritative.
6. Existing not-ready and missing-symbol errors happen before any precheck.

- [ ] **Step 2: Run and verify RED**

```bash
yarn test:ci src/modules/lighter/adapters/usePlaceOrderAdapter.spec.tsx
```

Expected: FAIL because no bonus gate is invoked.

- [ ] **Step 3: Implement a narrow UX gate**

```ts
export class BonusOrderRejectedError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "BonusOrderRejectedError";
  }
}

export function useBonusOrderGate() {
  const checkOpeningOrder = useCallback(async (input: CheckBonusOrderInput) => {
    try {
      const result = await checkBonusOrder(input);
      if (result.decision === "reject") {
        throw new BonusOrderRejectedError(
          result.reason_code || "bonus_order_rejected",
          result.message || "Order is not allowed for trial funds"
        );
      }
    } catch (error) {
      if (error instanceof BonusOrderRejectedError) throw error;
      console.warn("Bonus order precheck unavailable; ledger will enforce policy", error);
    }
  }, []);
  return { checkOpeningOrder };
}
```

Do not fetch status first: users without a bonus pass cheaply on the backend, which avoids a stale local-status bypass.

- [ ] **Step 4: Invoke it once for every opening path**

After ready/symbol validation and before any signature/submission:

```ts
if (!p.reduceOnly) {
  await checkOpeningOrder({
    symbol: selectedSymbol,
    side: p.side,
    is_opening: true,
    leverage: p.leverage ?? 10,
  });
}
```

Add `checkOpeningOrder` to the callback dependency array. No desktop or mobile order component should import bonus APIs directly.

- [ ] **Step 5: Run GREEN and commit**

```bash
yarn test:ci src/modules/lighter/adapters/usePlaceOrderAdapter.spec.tsx \
  src/modules/lighter/features/orderForm/useMobileAdvancedOrder.spec.tsx \
  src/modules/lighter/mobile/TradePage/OrderBottomSheet/OrderBottomSheet.spec.tsx
git add src/modules/lighter/features/bonus/api/useBonusOrderGate.ts \
  src/modules/lighter/adapters/usePlaceOrderAdapter.ts \
  src/modules/lighter/adapters/usePlaceOrderAdapter.spec.tsx
git commit -m "feat(bonus): precheck opening orders in shared adapter"
```

Expected: tests exit 0.

## Task 6: Recall free trial funds before platform withdrawals

**Files:**
- Modify: `src/shared/lib/canton-wallet/funds.ts`
- Modify: `src/shared/lib/canton-wallet/funds.test.ts`
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.tsx`
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`

- [ ] **Step 1: Write failing shared-withdrawal tests**

Extend the existing fetch mock with ordered calls. Assert:

1. `POST /v1/bonus/recall-for-withdraw` happens before `POST /v1/withdrawals`.
2. Both calls use the exchange-session Bearer.
3. The recall request and withdrawal use stable, distinct idempotency keys generated once per invocation.
4. Recall `409`/`503` prevents the withdrawal call (fail closed).
5. A zero-recall response (including a disabled feature or a user without a
   bonus account) still allows withdrawal, preserving the rollout-safe existing
   withdrawal flow.
6. `CantonWithdrawalResult.bonus_recall` contains the exact recall DTO returned by preflight.
7. The funds modal shows `Recalled 12.50 USDCx in trial funds before withdrawal` after success and refreshes balances/history.

- [ ] **Step 2: Run and verify RED**

```bash
yarn test:ci src/shared/lib/canton-wallet/funds.test.ts \
  src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
```

Expected: FAIL because withdrawal has no bonus preflight/result notice.

- [ ] **Step 3: Extend the shared result type and preflight once**

Import `recallBonusForWithdraw`, `BonusRecallResponse`, and `notifyBonusDataChanged` into `funds.ts`. Extend:

```ts
export type CantonWithdrawalResult = {
  withdrawal_id?: string;
  withdrawal_request_id?: string;
  status?: string;
  bonus_recall?: BonusRecallResponse;
  // existing fields remain
  [key: string]: unknown;
};
```

Then make `submitPlatformWithdrawal` execute:

```ts
const withdrawalKey = input.idempotencyKey || makeWalletWithdrawalIdempotencyKey(input.asset);
const bonusRecall = await recallBonusForWithdraw({ request_id: `${withdrawalKey}-bonus-recall` });
const withdrawal = await requestJson<CantonWithdrawalResult>("/v1/withdrawals", {
  method: "POST",
  headers: sessionJsonHeaders(),
  body: JSON.stringify({
    asset: input.asset,
    amount: positiveAmount(input.amount),
    dest_user_handle_party: destinationParty,
    idempotency_key: withdrawalKey,
  }),
});
notifyBonusDataChanged();
return { ...withdrawal, bonus_recall: bonusRecall };
```

Do not catch a recall error. The backend also recalls authoritatively inside withdrawal; this explicit route is for deterministic preview/result UX and remains idempotent with the derived key.

- [ ] **Step 4: Show recall feedback in the modal**

After the existing successful withdrawal message, inspect `result.bonus_recall?.recalled_amount`. When greater than zero, render a translated `USDCx` notice using the existing modal success/notice surface. Keep the withdrawal ID/chain result unchanged. Existing refresh calls remain, and `notifyBonusDataChanged` refreshes bonus views.

- [ ] **Step 5: Run GREEN and commit**

```bash
yarn test:ci src/shared/lib/canton-wallet/funds.test.ts \
  src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
git add src/shared/lib/canton-wallet/funds.ts \
  src/shared/lib/canton-wallet/funds.test.ts \
  src/shared/lib/canton-wallet/CantonFundsModal.tsx \
  src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
git commit -m "feat(bonus): recall trial funds before withdrawals"
```

Expected: tests exit 0.

## Task 7: Localize, harden, and verify the complete frontend

**Files:**
- Modify: `src/locales/en/messages.po`
- Modify: `src/locales/zh/messages.po`
- Modify: generated Lingui catalogs under `src/locales`
- Modify: `docs/superpowers/plans/2026-07-21-redeem-bonus-frontend.md` checkbox state during execution

- [ ] **Step 1: Extract and translate every new message**

```bash
yarn extract
```

Fill both English and Traditional Chinese `msgstr` values for every new bonus string. Required concepts include Redeem, Trial funds, Active, Frozen, Expiring, Recalled, Available/locked trial funds, Effective withdrawable, attribution history, 50/50 rule, 60% direction rule, code validation, order rejection, withdrawal recall, loading, empty, and retry states. No user-facing Chinese/English literal should remain outside `<Trans>`/`t`.

- [ ] **Step 2: Compile catalogs**

```bash
yarn compile
```

Expected: exits 0 and generated catalogs change only for the intended messages.

- [ ] **Step 3: Run all focused bonus and integration tests**

```bash
yarn test:ci \
  src/modules/lighter/features/bonus/api/bonus.api.test.ts \
  src/modules/lighter/features/bonus/api/useBonus.test.tsx \
  src/modules/lighter/features/bonus/components/BonusBadge.test.tsx \
  src/modules/lighter/features/bonus/pages/bonusPages.test.tsx \
  src/app/MainRoutes.spec.tsx \
  src/modules/lighter/adapters/usePlaceOrderAdapter.spec.tsx \
  src/shared/lib/canton-wallet/funds.test.ts \
  src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
```

Expected: all tests pass with no unhandled promise rejection.

- [ ] **Step 4: Run full frontend verification**

```bash
yarn check:ci
yarn build
git diff --check
git status --short
```

Expected: lint, all Vitest suites, TypeScript, and production build exit 0; `git diff --check` emits nothing. Inspect `git status` and ensure only planned feature/catalog/plan files are present.

- [ ] **Step 5: Perform a manual two-viewport smoke check**

With backend local services configured and bonus enabled:

1. At 1440px: connect Canton wallet, redeem a code, verify badge/status/balance/history, and submit a permitted opening order.
2. At 390px: verify navigation does not overflow, redeem feedback remains visible, a rejected opposite-direction opening shows the backend message, and reduce-only close still submits.
3. Withdraw while free trial funds remain; verify recall is shown in `USDCx`, withdrawn amount proceeds, badge/balance/history refresh, and no bonus amount is shown as withdrawable.
4. Switch Canton accounts; verify the prior party's cached status never flashes as the new party's status.

Record any environment-only blocker with the exact URL/command and output; do not mark the smoke check passed without observing it.

- [ ] **Step 6: Commit localization and verification fixes**

```bash
git add src/locales docs/superpowers/plans/2026-07-21-redeem-bonus-frontend.md
git add -u
git commit -m "chore(bonus): localize and verify frontend flow"
```

Before committing, inspect `git diff --cached --stat` and remove any unrelated staged file.

## Cross-repository acceptance gate

Do not call the feature complete until the backend branch is running with the matching contract and these scenarios pass end to end:

1. Redeem code transfers internal `USDC` from the configured pool and UI displays the grant as `USDCx`.
2. Opening orders hit both the UX precheck and authoritative ledger rule; reduce-only orders bypass only the UX precheck.
3. Fee/loss/funding attribution updates status/balance/history and is visible after refresh.
4. Withdrawal recalls free bonus before principal withdrawal and displays the recalled amount.
5. Frozen/expired accounts reject unsafe operations with stable messages.
6. Canton account switching isolates all bonus data.
7. No wagmi/EVM address, old `/api/v1/bonus/v1`, or `/lighter/bonus` route remains in the new feature:

```bash
rg -n "wagmi|useAccount|/api/v1/bonus/v1|/lighter/bonus" src/modules/lighter/features/bonus
```

Expected: no matches.

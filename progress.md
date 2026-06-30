# Progress Log

## Session: 2026-06-30

### Phase 1-4: Recon, Upstream Sync, and Canton Trade Entry
- **Status:** in_progress
- **Started:** 2026-06-30
- Actions taken:
  - Stopped ongoing wallet integration work per user instruction.
  - Loaded `planning-with-files` and `code-recon` guidance.
  - Created persistent planning files for the migration.
  - Confirmed initial branch/status for the three repositories.
  - Compared high-level tracked file counts and major divergent directories between `rocky.interface` and `primit-avax-interface`.
  - Inspected app shell, route/provider, TopNav, API auth, and Canton wallet/session reference files.
  - Recorded the pseudo-EVM Canton identity fallback as a structural risk.
  - Switched `rocky.interface` to local branch `rocky-canton-migration` before implementation.
  - Installed dependencies with `yarn install --frozen-lockfile`.
  - Reverted Lingui catalog files changed by the install `prepare` side effect.
  - Ran baseline `yarn tscheck`; it fails before migration changes.
  - Created `migration_inventory.md` with delete, keep, upstream import, and Canton reference candidates.
  - Synced upstream `lighter` app/runtime/shared UI structure from `primit-avax-interface`.
  - Deleted old `src/modules/cex`, `src/modules/dex`, committed `sdk/build`, and route-disconnected upstream feature directories.
  - Reduced app routes to `/trade` and rebased the main trade shell onto `LighterTradeRuntimeProviders`.
  - Mounted `CantonConnectModal` globally and switched desktop/mobile trade wallet buttons to Canton connect.
  - Replaced route-disconnected TradingAccount/PrimitAuth/Referrals UI dependencies with Canton or no-op compatibility shims where needed.
  - Added temporary typechain stubs and type fixes required by the remaining upstream synthetics scaffold.
  - Updated stale Lighter open-orders spec to the current API-only mapping.
  - Ported `rocky.ts`, `balances.ts`, and `preapprovalRedirect.ts` from `mtc-exchange` into `src/shared/lib/canton-wallet`.
  - Added Rocky Wallet login/register controls to `CantonConnectModal`.
  - Wired Rocky Wallet auth to `/api/auth` and `/api/register`, then create an exchange session through `/api/wallet/challenge` and `/api/wallet/verify`.
  - Centralized Canton auth reads around `getMtcAuthToken()` so Rocky auth tokens and exchange-session tokens share one frontend session boundary.
  - Added focused tests for Canton session cleanup and Rocky Wallet auth/session persistence.
  - Fixed Vite runtime aliases that still pointed at the removed `src/modules/dex` tree.
  - Restarted the Vite dev server with the corrected alias config and smoke-tested `/trade`.
  - Ran a production Vite build to catch runtime import resolution problems that TypeScript path checks can miss.
  - Added `src/shared/lib/canton-wallet/funds.ts` as the first Canton funds service boundary.
  - Wired the connected Canton wallet button to a minimal funds modal instead of immediately disconnecting.
  - Added deposit reference, Rocky Wallet deposit, Console/Loop wallet deposit, withdrawal, Rocky preapproval, USDCx authorization, USDCx offer accept, and USDCx auto-accept API helpers.
  - Added focused tests for funds request shapes, exchange-session auth headers, Rocky authorization errors, withdrawals, and preapproval authorization URLs.
  - Added funds modal copy buttons for party, deposit ref, target party, and pending offer senders.
  - Added Console Wallet pending USDCx offer list through the existing Console Wallet SDK helper.
  - Added Rocky Wallet USDCx auto-accept read/write controls.
  - Added 15s balance and pending-offer refresh while the funds modal is open.
  - Expanded funds tests for USDCx auto-accept and non-Console pending-offer behavior.
- Files created/modified:
  - `task_plan.md` (created)
  - `findings.md` (created)
  - `progress.md` (created)
  - `migration_inventory.md` (created)
  - `src/shared/lib/canton-wallet/rocky.ts` (created)
  - `src/shared/lib/canton-wallet/balances.ts` (created)
  - `src/shared/lib/canton-wallet/preapprovalRedirect.ts` (created)
  - `src/shared/lib/canton-wallet/rocky.test.ts` (created)
  - `src/shared/lib/canton-wallet/funds.ts` (created)
  - `src/shared/lib/canton-wallet/funds.test.ts` (created)
  - `src/shared/lib/canton-wallet/CantonFundsModal.tsx` (created)

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| `yarn tscheck` | Clean branch plus planning docs | TypeScript baseline result | Failed with existing errors in old `dex/cex`, missing typechain modules, React type duplication, and Lighter adapter mismatches | Baseline failure |
| `yarn tscheck` | After upstream sync/prune and Canton trade entry wiring | TypeScript compiles | Passed | Pass |
| `yarn test:ci src/modules/lighter/adapters/lighterOpenOrders.spec.ts` | Updated API-only open-order adapter spec | 3 tests pass | 3 tests passed | Pass |
| `yarn test:ci src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts` | Canton wallet session and Rocky Wallet auth/session behavior | Session cleanup and Rocky auth persistence pass | 3 tests passed | Pass |
| `yarn test:ci src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts` | Canton wallet funds/session/auth focused tests | 10 tests pass | 10 tests passed | Pass |
| `yarn test:ci src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts` | Combined focused regression suite for touched funds, wallet, and Lighter adapter surfaces | 13 tests pass | 13 tests passed | Pass |
| `yarn test:ci src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts` | Combined focused regression suite for touched wallet and Lighter adapter surfaces | 6 tests pass | 6 tests passed | Pass |
| `curl http://localhost:3012/trade` | Vite dev server after funds modal hardening | HTTP 200 | 200 | Pass |
| `yarn build` | Production Vite build | Bundle succeeds with no unresolved imports | Passed, with existing Rollup chunk/sourcemap warnings | Pass |
| `git diff --check` | Current working tree diff | No whitespace errors | Passed | Pass |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| | | 1 | |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 5 implementation: trade route compiles with Canton wallet entry, Rocky Wallet session creation, and a funds modal/service boundary with copy, pending offers, auto-accept, and refresh; deeper EVM scaffolding remains |
| Where am I going? | Polish Canton funds UX and then remove remaining EVM provider dependencies |
| What's the goal? | Sync `rocky.interface` with the pruned upstream baseline and replace EVM-only flows with Canton flows based on `mtc-exchange` |
| What have I learned? | See `findings.md`; Rocky Wallet login/register can be frontend-safe, but transfer/preapproval execution belongs behind backend API routes while Console/Loop transfers can use browser SDKs |
| What have I done? | Synced/pruned structure, wired Canton connect on the trade shell, added Rocky Wallet session creation, added and hardened a Canton funds service/modal, fixed Vite aliases, and restored TypeScript/test green for the touched surface |

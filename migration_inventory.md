# Migration Inventory: rocky.interface Canton Migration

## Baselines
- Current repo: `/Users/hellojk/git/rocky/rocky.interface`, branch `rocky-canton-migration`
- Upstream pruning baseline: `/Users/hellojk/git/xblade/primit/avax/primit-avax-interface`, branch `arbitrum`
- Canton behavior reference: `/Users/hellojk/git/rocky/mtc-exchange`, branch `main`

## Baseline Verification
- `yarn install --frozen-lockfile`: completed.
- Baseline `yarn tscheck`: failed before migration changes.
- Current `yarn tscheck`: passed after upstream sync/prune and Canton trade entry wiring.
- `yarn test:ci src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed.
- `yarn test:ci src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts`: passed.
- `yarn test:ci src/shared/lib/canton-wallet/funds.test.ts src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts`: passed.
- `yarn test:ci src/shared/lib/canton-wallet/session.test.ts src/shared/lib/canton-wallet/rocky.test.ts src/modules/lighter/adapters/lighterOpenOrders.spec.ts`: passed.
- `curl http://localhost:3012/trade`: returned 200 on the restarted Vite dev server.
- `yarn build`: passed.
- `git diff --check`: passed.
- Baseline failures are dominated by old `dex/cex`, missing EVM typechain modules, duplicate React type packages, stale API type exports, and current Lighter adapter mismatches.

## Rocky Extra Files Versus Upstream
These exist in `rocky.interface` but not in `primit-avax-interface`.

| Group | Count | Initial Classification |
|-------|-------|------------------------|
| `sdk/build/**` | 609 | Delete candidate; generated/built SDK artifacts should not drive Canton app behavior. |
| `src/modules/dex/**` | 485 | Delete candidate; EVM/GMX chain logic. |
| `src/modules/cex/**` | 97 | Replace candidate; old x10000 API/UI paths should be superseded by upstream `lighter` plus Canton adapters. |
| `src/shared/components/**` | 299 | Mixed; mostly EVM/GMX UI delete candidates, with review needed for generic UI. |
| `src/shared/lib/**` | 53 | Mixed; keep Canton wallet draft, review old EVM helpers. |
| `src/shared/img/**` | 32 | Mixed; keep Rocky branding/assets if still used. |
| `src/shared/utils/**` | 24 | Review. |
| `src/shared/hooks/**` | 23 | Review. |
| `src/modules/lighter/**` | 21 | Keep/review; Rocky-specific pages and badges may be product customizations. |

## Upstream Files Missing From Rocky
These exist in `primit-avax-interface` but not in `rocky.interface`.

| Group | Count | Initial Classification |
|-------|-------|------------------------|
| `src/modules/lighter/**` | 508 | Import/sync candidate; this is the current upstream trading runtime. |
| `src/shared/styles/**` | 32 | Import/sync candidate for upstream UI shell. |
| `src/shared/ui/**` | 25 | Import/sync candidate for upstream shared primitives. |
| `src/shared/components/**` | 25 | Import/sync candidate; newer shared components including trading account surface. |
| `src/shared/fonts/**` | 12 | Import if referenced by upstream styles. |
| `src/shared/context/**` | 3 | Import with upstream app providers. |

## Keep Candidates
- `task_plan.md`, `findings.md`, `progress.md`, `migration_inventory.md`.
- `src/shared/lib/canton-wallet/**`: active draft Canton wallet/session/funds layer with Console, Loop, Rocky auth/session, preapproval redirect, balance helpers, funds API helpers, and a minimal funds modal.
- `package.json` dependencies for `@console-wallet/dapp-sdk` and `@fivenorth/loop-sdk`.
- `vite.config.ts` API proxy behavior for `/api` and `/auth`, pending final backend routing.
- Rocky brand/static assets such as `public/logo.svg`, `public/stone.*`, `public/loading.png`, `public/favicon.svg`, pending UI review.
- Rocky-specific `src/modules/lighter/pages/*` for Portfolio, Mining, VIP, Explorer, pending product route decision.

## Delete Candidates
- `src/modules/dex/**` - removed in first pass.
- Most of `src/modules/cex/**` - removed in first pass.
- EVM/GMX account modal and transaction components under `src/shared/components/**`.
- EVM-only helpers under `src/shared/lib/contracts`, `src/shared/lib/multicall`, old `src/shared/lib/sdk`, and old wallet/signing helpers, after imports are removed.
- `sdk/build/**`, unless a release process explicitly requires committed build artifacts - removed in first pass.

## Import Candidates From Upstream
- `src/modules/lighter/api/**`
- `src/modules/lighter/context/**`
- `src/modules/lighter/domain/**`
- `src/modules/lighter/features/**`
- `src/modules/lighter/providers/**`
- `src/modules/lighter/store/**`
- `src/shared/ui/**`
- `src/shared/styles/**`
- `src/shared/context/**`
- `src/shared/components/TradingAccountModal/**`, as a temporary reference before replacing with Canton funds modal.

## First-Pass Removed Upstream Feature Surfaces
- `src/modules/lighter/features/accounts/**`
- `src/modules/lighter/features/blog/**`
- `src/modules/lighter/features/bonus/**`
- `src/modules/lighter/features/earn/**`
- `src/modules/lighter/features/feeVip/**`
- `src/modules/lighter/features/leaderboard/**`
- `src/modules/lighter/features/points/**`
- `src/modules/lighter/features/referrals/**`
- `src/modules/lighter/pages/BlogPage/**`
- `src/shared/components/TradingAccountModal/**`
- `src/shared/components/Referrals/**`
- `src/shared/components/PrimitAuth/**`

## Remaining Temporary EVM Scaffolding
- `src/shared/lib/wallets/**` RainbowKit/wagmi provider and connector files.
- `src/modules/lighter/context/TradingAccountContext/**`.
- `src/modules/lighter/api/custom/usePrimitAuth.ts`.
- `src/modules/lighter/store/SyntheticsStateContext/**` and selected `domain/synthetics/**` utilities retained for compile compatibility.
- `src/modules/lighter/domain/multichain/**` retained with no-op compatibility for removed TradingAccount UI paths.

## Canton Reference Candidates From mtc-exchange
- `src/lib/wallet/types.ts` - ported/adapted.
- `src/lib/wallet/session.ts` - ported/adapted.
- `src/lib/wallet/console.ts` - ported/adapted.
- `src/lib/wallet/loop.ts` - ported/adapted.
- `src/lib/wallet/rocky.ts` - ported/adapted.
- `src/lib/wallet/balances.ts` - ported/adapted.
- `src/lib/wallet/preapprovalRedirect.ts` - ported/adapted.
- `src/lib/wallet/preapprovalOAuth.ts` - do not port to the Vite client; server-only behavior should stay behind backend/API routes.
- `src/lib/compat/symbol.ts`
- `src/lib/compat/shape.ts`
- `src/lib/perp/userId.ts`
- API behavior behind `/api/wallet/*`, `/api/deposits/*`, `/api/withdrawals/*`, and `/api/v1/*`.

## Canton Funds Port Status
- `src/shared/lib/canton-wallet/funds.ts` now wraps:
  - `/api/deposits/reference`
  - `/api/deposits/cc/credit`
  - `/api/deposits/usdcx/credit`
  - `/api/withdrawals`
  - `/api/perp/account/:asset`
  - `/api/wallet/preapproval/authorize`
  - `/api/wallet/usdcx/authorize`
  - `/api/wallet/usdcx/accept`
  - `/api/wallet/usdcx/auto-accept`
- Console and Loop wallet deposits use the existing browser SDK transfer helpers after creating a backend deposit reference.
- Rocky Wallet deposits use backend routes because the MTC transfer implementation is server-side.
- `src/shared/lib/canton-wallet/CantonFundsModal.tsx` now covers a usable first funds entry:
  - wallet balance refresh
  - party/deposit reference/target-party copy actions
  - deposit and withdrawal forms
  - Console pending USDCx offer list
  - Rocky USDCx auto-accept read/write controls
  - 15s balance and pending-offer refresh while open
- Remaining funds UI work is production polish: copy text, responsive layout, richer error/empty states, and full backend-driven Rocky pending-offer visibility if that route becomes available.

## First Implementation Order
1. Sync upstream app shell and `lighter` runtime into `rocky.interface`.
2. Preserve Rocky-specific product pages and Canton wallet draft while removing old global EVM providers.
3. Replace `cex` imports with `lighter/api` imports.
4. Remove the pseudo-EVM Canton fallback from global `useWallet()`.
5. Add explicit Canton session/funds modules based on `mtc-exchange`.
6. Polish Canton funds UI: responsive layout, production copy, richer error/empty states, and backend-driven Rocky pending-offer listing if available.
7. Remove remaining EVM provider/signing scaffolding once funds and trading no longer depend on it.

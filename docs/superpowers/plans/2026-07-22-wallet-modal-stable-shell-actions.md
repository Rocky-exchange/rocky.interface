# Wallet Modal Stable Shell And Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the four wallet actions and keep every wallet modal page at one stable size.

**Architecture:** Use the existing `CantonFundsModal` view state and markup. Move sizing and scrolling responsibilities to the shared modal/workspace CSS, then restyle the existing four action buttons without changing component data flow or funding handlers.

**Tech Stack:** React, TypeScript, SCSS modules, Vitest, Playwright

---

### Task 1: Add stable shell source coverage

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.source.test.ts`

- [ ] **Step 1: Add a failing CSS contract test**

Read `CantonFundsModal.module.scss` and assert the shared `.modal` contains `width: min(480px`, `height: min(680px`, and the mobile operation override no longer contains `height: auto`.

- [ ] **Step 2: Run the focused test**

```bash
yarn vitest run src/shared/lib/canton-wallet/CantonFundsModal.source.test.ts
```

Expected: FAIL before the shared height is implemented.

### Task 2: Implement the stable shell and action controls

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.module.scss`

- [ ] **Step 1: Make the shell stable**

Apply a common flex shell and scrolling workspace:

```scss
.modal {
  display: flex;
  width: min(480px, calc(100vw - 32px));
  height: min(680px, calc(100vh - 32px));
  flex-direction: column;
  overflow: hidden;
}

.walletWorkspace {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}
```

Remove the smaller operation-page dimensions. At `max-width: 520px`, both Assets and operation views use `100vw` by `100vh`.

- [ ] **Step 2: Restyle the four actions**

Keep the existing two-column order but replace full-width separators with an 8 px grid gap and individual 48 px bordered buttons. Use left-aligned text, a framed 28 px icon container, a surface hover state, and the existing visible focus outline.

- [ ] **Step 3: Verify**

```bash
yarn vitest run src/shared/lib/canton-wallet/CantonFundsModal.source.test.ts src/shared/lib/canton-wallet/CantonFundsModal.test.tsx src/shared/lib/canton-wallet/funds.test.ts
yarn eslint src/shared/lib/canton-wallet/CantonFundsModal.tsx src/shared/lib/canton-wallet/CantonFundsModal.test.tsx src/shared/lib/canton-wallet/CantonFundsModal.source.test.ts
yarn tscheck
yarn build
git diff --check
```

Capture Assets, Deposit, Withdraw, Transfer, and History at desktop size and confirm each dialog is 480 x 680 px. Capture a 390 x 844 mobile viewport and confirm all views are full-screen without horizontal overflow.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-22-wallet-funds-modal-redesign-design.md docs/superpowers/plans/2026-07-22-wallet-modal-stable-shell-actions.md src/shared/lib/canton-wallet/CantonFundsModal.module.scss src/shared/lib/canton-wallet/CantonFundsModal.source.test.ts
git commit -m "feat: stabilize wallet modal layout"
```

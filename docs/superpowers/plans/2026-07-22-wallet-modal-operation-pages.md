# Wallet Modal Operation Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the wallet modal mounted while Deposit, Withdraw, Transfer, and History open as compact internal pages with a shared back/title/close header.

**Architecture:** `CantonFundsModal` remains the controller and keeps all existing balances, mutations, and history state. The Assets dashboard retains the full wallet identity header and four-action grid; non-Assets views use a compact modal class and a reusable operation-page header while reusing the existing forms and history list.

**Tech Stack:** React, TypeScript, CSS Modules/SCSS, Lingui, Vitest, Testing Library, Playwright.

---

## File Structure

- Modify `src/shared/lib/canton-wallet/CantonFundsModal.tsx`: select the dashboard or operation-page shell from `activeView`, provide shared internal navigation, and preserve existing business handlers.
- Modify `src/shared/lib/canton-wallet/CantonFundsModal.module.scss`: size and lay out the compact operation page on desktop and mobile.
- Modify `src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`: verify in-modal navigation, shell visibility, back behavior, and close behavior.

### Task 1: Lock The Internal Page Behavior With Tests

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`

- [ ] **Step 1: Write a failing navigation test**

Add a test that renders the open modal, clicks the Deposit action, and asserts the same dialog remains mounted while the dashboard identity header and action grid disappear:

```tsx
it("opens operation pages inside the existing modal and returns to Assets", () => {
  const onClose = vi.fn();
  render(<CantonFundsModal open onClose={onClose} />);

  const dialog = screen.getByRole("dialog");
  fireEvent.click(screen.getByRole("tab", { name: "Deposit" }));

  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(screen.getByRole("heading", { name: "Deposit" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit display name" })).toBeNull();
  expect(screen.queryByRole("tab", { name: "Withdraw" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Back to assets" }));
  expect(screen.getByRole("button", { name: "Edit display name" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Deposit" })).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Add coverage for all four page headers and close**

Use a table-driven test for Deposit, Withdraw, Transfer, and History. Open each view from a fresh render, assert its centered page heading and close control exist, click close, and assert `onClose` is called once.

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```bash
yarn vitest run src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
```

Expected: FAIL because the full profile header and four-action grid remain visible on operation views.

### Task 2: Implement The Dashboard-To-Page Shell

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.tsx`

- [ ] **Step 1: Derive the shell mode and compact dialog label**

Add:

```tsx
const isAssetsDashboard = activeView === "assets";
const operationTitle =
  activeView === "deposit"
    ? i18n._(t`Deposit`)
    : activeView === "withdraw"
      ? i18n._(t`Withdraw`)
      : activeView === "transfer"
        ? i18n._(t`Transfer`)
        : activeView === "history"
          ? i18n._(t`History`)
          : "";
```

Apply `cx(styles.modal, !isAssetsDashboard && styles.operationModal)` to the dialog and point `aria-labelledby` to either the dashboard title or operation-page title.

- [ ] **Step 2: Render the profile header and action grid only on Assets**

Wrap the existing profile `<header>` and four-action `<nav>` in `isAssetsDashboard` conditions. Keep the existing action order:

```tsx
["deposit", "withdraw", "transfer", "history"]
```

Do not change any mutation callbacks, selected-asset behavior, or refresh behavior.

- [ ] **Step 3: Add one reusable operation-page header**

Render this once above the active operation content:

```tsx
function OperationPageHeader({ title, onBack, onClose }: OperationPageHeaderProps) {
  return (
    <header className={styles.operationHeader}>
      <button type="button" className={styles.operationHeaderButton} onClick={onBack} aria-label={i18n._(t`Back to assets`)}>
        <BackIcon />
      </button>
      <h2 id="rocky-wallet-operation-title">{title}</h2>
      <button type="button" className={styles.operationHeaderButton} onClick={onClose} aria-label={i18n._(t`Close wallet dashboard`)}>
        <CloseIcon />
      </button>
    </header>
  );
}
```

The actual implementation may keep this component inside the same module and pass already localized labels so it does not need its own Lingui hook.

- [ ] **Step 4: Remove duplicated task headers**

Remove the existing back/title blocks from Deposit, Withdraw, Transfer, and History. Keep their form fields, detail rows, history filters, notices, and errors unchanged.

- [ ] **Step 5: Run the focused test**

Run:

```bash
yarn vitest run src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
```

Expected: all `CantonFundsModal` tests pass.

### Task 3: Match The Compact Page Layout

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.module.scss`

- [ ] **Step 1: Add the compact operation modal dimensions**

Add a desktop width near the approved reference while preserving viewport constraints:

```scss
.operationModal {
  width: min(460px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
}

.operationModal .walletWorkspace {
  min-height: 0;
}
```

- [ ] **Step 2: Add the shared page header grid**

Use three columns so the title stays mathematically centered regardless of button width:

```scss
.operationHeader {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 64px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.operationHeader h2 {
  margin: 0;
  text-align: center;
  font: 600 16px/24px var(--font-display);
}
```

Use 44 px icon buttons with existing colors, focus state, and 4 px radius.

- [ ] **Step 3: Constrain operation content without changing fields**

Set `.operationModal .taskView` and `.operationModal .historyView` to full width, remove their dashboard max widths, and use 18-20 px padding. Keep forms single-column and history rows readable.

- [ ] **Step 4: Add the mobile behavior**

At `max-width: 520px`, make `.operationModal` use the viewport width and height constraints while retaining the 44 px back and close targets. Do not hide any form or history functionality.

- [ ] **Step 5: Run static verification**

Run:

```bash
yarn eslint src/shared/lib/canton-wallet/CantonFundsModal.tsx src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
yarn tscheck
git diff --check
```

Expected: all commands exit with status 0.

### Task 4: Browser Verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Start or reuse the local app**

Use `http://localhost:3014/spot/CBTC-USDA`. Preserve the existing mocked balance routes used for visual verification so all asset values remain deterministic.

- [ ] **Step 2: Verify the Assets dashboard**

Capture a 1600×1100 screenshot and confirm the profile header, two-row action grid, asset toolbar, asset table, row spinners, and exchange balances remain aligned.

- [ ] **Step 3: Verify all operation pages**

Open Deposit, Withdraw, Transfer, and History one at a time. For each page confirm:

- the modal remains mounted;
- the compact width is applied;
- profile and action navigation are absent;
- back, centered title, and close are visible;
- content has no overlap, clipping, or blank region;
- back returns to the same populated Assets dashboard.

- [ ] **Step 4: Verify mobile layout**

Repeat at 390×844. Confirm the operation page fits the viewport, controls remain at least 40 px tall, and history/form content scrolls inside the modal when needed.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/shared/lib/canton-wallet/CantonFundsModal.tsx \
  src/shared/lib/canton-wallet/CantonFundsModal.module.scss \
  src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
git commit -m "feat: add wallet modal operation pages"
```


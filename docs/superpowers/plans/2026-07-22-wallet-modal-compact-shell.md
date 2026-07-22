# Wallet Modal Compact Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halve the desktop Assets modal width and replace the overflow menu with a directly visible red disconnect button.

**Architecture:** Keep `CantonFundsModal` as the existing controller and reuse `handleDisconnect`. Limit the change to the Assets shell JSX, its CSS module, and focused component tests; operation-page layout and all funding logic remain unchanged.

**Tech Stack:** React, TypeScript, SCSS modules, Vitest, Testing Library

---

### Task 1: Specify the compact header behavior

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that verifies the overflow trigger is absent, a labeled `Disconnect` button is visible, and activating it calls both the wallet disconnect function and `onClose`:

```tsx
it("shows a direct disconnect action instead of the profile overflow menu", async () => {
  const onClose = vi.fn();
  render(<CantonFundsModal open onClose={onClose} />);

  expect(screen.queryByLabelText("More profile actions")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

  await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
yarn vitest run src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
```

Expected: FAIL because `Disconnect` is still nested inside the overflow menu and the overflow trigger remains rendered.

### Task 2: Implement the compact shell

**Files:**
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.tsx`
- Modify: `src/shared/lib/canton-wallet/CantonFundsModal.module.scss`

- [ ] **Step 1: Replace the overflow menu**

Remove `handleRemoveAvatar`, `MoreIcon`, `RemoveAvatarIcon`, and the `<details>` menu. Render the existing `LogoutIcon` directly:

```tsx
<button
  type="button"
  className={cx(styles.headerIconButton, styles.disconnectButton)}
  onClick={() => void handleDisconnect()}
  aria-label={i18n._(t`Disconnect`)}
  title={i18n._(t`Disconnect`)}
>
  <LogoutIcon />
</button>
```

- [ ] **Step 2: Apply the approved dimensions and red treatment**

Set the Assets modal cap to 480 px while preserving the mobile override and 460 px operation pages:

```scss
.modal {
  width: min(480px, calc(100vw - 32px));
}

.disconnectButton {
  color: var(--status-error);
  border-color: rgba(199, 101, 93, 0.55);

  &:hover {
    color: var(--status-error);
    background: rgba(199, 101, 93, 0.1);
    border-color: var(--status-error);
  }
}
```

Reduce table and toolbar gaps only where necessary so all three balance columns remain readable at 480 px. Do not change operation-page sizing.

- [ ] **Step 3: Run focused verification**

Run:

```bash
yarn vitest run src/shared/lib/canton-wallet/CantonFundsModal.test.tsx src/shared/lib/canton-wallet/funds.test.ts
yarn eslint src/shared/lib/canton-wallet/CantonFundsModal.tsx src/shared/lib/canton-wallet/CantonFundsModal.test.tsx
yarn tscheck
yarn build
git diff --check
```

Expected: all commands pass. Capture a desktop screenshot confirming the Assets modal is approximately 480 px wide and the red disconnect button appears between Explorer and Close; capture a 390 px mobile screenshot confirming no horizontal overflow.

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/canton-wallet/CantonFundsModal.tsx src/shared/lib/canton-wallet/CantonFundsModal.module.scss src/shared/lib/canton-wallet/CantonFundsModal.test.tsx docs/superpowers/plans/2026-07-22-wallet-modal-compact-shell.md
git commit -m "feat: compact wallet modal shell"
```

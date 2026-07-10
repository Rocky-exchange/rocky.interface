# Welcome Checklist Modal — Onboarding Design

**Date:** 2026-07-10
**Status:** Approved
**Scope owner:** Nick

## Goal

Add a new-user onboarding "Welcome" checklist modal to Rocky, closing the gap
between Rocky's existing spotlight tour and the fuller onboarding flow in the
peer project `~/Desktop/Primit/primit-avax-interface`.

## Context

Rocky already ships a `driver.js` spotlight tour:
`src/modules/lighter/components/Onboarding/OnboardingTour.tsx` — an 8-step
walkthrough (welcome → connect → market → chart → orderbook → orderform →
positions → done), gated by the `rocky_onboarded_v1` localStorage flag, with a
floating "?" replay button. Bilingual (en/zh), desktop-only.

Primit adds a **Welcome getting-started checklist modal** shown *before* the
spotlight tour. That modal is the piece Rocky lacks and what this feature adds.

## Scope

**In:**
- A static Welcome checklist modal shown on first visit, before the tour.
- Reuse Rocky's `Modal` (`variant="primit"`) and `Button` components.
- Bilingual en/zh copy, matching the existing `OnboardingTour.tsx` pattern.
- Wire the modal into the existing first-visit gate and "?" replay button.

**Out (explicit non-goals):**
- Live progress tracking (no reading wallet/deposit/trade state).
- Mobile onboarding (`TradePageMobile` unchanged).
- Changes to the existing spotlight tour steps/anchors.

## Design

### Flow / state machine

The existing `OnboardingTour` currently *drives the tour* directly on first
visit. Insert the welcome modal in front:

```
first visit → phase "welcome" (modal auto-opens ~900ms after paint)
  "Show me around" → dismiss modal + startOnboardingTour()  (existing driver.js)
  "Skip for now" / close (Esc / backdrop) → phase "idle"
```

- Phase state: `"idle" | "welcome"` via `useState` inside `OnboardingTour`.
  The spotlight tour itself is driver.js-managed, so no `"tour"` phase is needed.
- First-visit gate: keep the `rocky_onboarded_v1` localStorage flag. It is set
  once when the modal first opens, so the modal never auto-re-nags.
- Floating "?" button: reopens the **welcome modal** (phase → "welcome"), not
  straight into the tour. The checklist is a useful reference, and "Show me
  around" from there still launches the spotlight tour.

### Content (4 static steps, bilingual)

1. **Connect wallet** — Use the button in the top-right corner.
2. **Establish connection** — One gas-free signature to authenticate.
3. **Deposit funds** — Top up your trading account with USDC.
4. **Place your first order** — Pick a market, set size and leverage, go.

Copy uses an `EN`/`ZH` object keyed by `i18n.locale` (same approach as
`OnboardingTour.tsx`), not lingui macros — deliberate, matching the module's
existing non-render, module-scope pattern.

### Components / files

- **New:** `src/modules/lighter/components/Onboarding/WelcomeModal.tsx`
  - Props: `{ isVisible: boolean; onStartTour: () => void; onDismiss: () => void }`.
  - Renders `Modal variant="primit"` with a numbered `<ol>` of the 4 steps and
    two `Button`s ("Show me around" primary → `onStartTour`, "Skip for now"
    secondary → `onDismiss`).
- **Edit:** `OnboardingTour.tsx`
  - Add `phase` state, render `<WelcomeModal/>`, change first-visit effect to
    open the modal instead of driving the tour, change "?" to reopen the modal.
- **Edit:** `onboarding.css` — append `.rocky-welcome-*` styles for the numbered
  step list (number badge + title + description), matching the dark theme.

### Styling

Reuse `Modal variant="primit"` (charcoal, square corners, ~85% scrim) for the
shell. New CSS block styles the step list only.

## Testing / verification

No test framework is wired for this module; verification is manual:
1. Clear `rocky_onboarded_v1` → reload `/trade` → welcome modal appears.
2. "Show me around" → modal closes, spotlight tour runs.
3. "Skip for now" / Esc / backdrop → modal closes, tour does not run.
4. Reload → modal does not reappear.
5. "?" button → welcome modal reopens.
6. Verify en and zh copy both render (toggle language).
7. `tsc` / build passes.

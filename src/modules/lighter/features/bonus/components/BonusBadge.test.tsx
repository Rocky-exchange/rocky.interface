import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryHistory } from "history";
import { readFileSync } from "node:fs";
import type { PropsWithChildren } from "react";
import { MemoryRouter, Router } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { BonusBadge } from "./BonusBadge";
import { BonusApiError, type BonusStatusResponse } from "../api/bonus.types";
import { useBonusStatus } from "../api/useBonus";

vi.mock("@/shared/lib/canton-wallet/CantonFundsModal", () => ({
  CantonFundsModal: () => null,
}));

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));

vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: vi.fn(),
}));

vi.mock("@/shared/lib/i18n", () => ({
  dynamicActivate: vi.fn(),
}));

vi.mock("../api/useBonus", () => ({
  useBonusStatus: vi.fn(),
}));

const ACTIVE_STATUS: BonusStatusResponse = {
  has_bonus: true,
  bonus_account_id: "bonus-1",
  status: "active",
  grant_tier: "COMMUNITY",
  bonus_initial: "2000",
  bonus_balance: "1500.555",
  bonus_locked_in_margin: "250",
  bonus_consumed_total: "499.445",
  bonus_recalled_total: "0",
  max_leverage: 8,
  granted_at: "2026-07-21T00:00:00Z",
  expires_at: "2026-07-28T00:00:00Z",
};

const mUseBonusStatus = vi.mocked(useBonusStatus);
const mUseCantonSession = vi.mocked(useCantonSession);

i18n.load("en", {});
i18n.activate("en");

function TestShell({ children }: PropsWithChildren) {
  return (
    <I18nProvider i18n={i18n}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nProvider>
  );
}

function renderBadge() {
  return render(<BonusBadge />, { wrapper: TestShell });
}

function renderBadgeAt(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  return render(
    <I18nProvider i18n={i18n}>
      <Router history={history}>
        <BonusBadge />
      </Router>
    </I18nProvider>
  );
}

function mockStatus(response: Partial<ReturnType<typeof useBonusStatus>>) {
  mUseBonusStatus.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    ...response,
  } as ReturnType<typeof useBonusStatus>);
}

beforeEach(() => {
  vi.resetAllMocks();
  mUseCantonSession.mockReturnValue({
    connected: false,
    token: "",
    party: "",
    username: "",
    avatar: "",
    provider: "",
  });
  mockStatus({});
});

afterEach(cleanup);

describe("BonusBadge", () => {
  it("keeps the redeem entry point visible while disconnected and still delegates fetching to the hook", () => {
    renderBadge();

    const link = screen.getByRole("link", { name: "Redeem" });
    expect(link.getAttribute("href")).toBe("/bonus/redeem");
    expect(link.getAttribute("data-status")).toBe("redeem");
    expect(link.querySelector("button")).toBeNull();
    expect(mUseBonusStatus).toHaveBeenCalledTimes(1);
  });

  it("links a connected account without trial funds to redemption", () => {
    mockStatus({ data: { ...ACTIVE_STATUS, has_bonus: false, bonus_account_id: "", status: "" } });

    renderBadge();

    expect(screen.getByRole("link", { name: "Redeem" }).getAttribute("href")).toBe("/bonus/redeem");
  });

  it("formats the active remaining amount with the shared USDA formatter", () => {
    mockStatus({ data: ACTIVE_STATUS });

    renderBadge();

    const link = screen.getByRole("link", { name: "Trial funds: 1,500.56 USDA" });
    expect(link.getAttribute("href")).toBe("/bonus");
    expect(link.getAttribute("data-status")).toBe("active");
    expect(link.textContent).toContain("1,500.56 USDA");
  });

  it("does not mark the parent bonus destination current from the redeem route", () => {
    mockStatus({ data: ACTIVE_STATUS });

    renderBadgeAt("/bonus/redeem");

    expect(screen.getByRole("link", { name: "Trial funds: 1,500.56 USDA" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks the exact redeem destination current for an account without trial funds", () => {
    mockStatus({ data: { ...ACTIVE_STATUS, has_bonus: false, bonus_account_id: "", status: "" } });

    renderBadgeAt("/bonus/redeem");

    expect(screen.getByRole("link", { name: "Redeem" }).getAttribute("aria-current")).toBe("page");
  });

  it.each([
    ["frozen", "Trial funds frozen"],
    ["expired_pending", "Trial funds expiring"],
    ["recalled", "Trial funds recalled"],
  ] as const)("renders %s as an explicit non-healthy state", (status, label) => {
    mockStatus({ data: { ...ACTIVE_STATUS, status } });

    renderBadge();

    const link = screen.getByRole("link", { name: label });
    expect(link.getAttribute("href")).toBe("/bonus");
    expect(link.getAttribute("data-status")).toBe(status);
    expect(link.getAttribute("data-status")).not.toBe("active");
  });

  it("uses a fixed skeleton with a translated accessible loading label", () => {
    mockStatus({ isLoading: true });

    const { container } = renderBadge();

    const link = screen.getByRole("link", { name: "Loading trial funds" });
    expect(link.getAttribute("data-status")).toBe("loading");
    expect(container.querySelector('[data-bonus-skeleton="true"]')).not.toBeNull();

    const source = readFileSync("src/modules/lighter/features/bonus/components/BonusBadge.module.scss", "utf8");
    expect(source).toMatch(/\.loading\s*\{[^}]*width:\s*136px/);
    expect(source).toMatch(/\.loading\s*\{[^}]*height:\s*32px/);
    expect(source).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("fails safe without exposing a raw status error", () => {
    mockStatus({
      error: new BonusApiError("upstream secret: db-primary", {
        status: 503,
        code: "bonus_request_failed",
        data: {},
      }),
    });

    renderBadge();

    const link = screen.getByRole("link", { name: "Trial funds unavailable" });
    expect(link.getAttribute("href")).toBe("/bonus");
    expect(link.getAttribute("data-status")).toBe("unavailable");
    expect(screen.queryByText(/db-primary/)).toBeNull();
  });

  it("keeps fresh or stale bonus data visible when background state is also loading or errored", () => {
    mockStatus({
      data: ACTIVE_STATUS,
      isLoading: true,
      error: new BonusApiError("refresh failed", {
        status: 503,
        code: "bonus_request_failed",
        data: {},
      }),
    });

    renderBadge();

    expect(screen.getByRole("link", { name: "Trial funds: 1,500.56 USDA" })).not.toBeNull();
  });

  it("uses resilient compact styles without low-contrast badge copy", () => {
    const badgeStyles = readFileSync("src/modules/lighter/features/bonus/components/BonusBadge.module.scss", "utf8");
    const navStyles = readFileSync("src/modules/lighter/components/TopNav/TopNav.module.scss", "utf8");

    expect(badgeStyles).not.toContain("--ltr-text-muted");
    expect(badgeStyles).toMatch(/\.fullAmount\s*\{[^}]*overflow:\s*hidden/);
    expect(badgeStyles).toMatch(/@media\s*\(max-width:\s*640px\)/);
    expect(navStyles).toMatch(/\.connect\s*\{[^}]*flex:\s*0\s+0\s+auto/);
  });
});

describe("TopNav bonus placement", () => {
  it("omits the redeem badge while keeping extras, language, and wallet controls", () => {
    mockStatus({});

    render(<TopNav rightExtra={<span data-testid="right-extra">extra</span>} />, { wrapper: TestShell });

    const extra = screen.getByTestId("right-extra");
    const language = screen.getByRole("button", { name: "language" });
    const wallet = screen.getByRole("button", { name: "Connect wallet" });
    const right = extra.parentElement;

    expect(screen.queryByRole("link", { name: "Redeem" })).toBeNull();
    expect(right).toBe(language.parentElement?.parentElement);
    expect(right).toBe(wallet.parentElement);
    expect([...right!.children]).toEqual([extra, language.parentElement, wallet]);
  });
});

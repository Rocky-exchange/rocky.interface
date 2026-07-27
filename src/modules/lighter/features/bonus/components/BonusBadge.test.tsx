import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory } from "history";
import { readFileSync } from "node:fs";
import type { PropsWithChildren } from "react";
import { MemoryRouter, Router } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TopNav } from "@/modules/lighter/components/TopNav/TopNav";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { BonusBadge } from "./BonusBadge";
import { redeemBonusCode } from "../api/bonus.api";
import {
  BonusApiError,
  type BonusBalanceInfoResponse,
  type BonusHistoryRow,
  type BonusRedeemResponse,
  type BonusStatusResponse,
} from "../api/bonus.types";
import { notifyBonusDataChanged, useBonusBalance, useBonusHistory, useBonusStatus } from "../api/useBonus";

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
  notifyBonusDataChanged: vi.fn(),
  useBonusBalance: vi.fn(),
  useBonusHistory: vi.fn(),
  useBonusStatus: vi.fn(),
}));

vi.mock("../api/bonus.api", () => ({
  redeemBonusCode: vi.fn(),
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

const MODAL_STATUS: BonusStatusResponse = {
  ...ACTIVE_STATUS,
  bonus_initial: "212.3456",
  bonus_balance: "200",
  bonus_locked_in_margin: "0",
  bonus_consumed_total: "12.3456",
  max_leverage: 10,
  expires_at: "2099-07-28T00:00:00Z",
};

const MODAL_BALANCE: BonusBalanceInfoResponse = {
  total_available: "201",
  available: "201",
  locked: "0",
  principal_free: "1",
  principal_locked: "0",
  bonus_free: "200",
  bonus_locked: "0",
  effective_withdrawable: "1",
  status: "active",
};

const MODAL_HISTORY: BonusHistoryRow[] = [
  {
    id: "history-1",
    event_type: "trading_fee",
    total_cost: "13.5801",
    bonus_share: "12.3456",
    principal_share: "1.2345",
    attribution_rule: "50_50",
    source_trade_id: "019f8496-6c57-71d1-bb35-10b1d4bc0bd1",
    source_funding_id: "",
    occurred_at: "2026-07-27T17:40:18Z",
  },
];

const REDEEM_RESPONSE: BonusRedeemResponse = {
  bonus_account_id: "bonus-1",
  amount: "200",
  granted_at: "2026-07-27T00:00:00Z",
  expires_at: "2099-07-28T00:00:00Z",
  replayed: false,
};

const mUseBonusStatus = vi.mocked(useBonusStatus);
const mUseBonusBalance = vi.mocked(useBonusBalance);
const mUseBonusHistory = vi.mocked(useBonusHistory);
const mUseCantonSession = vi.mocked(useCantonSession);
const mRedeemBonusCode = vi.mocked(redeemBonusCode);
const mNotifyBonusDataChanged = vi.mocked(notifyBonusDataChanged);

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
    locked: false,
    token: "",
    party: "",
    username: "",
    avatar: "",
    provider: "",
  });
  mockStatus({});
  mUseBonusBalance.mockReturnValue({
    data: MODAL_BALANCE,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useBonusBalance>);
  mUseBonusHistory.mockReturnValue({
    rows: MODAL_HISTORY,
    error: undefined,
    isLoading: false,
    hasMore: false,
    loadMore: vi.fn(),
    refresh: vi.fn(),
  });
  mRedeemBonusCode.mockResolvedValue(REDEEM_RESPONSE);
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
  it("opens the bound trial-funds overview directly from the header button", () => {
    mockStatus({ data: MODAL_STATUS });
    mUseCantonSession.mockReturnValue({
      connected: true,
      locked: false,
      token: "session-token",
      party: "party::test",
      username: "test",
      avatar: "",
      provider: "rocky",
    });

    render(<TopNav />, { wrapper: TestShell });

    fireEvent.click(screen.getByRole("button", { name: "Trial funds: 200 USDA" }));

    expect(screen.getByRole("dialog", { name: "Trial funds overview" })).not.toBeNull();
    expect(screen.queryByRole("textbox", { name: "Invitation code" })).toBeNull();
    expect(screen.getByText("$201.00")).not.toBeNull();
    expect(screen.getByRole("timer", { name: "Bonus expiry countdown" })).not.toBeNull();
    expect(screen.getByText("Principal (withdrawable)")).not.toBeNull();
    expect(screen.getByText("Trial funds (available)")).not.toBeNull();
    expect(screen.getByText("Currently withdrawable: $1.00")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rules" }));
    expect(screen.getByText("Trial funds are valid for seven days and cannot be withdrawn.")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Attribution details" }));
    expect(screen.getByRole("dialog", { name: "Trial funds usage history" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Search event, source, or rule" })).not.toBeNull();
    expect(screen.getByText("Cumulative trial funds attributed")).not.toBeNull();
    expect(screen.getByText("$12.3456")).not.toBeNull();
    expect(screen.getByText("$1.2345")).not.toBeNull();
    expect(screen.getByText("-$13.5801")).not.toBeNull();
    expect(screen.getByRole("table", { name: "Trial funds usage history records" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(screen.getByRole("dialog", { name: "Trial funds overview" })).not.toBeNull();
  });

  it("shows recoverable balance and history request states inside the modal", () => {
    const retryBalance = vi.fn();
    const retryHistory = vi.fn();
    mockStatus({ data: MODAL_STATUS });
    mUseBonusBalance.mockReturnValue({
      data: undefined,
      error: new BonusApiError("balance unavailable", {
        status: 503,
        code: "bonus_request_failed",
        data: {},
      }),
      isLoading: false,
      mutate: retryBalance,
    } as unknown as ReturnType<typeof useBonusBalance>);
    mUseBonusHistory.mockReturnValue({
      rows: [],
      error: new BonusApiError("history unavailable", {
        status: 503,
        code: "bonus_request_failed",
        data: {},
      }),
      isLoading: false,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: retryHistory,
    });
    mUseCantonSession.mockReturnValue({
      connected: true,
      locked: false,
      token: "session-token",
      party: "party::test",
      username: "test",
      avatar: "",
      provider: "rocky",
    });

    render(<TopNav />, { wrapper: TestShell });
    fireEvent.click(screen.getByRole("button", { name: "Trial funds: 200 USDA" }));

    expect(screen.getByRole("alert").textContent).toContain("Unable to load the latest balance.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryBalance).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Attribution details" }));
    expect(screen.getByRole("alert").textContent).toContain("Unable to load attribution history.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryHistory).toHaveBeenCalledTimes(1);
  });

  it("requests the next backend history cursor from the modal pagination", () => {
    const loadMore = vi.fn();
    mockStatus({ data: MODAL_STATUS });
    mUseBonusHistory.mockReturnValue({
      rows: Array.from({ length: 6 }, (_, index) => ({
        ...MODAL_HISTORY[0]!,
        id: `history-${index}`,
      })),
      error: undefined,
      isLoading: false,
      hasMore: true,
      loadMore,
      refresh: vi.fn(),
    });
    mUseCantonSession.mockReturnValue({
      connected: true,
      locked: false,
      token: "session-token",
      party: "party::test",
      username: "test",
      avatar: "",
      provider: "rocky",
    });

    render(<TopNav />, { wrapper: TestShell });
    fireEvent.click(screen.getByRole("button", { name: "Trial funds: 200 USDA" }));
    fireEvent.click(screen.getByRole("button", { name: "Attribution details" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it("redeems an invitation code through the backend before showing the overview", async () => {
    const mutate = vi.fn().mockResolvedValue(MODAL_STATUS);
    mockStatus({
      data: { ...MODAL_STATUS, has_bonus: false, bonus_account_id: "", status: "" },
      mutate,
    });
    mUseCantonSession.mockReturnValue({
      connected: true,
      locked: false,
      token: "session-token",
      party: "party::test",
      username: "test",
      avatar: "",
      provider: "rocky",
    });

    render(<TopNav />, { wrapper: TestShell });

    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    expect(screen.getByRole("dialog", { name: "Bind trial funds invitation code" })).not.toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "Invitation code" }), {
      target: { value: "rocky-live-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bind now" }));

    await waitFor(() => expect(mRedeemBonusCode).toHaveBeenCalledTimes(1));
    expect(mRedeemBonusCode.mock.calls[0]?.[0]).toEqual({
      code: "ROCKY-LIVE-1",
      request_id: expect.stringMatching(/^bonus-redeem-/),
    });
    expect(mNotifyBonusDataChanged).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Trial funds overview" })).not.toBeNull();
  });

  it("shows the redeem badge before extras, language, and wallet controls", () => {
    mockStatus({});

    render(<TopNav rightExtra={<span data-testid="right-extra">extra</span>} />, { wrapper: TestShell });

    const redeem = screen.getByRole("button", { name: "Redeem" });
    const extra = screen.getByTestId("right-extra");
    const language = screen.getByRole("button", { name: "language" });
    const wallet = screen.getByRole("button", { name: "Connect wallet" });
    const right = redeem.parentElement;

    expect(right).toBe(extra.parentElement);
    expect(right).toBe(language.parentElement?.parentElement);
    expect(right).toBe(wallet.parentElement);
    expect([...right!.children]).toEqual([redeem, extra, language.parentElement, wallet]);
  });
});

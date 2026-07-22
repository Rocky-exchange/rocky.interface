import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryHistory, type MemoryHistory } from "history";
import { readFileSync } from "node:fs";
import type { PropsWithChildren, ReactElement } from "react";
import { Router } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { BonusPage } from "./BonusPage";
import { MIN_REDEEM_CODE_LENGTH, RedeemCodePage } from "./RedeemCodePage";
import { redeemBonusCode } from "../api/bonus.api";
import {
  BonusApiError,
  type BonusBalanceInfoResponse,
  type BonusHistoryRow,
  type BonusRedeemResponse,
  type BonusStatusResponse,
} from "../api/bonus.types";
import { notifyBonusDataChanged, useBonusBalance, useBonusHistory, useBonusStatus } from "../api/useBonus";
import { BonusBalanceCard, formatUsdcx } from "../components/BonusBalanceCard";
import { BonusCountdown } from "../components/BonusCountdown";
import { BonusHistoryList } from "../components/BonusHistoryList";

vi.mock("@/modules/lighter/components/TopNav/TopNav", () => ({
  TopNav: () => <nav aria-label="Primary navigation">Rocky</nav>,
}));

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));

vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: vi.fn(),
}));

vi.mock("../api/bonus.api", async () => {
  const actual = await vi.importActual<typeof import("../api/bonus.api")>("../api/bonus.api");
  return { ...actual, redeemBonusCode: vi.fn() };
});

vi.mock("../api/useBonus", () => ({
  notifyBonusDataChanged: vi.fn(),
  useBonusStatus: vi.fn(),
  useBonusBalance: vi.fn(),
  useBonusHistory: vi.fn(),
}));

const STATUS: BonusStatusResponse = {
  has_bonus: true,
  bonus_account_id: "bonus-1",
  status: "active",
  grant_tier: "COMMUNITY",
  bonus_initial: "100",
  bonus_balance: "87.5",
  bonus_locked_in_margin: "17.25",
  bonus_consumed_total: "12.5",
  bonus_recalled_total: "0",
  max_leverage: 8,
  granted_at: "2026-07-21T00:00:00Z",
  expires_at: "2026-07-28T00:00:00Z",
};

const BALANCE: BonusBalanceInfoResponse = {
  total_available: "150.5",
  available: "133.25",
  locked: "17.25",
  principal_free: "63",
  principal_locked: "0.25",
  bonus_free: "70.25",
  bonus_locked: "17.25",
  effective_withdrawable: "63",
  status: "active",
};

const HISTORY_ROW: BonusHistoryRow = {
  id: "history-1",
  event_type: "trade_fee",
  total_cost: "4",
  bonus_share: "2",
  principal_share: "2",
  attribution_rule: "50_50",
  source_trade_id: "trade-1",
  source_funding_id: "",
  occurred_at: "2026-07-22T08:30:00Z",
};
const NO_HISTORY_ROWS: BonusHistoryRow[] = [];
const HISTORY_ROWS = [HISTORY_ROW];
const HISTORY_CASES = [
  ["trade_fee", "Trading fee"],
  ["trading_fee", "Trading fee"],
  ["realized_pnl", "Realized PnL"],
  ["trade_loss", "Realized loss"],
  ["trade_pnl_gain", "Realized profit"],
  ["funding", "Funding"],
  ["funding_paid", "Funding paid"],
  ["funding_received", "Funding received"],
  ["withdrawal_recall", "Withdrawal recall"],
] as const;
const HISTORY_ROWS_BY_EVENT = new Map(
  HISTORY_CASES.map(([eventType]) => [eventType, [{ ...HISTORY_ROW, event_type: eventType }]])
);

const REDEEMED: BonusRedeemResponse = {
  bonus_account_id: "bonus-1",
  amount: "100",
  granted_at: "2026-07-22T00:00:00Z",
  expires_at: "2026-07-29T00:00:00Z",
  replayed: false,
};

const mOpenCantonConnect = vi.mocked(openCantonConnect);
const mUseCantonSession = vi.mocked(useCantonSession);
const mUseBonusStatus = vi.mocked(useBonusStatus);
const mUseBonusBalance = vi.mocked(useBonusBalance);
const mUseBonusHistory = vi.mocked(useBonusHistory);
const mRedeemBonusCode = vi.mocked(redeemBonusCode);
const mNotifyBonusDataChanged = vi.mocked(notifyBonusDataChanged);

i18n.load("en", {});
i18n.activate("en");

function TestI18n({ children }: PropsWithChildren) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

function renderI18n(ui: ReactElement) {
  return render(ui, { wrapper: TestI18n });
}

function mockConnectedSession() {
  mUseCantonSession.mockReturnValue({
    connected: true,
    token: "session-1",
    party: "party-a",
    username: "alice",
    avatar: "",
    provider: "rocky",
  });
}

function mockBonusHooks({
  status = STATUS,
  balance = BALANCE,
  rows = [HISTORY_ROW],
  hasMore = true,
}: {
  status?: BonusStatusResponse;
  balance?: BonusBalanceInfoResponse;
  rows?: BonusHistoryRow[];
  hasMore?: boolean;
} = {}) {
  mUseBonusStatus.mockReturnValue({ data: status, isLoading: false } as ReturnType<typeof useBonusStatus>);
  mUseBonusBalance.mockReturnValue({ data: balance, isLoading: false } as ReturnType<typeof useBonusBalance>);
  mUseBonusHistory.mockReturnValue({
    rows,
    error: undefined,
    isLoading: false,
    hasMore,
    loadMore: vi.fn(),
    refresh: vi.fn(),
  });
}

function renderAt(ui: ReactElement, path: string): { history: MemoryHistory; unmount(): void } {
  const history = createMemoryHistory({ initialEntries: [path] });
  const rendered = render(
    <I18nProvider i18n={i18n}>
      <Router history={history}>{ui}</Router>
    </I18nProvider>
  );
  return { history, unmount: rendered.unmount };
}

function getCodeInput(): HTMLInputElement {
  return screen.getByLabelText("Redemption code") as HTMLInputElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockConnectedSession();
  mockBonusHooks();
  mRedeemBonusCode.mockResolvedValue(REDEEMED);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.classList.remove("lighter-active");
});

describe("BonusPage", () => {
  it("shows a Canton connect action while disconnected without inventing a zero USDCx balance", () => {
    mUseCantonSession.mockReturnValue({
      connected: false,
      token: "",
      party: "",
      username: "",
      avatar: "",
      provider: "",
    });
    mockBonusHooks({
      status: { ...STATUS, bonus_balance: "999" },
      balance: { ...BALANCE, total_available: "999" },
    });

    renderAt(<BonusPage />, "/bonus");

    const connect = screen.getByRole("button", { name: "Connect wallet" });
    expect(screen.queryByText(/999/)).toBeNull();
    expect(screen.queryByText("0 USDCx")).toBeNull();
    expect(mUseBonusBalance).not.toHaveBeenCalled();
    expect(mUseBonusHistory).not.toHaveBeenCalled();
    fireEvent.click(connect);
    expect(mOpenCantonConnect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["loading", { data: undefined, isLoading: true }],
    [
      "error",
      {
        data: undefined,
        isLoading: false,
        error: new BonusApiError("Bonus status is temporarily unavailable", {
          status: 503,
          code: "bonus_unavailable",
          data: {},
        }),
      },
    ],
  ] as const)("does not mount balance or history polling while status is %s", (_label, response) => {
    mUseBonusStatus.mockReturnValue(response as ReturnType<typeof useBonusStatus>);

    renderAt(<BonusPage />, "/bonus");

    expect(mUseBonusBalance).not.toHaveBeenCalled();
    expect(mUseBonusHistory).not.toHaveBeenCalled();
  });

  it("links users without a bonus to the Rocky redeem route", () => {
    mockBonusHooks({
      status: { ...STATUS, has_bonus: false, bonus_account_id: "", status: "" },
      balance: { ...BALANCE, status: "no_bonus" },
      rows: [],
      hasMore: false,
    });

    renderAt(<BonusPage />, "/bonus");

    expect(screen.getByRole("link", { name: "Redeem trial funds" }).getAttribute("href")).toBe("/bonus/redeem");
    expect(mUseBonusBalance).not.toHaveBeenCalled();
    expect(mUseBonusHistory).not.toHaveBeenCalled();
  });

  it("renders the active USDCx lifecycle, risk rules, API leverage, and attribution ledger", () => {
    renderAt(<BonusPage />, "/bonus");

    expect(screen.getByText("87.5 USDCx")).not.toBeNull();
    expect(screen.getByText("70.25 USDCx")).not.toBeNull();
    expect(screen.getByText("17.25 USDCx")).not.toBeNull();
    expect(screen.getByText("63 USDCx")).not.toBeNull();
    expect(screen.getByLabelText("Bonus expiry countdown")).not.toBeNull();
    expect(screen.getByText(/50%.*trial funds.*50%.*principal/i)).not.toBeNull();
    expect(screen.getByText(/capped by remaining trial funds/i)).not.toBeNull();
    expect(screen.getByText(/profits.*principal/i)).not.toBeNull();
    expect(screen.getByText(/trial funds.*non-withdrawable/i)).not.toBeNull();
    expect(screen.getByText(/Maximum leverage/i).textContent).toContain("8x");
    expect(screen.getByText(/60% net-direction/i)).not.toBeNull();
    expect(screen.getByRole("region", { name: "Attribution history" })).not.toBeNull();
    expect(screen.getByText("Trading fee")).not.toBeNull();
    expect(mUseBonusBalance).toHaveBeenCalledTimes(1);
    expect(mUseBonusHistory).toHaveBeenCalledTimes(1);
    expect(mUseBonusHistory).toHaveBeenCalledWith(20);
  });

  it.each([
    ["frozen", "Trial funds are frozen. New opening orders are not tradable."],
    ["expired_pending", "Trial funds have expired. New opening orders are not tradable."],
  ] as const)("renders an explicit non-tradable notice for %s accounts", (status, notice) => {
    mockBonusHooks({
      status: { ...STATUS, status },
      balance: { ...BALANCE, status },
    });

    renderAt(<BonusPage />, "/bonus");

    expect(screen.getByRole("alert").textContent).toContain(notice);
  });
});

describe("Bonus visual components", () => {
  it("formats all balance values through one safe USDCx formatter and renders exactly four rows", () => {
    const { container } = renderI18n(<BonusBalanceCard balance={BALANCE} />);

    expect(formatUsdcx("1500.555")).toBe("1,500.56 USDCx");
    expect(formatUsdcx("not-a-number")).toBe("0 USDCx");
    expect(within(screen.getByRole("list", { name: "USDCx account breakdown" })).getAllByRole("listitem")).toHaveLength(
      4
    );
    expect(container.textContent).toContain("Total platform balance");
    expect(container.textContent).toContain("Available trial funds");
    expect(container.textContent).toContain("Trial funds in margin");
    expect(container.textContent).toContain("Effective withdrawable balance");
  });

  it("ticks days, hours, minutes, and seconds once per second and clears its timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T00:00:00Z"));
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderI18n(<BonusCountdown expiresAt="2026-07-23T02:03:04Z" />);

    const timer = screen.getByRole("timer", { name: "Bonus expiry countdown" });
    expect(timer.hasAttribute("aria-label")).toBe(false);
    expect(timer.getAttribute("aria-labelledby")).not.toBeNull();
    expect(within(timer).getByRole("group", { name: "01 Days" })).not.toBeNull();
    expect(within(timer).getByRole("group", { name: "02 Hours" })).not.toBeNull();
    expect(within(timer).getByRole("group", { name: "03 Minutes" })).not.toBeNull();
    expect(within(timer).getByRole("group", { name: "04 Seconds" })).not.toBeNull();
    expect([...timer.querySelectorAll("[data-countdown-unit]")].every((unit) => !unit.hasAttribute("aria-label"))).toBe(
      true
    );

    act(() => vi.advanceTimersByTime(1_000));
    expect(within(timer).getByRole("group", { name: "03 Seconds" })).not.toBeNull();
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("clamps expired and invalid expiry values safely to zero", () => {
    const { rerender } = renderI18n(<BonusCountdown expiresAt="2020-01-01T00:00:00Z" />);
    expect(screen.getByRole("group", { name: "00 Days" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "00 Seconds" })).not.toBeNull();

    rerender(<BonusCountdown expiresAt="not-a-date" />);
    expect(screen.getByRole("group", { name: "00 Days" })).not.toBeNull();
    expect(screen.getByRole("group", { name: "00 Seconds" })).not.toBeNull();
  });

  it.each(HISTORY_CASES)("maps %s history rows to %s", (eventType, label) => {
    const rows = HISTORY_ROWS_BY_EVENT.get(eventType) ?? NO_HISTORY_ROWS;
    renderI18n(<BonusHistoryList rows={rows} error={undefined} isLoading={false} hasMore={false} loadMore={vi.fn()} />);

    expect(screen.getByText(label)).not.toBeNull();
    expect(screen.getAllByText("2 USDCx")).toHaveLength(2);
  });

  it("exposes accessible loading, error, empty, and paginated history states", () => {
    const loadMore = vi.fn();
    const { rerender } = renderI18n(
      <BonusHistoryList rows={NO_HISTORY_ROWS} isLoading={true} hasMore={false} loadMore={loadMore} />
    );
    expect(screen.getByRole("status").textContent).toContain("Loading attribution history");

    rerender(
      <BonusHistoryList
        rows={NO_HISTORY_ROWS}
        error={
          new BonusApiError("History is temporarily unavailable", {
            status: 503,
            code: "bonus_unavailable",
            data: {},
          })
        }
        isLoading={false}
        hasMore={false}
        loadMore={loadMore}
      />
    );
    expect(screen.getByRole("alert").textContent).toContain("History is temporarily unavailable");

    rerender(<BonusHistoryList rows={NO_HISTORY_ROWS} isLoading={false} hasMore={false} loadMore={loadMore} />);
    expect(screen.getByText("No attribution events yet.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();

    rerender(<BonusHistoryList rows={HISTORY_ROWS} isLoading={false} hasMore={true} loadMore={loadMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });
});

describe("RedeemCodePage", () => {
  it("normalizes to uppercase [A-Z0-9-] and caps input at 32 characters", () => {
    renderAt(<RedeemCodePage />, "/bonus/redeem");
    const input = getCodeInput();
    const raw = "a b_?c--123/xyz" + "q".repeat(40);

    fireEvent.change(input, { target: { value: raw } });

    expect(input.value).toBe(
      raw
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "")
        .slice(0, 32)
    );
    expect(input.value).toHaveLength(32);
  });

  it("does not call the API for an empty or short code and reports the four-character minimum", () => {
    renderAt(<RedeemCodePage />, "/bonus/redeem");
    const form = screen.getByRole("form", { name: "Apply bonus code" });

    fireEvent.submit(form);
    expect(mRedeemBonusCode).not.toHaveBeenCalled();

    fireEvent.change(getCodeInput(), { target: { value: "abc" } });
    fireEvent.submit(form);

    expect(MIN_REDEEM_CODE_LENGTH).toBe(4);
    expect(mRedeemBonusCode).not.toHaveBeenCalled();
    expect(screen.getByText("Enter at least 4 characters.").closest('[aria-live="polite"]')).not.toBeNull();
    expect(getCodeInput().value).toBe("ABC");
    expect((screen.getByRole("button", { name: "Redeem code" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a safe API error in the live region and retains the normalized code", async () => {
    mRedeemBonusCode.mockRejectedValue(
      new BonusApiError("This code cannot be redeemed", {
        status: 409,
        code: "code_not_redeemable",
        data: {},
      })
    );
    renderAt(<RedeemCodePage />, "/bonus/redeem");
    fireEvent.change(getCodeInput(), { target: { value: "rocky-2026" } });

    fireEvent.click(screen.getByRole("button", { name: "Redeem code" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This code cannot be redeemed"));
    expect(screen.getByRole("alert").closest('[aria-live="polite"]')).not.toBeNull();
    expect(getCodeInput().value).toBe("ROCKY-2026");
  });

  it("uses a new prefixed request id per attempt, refreshes bonus data, and replaces the route on success", async () => {
    mRedeemBonusCode
      .mockRejectedValueOnce(new BonusApiError("Try the code again", { status: 409, code: "retry", data: {} }))
      .mockResolvedValueOnce(REDEEMED);
    const { history } = renderAt(<RedeemCodePage />, "/bonus/redeem");
    fireEvent.change(getCodeInput(), { target: { value: "rocky-2026" } });

    fireEvent.click(screen.getByRole("button", { name: "Redeem code" }));
    await waitFor(() => expect(mRedeemBonusCode).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Redeem code" }));

    await waitFor(() => expect(history.location.pathname).toBe("/bonus"));
    expect(mRedeemBonusCode).toHaveBeenCalledTimes(2);
    expect(mRedeemBonusCode.mock.calls[0][0].code).toBe("ROCKY-2026");
    expect(mRedeemBonusCode.mock.calls[0][0].request_id).toMatch(/^bonus-redeem-/);
    expect(mRedeemBonusCode.mock.calls[1][0].request_id).toMatch(/^bonus-redeem-/);
    expect(mRedeemBonusCode.mock.calls[0][0].request_id).not.toBe(mRedeemBonusCode.mock.calls[1][0].request_id);
    expect(mNotifyBonusDataChanged).toHaveBeenCalledTimes(1);
    expect(history.action).toBe("REPLACE");
  });

  it("disables pending submission and prevents a double redeem", async () => {
    let resolveRedeem: ((value: BonusRedeemResponse) => void) | undefined;
    mRedeemBonusCode.mockImplementation(() => new Promise<BonusRedeemResponse>((resolve) => (resolveRedeem = resolve)));
    renderAt(<RedeemCodePage />, "/bonus/redeem");
    fireEvent.change(getCodeInput(), { target: { value: "ROCKY-2026" } });
    const submit = screen.getByRole("button", { name: "Redeem code" }) as HTMLButtonElement;

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(submit.disabled).toBe(true);
    expect(mRedeemBonusCode).toHaveBeenCalledTimes(1);

    await act(async () => resolveRedeem?.(REDEEMED));
  });
});

describe("390px DOM and routing contract", () => {
  it("keeps every primary action on the same bonus and redeem routes without asserting computed CSS", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.dispatchEvent(new Event("resize"));
    mockBonusHooks({ hasMore: true });

    const statusPage = renderAt(<BonusPage />, "/bonus");
    expect(statusPage.history.location.pathname).toBe("/bonus");
    expect(screen.getByRole("link", { name: "Redeem another code" }).hidden).toBe(false);
    expect(screen.getByRole("button", { name: "Load more" }).hidden).toBe(false);
    statusPage.unmount();

    const redeemPage = renderAt(<RedeemCodePage />, "/bonus/redeem");
    expect(redeemPage.history.location.pathname).toBe("/bonus/redeem");
    expect(screen.getByRole("link", { name: "Back to bonus" }).hidden).toBe(false);
    expect(screen.getByRole("button", { name: "Redeem code" }).hidden).toBe(false);
  });
});

describe("responsive SCSS contract", () => {
  it.each([
    ["status", "./BonusPage.module.scss", "summaryGrid", "primaryAction", "heroBalance"],
    ["redeem", "./RedeemCodePage.module.scss", "redeemGrid", "submit", "policyValue"],
  ] as const)(
    "locks the %s page mobile stack, padding, tap target, action width, and long-value wrapping",
    (_page, sourcePath, gridClass, actionClass, longValueClass) => {
      const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
      const mobile = extractMaxWidthBlock(source, 768);

      expect(mobile).toMatch(/\.main\s*\{[^}]*padding:\s*\d+px\s+16px(?:\s+\d+px)?\s*;/);
      expect(mobile).toMatch(new RegExp(`\\.${gridClass}(?:\\s*,[^\\{]+)?\\s*\\{[^}]*grid-template-columns:\\s*1fr`));
      expect(mobile).toMatch(new RegExp(`\\.${actionClass}(?:\\s*,[^\\{]+)?\\s*\\{[^}]*width:\\s*100%`));
      expect(source).toMatch(
        new RegExp(`\\.${actionClass}(?:\\s*,[^\\{]+)?\\s*\\{[^}]*min-height:\\s*(?:4[4-9]|[5-9]\\d)px`)
      );
      expect(source).toMatch(
        new RegExp(`\\.${longValueClass}\\s*\\{[^}]*(?:overflow-wrap|word-break):\\s*(?:anywhere|break-word)`)
      );
    }
  );
});

function extractMaxWidthBlock(source: string, width: number): string {
  const mediaStart = source.search(new RegExp(`@media\\s*\\(max-width:\\s*${width}px\\)`));
  if (mediaStart < 0) return "";

  const blockStart = source.indexOf("{", mediaStart);
  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(blockStart + 1, index);
  }
  return "";
}

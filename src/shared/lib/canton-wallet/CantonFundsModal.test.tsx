import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CantonFundsModal } from "./CantonFundsModal";

const PARTY_ID = "rockywallet-etouyang::1220a1af0547f0824e223861619bed56442c73797d14be152f5a48e65598d9fa16fa";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  fetchFundingAccountBalance: vi.fn(),
  fetchPlatformAccountBalance: vi.fn(),
  fetchPlatformAccountBalances: vi.fn(),
  fetchSpotTransferHistory: vi.fn(),
  fetchWalletBalanceSnapshot: vi.fn(),
  fetchCantonFundsHistory: vi.fn(),
  submitCantonWalletDeposit: vi.fn(),
  submitPlatformWithdrawal: vi.fn(),
  transferSpotBalance: vi.fn(),
  waitForPlatformDepositCredit: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  connected: true,
  locked: false,
  party: "rockywallet-etouyang::1220a1af0547f0824e223861619bed56442c73797d14be152f5a48e65598d9fa16fa",
  provider: "rocky",
  username: "Etouyang",
  avatar: "",
}));

vi.mock("@/shared/components/TokenIcon/TokenIcon", () => ({
  default: ({ symbol }: { symbol: string }) => <span data-testid={`icon-${symbol}`}>{symbol}</span>,
}));

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    i18n: {
      _: (message: unknown) => {
        const descriptor =
          typeof message === "object" && message !== null ? (message as { id?: string; message?: string }) : undefined;
        return typeof message === "string" ? message : descriptor?.message || descriptor?.id || String(message);
      },
    },
  }),
}));

vi.mock("./balances", () => ({
  emptyWalletBalanceRows: () => [],
  fetchWalletBalanceSnapshot: mocks.fetchWalletBalanceSnapshot,
  getWalletProviderLabel: () => "Rocky Wallet",
}));

vi.mock("./funds", () => ({
  fetchFundingAccountBalance: mocks.fetchFundingAccountBalance,
  fetchPlatformAccountBalance: mocks.fetchPlatformAccountBalance,
  fetchPlatformAccountBalances: mocks.fetchPlatformAccountBalances,
  fetchSpotTransferHistory: mocks.fetchSpotTransferHistory,
  fetchCantonFundsHistory: mocks.fetchCantonFundsHistory,
  submitCantonWalletDeposit: mocks.submitCantonWalletDeposit,
  submitPlatformWithdrawal: mocks.submitPlatformWithdrawal,
  transferSpotBalance: mocks.transferSpotBalance,
  waitForPlatformDepositCredit: mocks.waitForPlatformDepositCredit,
}));

vi.mock("./profile", () => ({
  hydrateOwnProfile: vi.fn(),
  setAvatar: vi.fn(),
  setDisplayName: vi.fn(),
  SetAvatarError: class SetAvatarError extends Error {},
  SetDisplayNameError: class SetDisplayNameError extends Error {},
}));

vi.mock("./useCantonSession", () => ({ useCantonSession: () => sessionMock }));
vi.mock("./useCantonWallet", () => ({ useCantonWallet: () => ({ disconnect: mocks.disconnect }) }));

describe("CantonFundsModal", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    sessionMock.connected = true;
    sessionMock.locked = false;
    mocks.fetchPlatformAccountBalance.mockResolvedValue(100);
    mocks.fetchPlatformAccountBalances.mockResolvedValue({ USDA: 100, CBTC: 2, cETH: 3, CC: 4 });
    mocks.fetchFundingAccountBalance.mockResolvedValue(25);
    mocks.fetchSpotTransferHistory.mockResolvedValue({ transfers: [] });
    mocks.fetchCantonFundsHistory.mockResolvedValue({ deposits: [], withdrawals: [] });
    mocks.fetchWalletBalanceSnapshot.mockResolvedValue({
      provider: "rocky",
      label: "Rocky Wallet",
      party: PARTY_ID,
      status: "ready",
      balances: [
        { symbol: "USDA", amount: "5.6" },
        { symbol: "CBTC", amount: "0.00005459" },
        { symbol: "cETH", amount: "0.0000019" },
        { symbol: "CC", amount: "7" },
      ],
    });
    mocks.submitPlatformWithdrawal.mockResolvedValue({ status: "submitted", withdrawal_id: "withdrawal-1" });
    mocks.transferSpotBalance.mockResolvedValue({
      asset: "USDA",
      direction: "toFunding",
      amount: "5",
      fundingAvailable: "30",
      spotFree: "95",
    });
  });

  it("opens on a real four-asset table and exposes all primary views", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);

    expect(screen.queryByRole("tab", { name: "Assets" })).toBeNull();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Deposit",
      "Withdraw",
      "Transfer",
      "History",
    ]);
    await waitFor(() => expect(mocks.fetchPlatformAccountBalances).toHaveBeenCalledTimes(1));
    for (const asset of ["USDA", "CBTC", "cETH", "CC"]) {
      expect(screen.getAllByText(asset).length).toBeGreaterThan(0);
    }

    for (const name of ["Deposit", "Withdraw", "Transfer"]) {
      const tab = screen.getByRole("tab", { name });
      fireEvent.click(tab);
      expect(tab.getAttribute("aria-selected")).toBe("true");
    }
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("tab", { name: "History" }).getAttribute("aria-selected")).toBe("true");
  });

  it("submits USDA transfers between Spot and Futures accounts", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Transfer" }));

    expect(screen.getByText("Spot Account")).toBeTruthy();
    expect(screen.getByText("Futures Account")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Transfer amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Transfer USDA" }));

    await waitFor(() =>
      expect(mocks.transferSpotBalance).toHaveBeenCalledWith({
        asset: "USDA",
        amount: "5",
        direction: "toFunding",
      })
    );
  });

  it("renders wrapped balances with compact leading-zero notation and market icons", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("4", { selector: "sub" })).toBeTruthy());
    expect(screen.getByText("4", { selector: "sub" }).parentElement?.textContent).toContain("0.045459");
    expect(screen.getByText("5", { selector: "sub" }).parentElement?.textContent).toContain("0.0519");
    expect(screen.getByTestId("icon-btc")).toBeTruthy();
    expect(screen.getByTestId("icon-eth")).toBeTruthy();
  });

  it("shows exchange balances without waiting for the wallet balance request", async () => {
    mocks.fetchWalletBalanceSnapshot.mockReturnValue(new Promise(() => undefined));
    mocks.fetchPlatformAccountBalances.mockResolvedValue({ USDA: 1, CBTC: 0.000031, cETH: 0.0001, CC: 0 });

    render(<CantonFundsModal open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("4", { selector: "sub" }).parentElement?.textContent).toContain("0.0431")
    );
    expect(screen.getAllByLabelText("Refreshing...")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Refresh balances" }).className).not.toContain("refreshButtonLoading");
  });

  it("combines persisted deposits, withdrawals, and account transfers in History", async () => {
    mocks.fetchCantonFundsHistory.mockResolvedValue({
      deposits: [
        {
          deposit_id: "deposit-1",
          asset: "USDC",
          amount_expected: "0.0001",
          status: "credited",
          created_at: "2026-07-22T06:48:09Z",
        },
      ],
      withdrawals: [
        {
          withdrawal_id: "withdrawal-1",
          asset: "USDC",
          amount: "1",
          status: "settled",
          fee_amount: "1",
          fee_wallet_symbol: "USDA",
          requested_at: "2026-07-22T07:00:00Z",
        },
      ],
    });
    mocks.fetchSpotTransferHistory.mockResolvedValue({
      transfers: [
        { eventId: "event-1", asset: "USDA", amount: "3", direction: "toFunding", createdAt: "2026-07-22T07:10:00Z" },
      ],
    });
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));

    await waitFor(() => expect(screen.getByText("Transfer Out")).toBeTruthy());
    expect(screen.getByText("3", { selector: "sub" }).parentElement?.textContent).toContain("+0.031 USDA");
    expect(screen.getByText("-1 USDA")).toBeTruthy();
  });

  it("preserves spot-only withdrawal fees and submission", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Withdraw" }));

    expect(screen.getByText("1 USDA")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Withdraw amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() =>
      expect(mocks.submitPlatformWithdrawal).toHaveBeenCalledWith({
        asset: "USDA",
        amount: "5",
        destinationParty: PARTY_ID,
      })
    );
  });

  it("closes when the Canton session disconnects or locks", () => {
    const onClose = vi.fn();
    const view = render(<CantonFundsModal open onClose={onClose} />);
    sessionMock.locked = true;
    view.rerender(<CantonFundsModal open onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

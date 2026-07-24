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
  fetchWithdrawalFeeQuote: vi.fn(),
  makeWalletWithdrawalIdempotencyKey: vi.fn(),
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
  fetchWithdrawalFeeQuote: mocks.fetchWithdrawalFeeQuote,
  makeWalletWithdrawalIdempotencyKey: mocks.makeWalletWithdrawalIdempotencyKey,
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
    mocks.fetchPlatformAccountBalances.mockResolvedValue({ CUSD: 100, CBTC: 2, cETH: 3, CC: 4 });
    mocks.fetchFundingAccountBalance.mockResolvedValue(25);
    mocks.fetchSpotTransferHistory.mockResolvedValue({ transfers: [] });
    mocks.fetchCantonFundsHistory.mockResolvedValue({ deposits: [], withdrawals: [] });
    mocks.fetchWithdrawalFeeQuote.mockResolvedValue({
      asset: "USDC",
      fee_asset: "USDC",
      fee_wallet_symbol: "CUSD",
      fee_amount: "1",
    });
    mocks.makeWalletWithdrawalIdempotencyKey.mockReturnValue("withdrawal-key-1");
    mocks.fetchWalletBalanceSnapshot.mockResolvedValue({
      provider: "rocky",
      label: "Rocky Wallet",
      party: PARTY_ID,
      status: "ready",
      balances: [
        { symbol: "CUSD", amount: "5.6" },
        { symbol: "CBTC", amount: "0.00005459" },
        { symbol: "cETH", amount: "0.0000019" },
        { symbol: "CC", amount: "7" },
      ],
    });
    mocks.submitPlatformWithdrawal.mockResolvedValue({ status: "submitted", withdrawal_id: "withdrawal-1" });
    mocks.transferSpotBalance.mockResolvedValue({
      asset: "CUSD",
      direction: "toFunding",
      amount: "5",
      fundingAvailable: "30",
      spotFree: "95",
    });
  });

  it("opens on a real four-asset table with all primary actions", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);

    expect(screen.queryByRole("tab", { name: "Assets" })).toBeNull();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Deposit",
      "Withdraw",
      "Transfer",
      "History",
    ]);
    await waitFor(() => expect(mocks.fetchPlatformAccountBalances).toHaveBeenCalledTimes(1));
    for (const asset of ["CUSD", "CBTC", "cETH", "CC"]) {
      expect(screen.getAllByText(asset).length).toBeGreaterThan(0);
    }
  });

  it("filters assets through the custom asset menu", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Asset filter" }));
    expect(screen.getByRole("listbox", { name: "Asset filter" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "CBTC" }));

    expect(screen.queryByRole("listbox", { name: "Asset filter" })).toBeNull();
    expect(screen.getByRole("button", { name: "Asset filter" }).textContent).toContain("CBTC");
    expect(screen.getByTestId("canton-asset-icon-CBTC").tagName).toBe("IMG");
    expect(screen.queryByText("cETH")).toBeNull();
  });

  it.each(["Deposit", "Withdraw"])("uses the shared custom asset menu on %s", (page) => {
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: page }));

    expect(screen.queryByRole("combobox", { name: "Asset" })).toBeNull();
    const assetButton = screen.getByRole("button", { name: "Asset" });
    expect(assetButton.textContent).toContain("CUSD");

    fireEvent.click(assetButton);
    expect(screen.getByRole("listbox", { name: "Asset" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "CBTC" }));

    expect(screen.queryByRole("listbox", { name: "Asset" })).toBeNull();
    expect(assetButton.textContent).toContain("CBTC");
    expect(document.activeElement).toBe(assetButton);
  });

  it("shows a direct disconnect action instead of the profile overflow menu", async () => {
    const onClose = vi.fn();
    render(<CantonFundsModal open onClose={onClose} />);

    expect(screen.queryByLabelText("More profile actions")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens operation pages inside the existing modal and returns to Assets", () => {
    const onClose = vi.fn();
    render(<CantonFundsModal open onClose={onClose} />);

    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("textbox", { name: "Search asset" })).toBeTruthy();
    expect(screen.getByTestId("canton-asset-icon-CBTC")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Deposit" }));

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByRole("heading", { name: "Deposit", level: 2 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit display name" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Withdraw" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search asset" })).toBeNull();
    expect(screen.queryByTestId("canton-asset-icon-CBTC")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to assets" }));
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByRole("button", { name: "Edit display name" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Deposit" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Search asset" })).toBeTruthy();
    expect(screen.getByTestId("canton-asset-icon-CBTC")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(["Deposit", "Withdraw", "Transfer", "History"])(
    "moves focus into %s and restores it to the originating action",
    (page) => {
      render(<CantonFundsModal open onClose={vi.fn()} />);

      const action = screen.getByRole("tab", { name: page });
      action.focus();
      expect(document.activeElement).toBe(action);

      fireEvent.click(action);
      const backButton = screen.getByRole("button", { name: "Back to assets" });
      expect(document.activeElement).toBe(backButton);

      fireEvent.click(backButton);
      expect(document.activeElement).toBe(screen.getByRole("tab", { name: page }));
    }
  );

  it("restores focus to the asset row that opened Deposit", () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    const assetRow = screen.getByTestId("canton-asset-icon-CBTC").closest("button");
    expect(assetRow).toBeTruthy();
    assetRow?.focus();
    expect(document.activeElement).toBe(assetRow);

    fireEvent.click(assetRow as HTMLButtonElement);
    expect(screen.getByRole("dialog")).toBe(dialog);
    const backButton = screen.getByRole("button", { name: "Back to assets" });
    expect(document.activeElement).toBe(backButton);

    fireEvent.click(backButton);
    const restoredAssetRow = screen.getByTestId("canton-asset-icon-CBTC").closest("button");
    expect(document.activeElement).toBe(restoredAssetRow);
  });

  it("uses a title id owned by each modal instance", () => {
    render(
      <>
        <CantonFundsModal open onClose={vi.fn()} />
        <CantonFundsModal open onClose={vi.fn()} />
      </>
    );

    const dialogs = screen.getAllByRole("dialog");
    const titleIds = dialogs.map((dialog) => dialog.getAttribute("aria-labelledby"));

    expect(titleIds[0]).toBeTruthy();
    expect(titleIds[1]).toBeTruthy();
    expect(titleIds[0]).not.toBe(titleIds[1]);
    dialogs.forEach((dialog, index) => {
      const title = document.getElementById(titleIds[index] || "");
      expect(title).toBeTruthy();
      expect(dialog.contains(title)).toBe(true);
    });
  });

  it.each(["Deposit", "Withdraw", "Transfer", "History"])(
    "renders a shared %s page header whose close action exits the modal",
    (page) => {
      const onClose = vi.fn();
      render(<CantonFundsModal open onClose={onClose} />);

      fireEvent.click(screen.getByRole("tab", { name: page }));

      expect(screen.getByRole("heading", { name: page, level: 2 })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Edit display name" })).toBeNull();
      expect(screen.queryByRole("tablist", { name: "Wallet funds" })).toBeNull();
      expect(screen.getByRole("button", { name: "Back to assets" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Close wallet dashboard" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  );

  it("submits CUSD transfers between Spot and Futures accounts", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Transfer" }));

    expect(screen.getByText("Spot Account")).toBeTruthy();
    expect(screen.getByText("Futures Account")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Transfer amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Transfer CUSD" }));

    await waitFor(() =>
      expect(mocks.transferSpotBalance).toHaveBeenCalledWith({
        asset: "CUSD",
        amount: "5",
        direction: "toFunding",
      })
    );
  });

  it("renders wrapped balances with compact leading-zero notation and extension asset icons", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("4", { selector: "sub" })).toBeTruthy());
    expect(screen.getByText("4", { selector: "sub" }).parentElement?.textContent).toContain("0.045459");
    expect(screen.getByText("5", { selector: "sub" }).parentElement?.textContent).toContain("0.0519");
    for (const asset of ["CUSD", "CBTC", "cETH", "CC"]) {
      const icon = screen.getByTestId(`canton-asset-icon-${asset}`);
      expect(icon.tagName).toBe("IMG");
      expect(icon.getAttribute("src")).toBeTruthy();
    }
  });

  it("shows exchange balances without waiting for the wallet balance request", async () => {
    mocks.fetchWalletBalanceSnapshot.mockReturnValue(new Promise(() => undefined));
    mocks.fetchPlatformAccountBalances.mockResolvedValue({ CUSD: 1, CBTC: 0.000031, cETH: 0.0001, CC: 0 });

    render(<CantonFundsModal open onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("4", { selector: "sub" }).parentElement?.textContent).toContain("0.0431")
    );
    expect(screen.getAllByLabelText("Refreshing...")).toHaveLength(4);
    const refreshButton = screen.getByRole("button", { name: "Refresh balances" });
    expect(refreshButton.hasAttribute("disabled")).toBe(false);
    expect(refreshButton.getAttribute("aria-busy")).toBe("true");
    expect(refreshButton.className).not.toContain("refreshButtonLoading");
  });

  it("combines persisted deposits, withdrawals, and account transfers in History", async () => {
    mocks.fetchCantonFundsHistory.mockResolvedValue({
      deposits: [
        {
          deposit_id: "deposit-1",
          asset: "CBTC",
          amount_expected: "0.00003",
          status: "credited",
          created_at: "2026-07-22T06:48:09Z",
        },
      ],
      withdrawals: [
        {
          withdrawal_id: "withdrawal-1",
          asset: "CBTC",
          amount: "0.000016",
          status: "settled",
          fee_amount: "1",
          fee_wallet_symbol: "CUSD",
          requested_at: "2026-07-22T07:00:00Z",
        },
      ],
    });
    mocks.fetchSpotTransferHistory.mockResolvedValue({
      transfers: [
        { eventId: "event-1", asset: "CUSD", amount: "3", direction: "toFunding", createdAt: "2026-07-22T07:10:00Z" },
      ],
    });
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));

    await waitFor(() => expect(screen.getByText("Transfer Out")).toBeTruthy());
    expect(screen.getByLabelText("+0.00003 CBTC").textContent).toBe("+0.043 CBTC");
    expect(screen.getByLabelText("-0.000016 CBTC").textContent).toBe("-0.0416 CBTC");
  });

  it("uses semantic colors for failed and completed history statuses", async () => {
    mocks.fetchCantonFundsHistory.mockResolvedValue({
      deposits: [],
      withdrawals: [
        {
          withdrawal_id: "withdrawal-failed",
          asset: "CUSD",
          amount: "5",
          status: "failed",
          fee_amount: "1",
          fee_wallet_symbol: "CUSD",
          requested_at: "2026-07-23T05:38:43Z",
        },
        {
          withdrawal_id: "withdrawal-completed",
          asset: "CUSD",
          amount: "2",
          status: "settled",
          fee_amount: "1",
          fee_wallet_symbol: "CUSD",
          requested_at: "2026-07-23T05:39:55Z",
        },
      ],
    });

    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "History" }));

    const failed = await screen.findByText("Failed");
    const completed = await screen.findByText("Completed");
    expect(failed.className).toContain("historyStatusFailed");
    expect(completed.className).toContain("historyStatusCompleted");
  });

  it("preserves spot-only withdrawal fees and submission", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Withdraw" }));

    await waitFor(() =>
      expect(screen.getByText("Estimated Network Fee").nextElementSibling?.textContent).toContain("1.00 CUSD")
    );
    fireEvent.change(screen.getByLabelText("Withdraw amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() =>
      expect(mocks.submitPlatformWithdrawal).toHaveBeenCalledWith({
        asset: "CUSD",
        amount: "5",
        destinationParty: PARTY_ID,
        idempotencyKey: "withdrawal-key-1",
      })
    );
  });

  it("shows the native fee, received amount, and subtracts the fee from Max", async () => {
    mocks.fetchPlatformAccountBalances.mockResolvedValue({ CUSD: 100, CBTC: 0.000031, cETH: 3, CC: 4 });
    mocks.fetchPlatformAccountBalance.mockResolvedValue(0.000031);
    mocks.fetchWithdrawalFeeQuote.mockImplementation(async (asset: string) => ({
      asset,
      fee_asset: asset,
      fee_wallet_symbol: asset,
      fee_amount: asset === "CBTC" ? "0.0000142858" : "1",
    }));
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Withdraw" }));
    fireEvent.click(screen.getByRole("button", { name: "Asset" }));
    fireEvent.click(screen.getByRole("option", { name: "CBTC" }));

    await waitFor(() =>
      expect(screen.getByText("Estimated Network Fee").nextElementSibling?.textContent).toContain("CBTC")
    );
    const feeValue = screen.getByText("Estimated Network Fee").nextElementSibling;
    expect(feeValue?.textContent).toContain("0.041429 CBTC");
    expect(feeValue?.querySelector("sub")?.textContent).toBe("4");
    fireEvent.change(screen.getByLabelText("Withdraw amount"), { target: { value: "0.00001" } });
    const receivedValue = screen.getByText("You will receive").nextElementSibling;
    expect(receivedValue?.textContent).toContain("0.041 CBTC");
    expect(receivedValue?.querySelector("sub")?.textContent).toBe("4");

    fireEvent.click(screen.getByText("Max", { selector: "button" }));
    expect((screen.getByLabelText("Withdraw amount") as HTMLInputElement).value).toBe("0.0000167142");
  });

  it("re-enables Withdraw after a timed-out request and reuses its idempotency key", async () => {
    mocks.submitPlatformWithdrawal.mockRejectedValue(new Error("Withdrawal request timed out. Please retry."));
    render(<CantonFundsModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Withdraw" }));
    await waitFor(() =>
      expect(screen.getByText("Estimated Network Fee").nextElementSibling?.textContent).toContain("1.00 CUSD")
    );
    fireEvent.change(screen.getByLabelText("Withdraw amount"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(screen.getByText("Withdrawal request timed out. Please retry.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Withdraw" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(mocks.submitPlatformWithdrawal).toHaveBeenCalledTimes(2));
    expect(mocks.submitPlatformWithdrawal.mock.calls[0][0].idempotencyKey).toBe("withdrawal-key-1");
    expect(mocks.submitPlatformWithdrawal.mock.calls[1][0].idempotencyKey).toBe("withdrawal-key-1");
  });

  it("closes when the Canton session disconnects or locks", () => {
    const onClose = vi.fn();
    const view = render(<CantonFundsModal open onClose={onClose} />);
    sessionMock.locked = true;
    view.rerender(<CantonFundsModal open onClose={onClose} />);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CantonFundsModal } from "./CantonFundsModal";

const PARTY_ID = "rockywallet-etouyang::1220a1af0547f0824e223861619bed56442c73797d14be152f5a48e65598d9fa16fa";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  fetchPlatformAccountBalance: vi.fn(),
  fetchWalletBalanceSnapshot: vi.fn(),
  fetchCantonFundsHistory: vi.fn(),
  submitCantonWalletDeposit: vi.fn(),
  submitPlatformWithdrawal: vi.fn(),
  waitForPlatformDepositCredit: vi.fn(),
}));

vi.mock("@/shared/components/TokenIcon/TokenIcon", () => ({
  default: ({ symbol }: { symbol: string }) => <span>{symbol}</span>,
}));

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    i18n: {
      _: (message: unknown) => (typeof message === "string" ? message : String(message)),
    },
  }),
}));

vi.mock("./balances", () => ({
  emptyWalletBalanceRows: () => [
    { symbol: "CC", amount: null },
    { symbol: "USDCx", amount: null },
  ],
  fetchWalletBalanceSnapshot: mocks.fetchWalletBalanceSnapshot,
  getWalletProviderLabel: () => "Rocky Wallet",
}));

vi.mock("./funds", () => ({
  fetchPlatformAccountBalance: mocks.fetchPlatformAccountBalance,
  fetchCantonFundsHistory: mocks.fetchCantonFundsHistory,
  submitCantonWalletDeposit: mocks.submitCantonWalletDeposit,
  submitPlatformWithdrawal: mocks.submitPlatformWithdrawal,
  waitForPlatformDepositCredit: mocks.waitForPlatformDepositCredit,
}));

vi.mock("./useCantonSession", () => ({
  useCantonSession: () => ({
    connected: true,
    party: PARTY_ID,
    provider: "rocky",
  }),
}));

vi.mock("./useCantonWallet", () => ({
  useCantonWallet: () => ({
    disconnect: mocks.disconnect,
  }),
}));

describe("CantonFundsModal", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPlatformAccountBalance.mockResolvedValue(100);
    mocks.fetchCantonFundsHistory.mockResolvedValue({ deposits: [], withdrawals: [] });
    mocks.fetchWalletBalanceSnapshot.mockResolvedValue({
      provider: "rocky",
      label: "Rocky Wallet",
      party: PARTY_ID,
      status: "ready",
      balances: [
        { symbol: "CC", amount: "0" },
        { symbol: "USDCx", amount: "5.6" },
      ],
    });
    mocks.submitPlatformWithdrawal.mockImplementation(async () => {
      const index = mocks.submitPlatformWithdrawal.mock.calls.length;
      return {
        status: "submitted",
        withdrawal_id: `withdrawal-${index}`,
      };
    });
  });

  it("shows the fixed network fee in withdrawal history", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);

    openWithdrawForm();
    await submitWithdrawal("0.1", 1);

    expect(screen.getByText("Network Fee")).toBeTruthy();
    expect(screen.getAllByText("1USDCx").length).toBeGreaterThan(1);
  });

  it("loads persisted deposit and withdrawal history when the modal opens", async () => {
    mocks.fetchCantonFundsHistory.mockResolvedValue({
      deposits: [
        {
          deposit_id: "deposit-1",
          asset: "USDC",
          amount_expected: "0.2",
          status: "credited",
          deposit_ref: "rocky:deposit:1",
          chain_tx_id: "deposit-update-1",
          created_at: "2026-07-06T09:00:00Z",
        },
      ],
      withdrawals: [
        {
          withdrawal_id: "withdrawal-server-1",
          asset: "USDC",
          amount: "0.1",
          status: "settled",
          fee_asset: "USDC",
          fee_wallet_symbol: "USDCx",
          fee_amount: "1",
          requested_at: "2026-07-06T09:01:00Z",
        },
      ],
    });

    render(<CantonFundsModal open onClose={vi.fn()} />);

    await waitFor(() => expect(mocks.fetchCantonFundsHistory).toHaveBeenCalledTimes(1));
    expect(screen.getByText("+0.2 USDCx")).toBeTruthy();

    fireEvent.click(screen.getByText("Withdraw History"));

    expect(screen.getByText("-0.1 USDCx")).toBeTruthy();
    expect(screen.getByText("withdrawal-server-1")).toBeTruthy();
  });

  it("expands all withdrawal history rows from the view all control", async () => {
    render(<CantonFundsModal open onClose={vi.fn()} />);

    openWithdrawForm();
    for (let index = 1; index <= 6; index += 1) {
      await submitWithdrawal(`0.${index}`, index);
    }

    expect(screen.queryByText("withdrawal-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /View All Withdrawals/i }));

    expect(screen.getByText("withdrawal-1")).toBeTruthy();
  });
});

function openWithdrawForm() {
  const withdrawAction = screen.getAllByText("Withdraw USDCx to your Wallet")[0].closest("button");
  fireEvent.click(withdrawAction as HTMLButtonElement);
}

async function submitWithdrawal(amount: string, expectedSubmitCount: number) {
  const amountInput = screen.getByPlaceholderText("50");
  fireEvent.change(amountInput, { target: { value: amount } });
  fireEvent.submit(amountInput.closest("form") as HTMLFormElement);
  await waitFor(() => expect(mocks.submitPlatformWithdrawal).toHaveBeenCalledTimes(expectedSubmitCount));
}

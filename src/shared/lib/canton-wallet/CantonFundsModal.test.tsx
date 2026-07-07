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

const i18nMock = vi.hoisted(() => ({
  translations: {} as Record<string, string>,
}));

vi.mock("@/shared/components/TokenIcon/TokenIcon", () => ({
  default: ({ symbol }: { symbol: string }) => <span>{symbol}</span>,
}));

vi.mock("@lingui/react", () => ({
  useLingui: () => ({
    i18n: {
      _: (message: unknown) => {
        const descriptor =
          typeof message === "object" && message !== null
            ? (message as { id?: string; message?: string })
            : undefined;
        const id = typeof message === "string" ? message : descriptor?.id || String(message);
        const defaultMessage = descriptor?.message || id;
        return i18nMock.translations[defaultMessage] || i18nMock.translations[id] || defaultMessage;
      },
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
    i18nMock.translations = {};
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
    expect(screen.getAllByText("1 USDCx").length).toBeGreaterThan(1);
  });

  it("renders wallet dashboard labels through the active locale", async () => {
    i18nMock.translations = {
      Explorer: "瀏覽器",
      Disconnect: "斷開連線",
      "USDCx Balances": "USDCx 餘額",
      "Wallet Balance": "錢包餘額",
      "Exchange Balance": "交易所餘額",
      "On-chain balance": "鏈上餘額",
      "On connected exchange": "已連接交易所餘額",
      Deposit: "存入",
      "Deposit USDCx to Rocky Exchange": "存入 USDCx 至 Rocky Exchange",
      "Transfer funds from the connected wallet to the exchange account.": "從已連接錢包轉入資金至交易所帳戶。",
      Asset: "資產",
      Amount: "金額",
      "Deposit History": "存入歷史",
      "Withdraw History": "提領歷史",
      "Network Fee": "網路費",
      Time: "時間",
      Status: "狀態",
      "Tx Hash": "交易雜湊",
      Completed: "已完成",
      "View All Withdrawals": "查看全部提領",
    };
    mocks.fetchCantonFundsHistory.mockResolvedValue({
      deposits: [],
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

    expect(await screen.findByText("USDCx 餘額")).toBeTruthy();
    expect(screen.getByText("錢包餘額")).toBeTruthy();
    expect(screen.getByText("交易所餘額")).toBeTruthy();
    expect(screen.getByText("存入 USDCx 至 Rocky Exchange")).toBeTruthy();

    fireEvent.click(screen.getByText("提領歷史"));

    expect(screen.getByText("網路費")).toBeTruthy();
    expect(screen.getByText("已完成")).toBeTruthy();
    expect(screen.getByRole("button", { name: /查看全部提領/i })).toBeTruthy();
    expect(screen.queryByText("USDCx Balances")).toBeNull();
    expect(screen.queryByText("Wallet Balance")).toBeNull();
    expect(screen.queryByText("Withdraw History")).toBeNull();
  });

  it("loads persisted deposit and withdrawal history when the modal opens", async () => {
    const depositUpdateId = "12203ce34e8ae4a4be6919419c60cb25ac830fbc1aa4d2c96192030eb0415bb82cb7";
    mocks.fetchCantonFundsHistory.mockResolvedValue({
      deposits: [
        {
          deposit_id: "deposit-1",
          asset: "USDC",
          amount_expected: "0.2",
          status: "credited",
          deposit_ref: "rocky:deposit:1",
          chain_tx_id: "token-standard:1220f8067c8741629dbe93b661497df6cc17bf5f39aa68429a02f7bf6a5a1b6c2dbf:0",
          canton_update_id: depositUpdateId,
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
    expect(document.querySelector(`a[href="https://www.cantonscan.com/update/${depositUpdateId}"]`)).toBeTruthy();

    fireEvent.click(screen.getByText("Withdraw History"));

    expect(screen.getByText("-0.1 USDCx")).toBeTruthy();
    expect(screen.getByText("withdrawal-server-1")).toBeTruthy();
  });

  it("extracts update hashes from chain ids and rejects withdrawal ids as transaction hashes", async () => {
    const depositUpdateId = "1220f8067c8741629dbe93b661497df6cc17bf5f39aa68429a02f7bf6a5a1b6c2dbf";
    mocks.fetchCantonFundsHistory.mockResolvedValue({
      deposits: [
        {
          deposit_id: "deposit-1",
          asset: "USDC",
          amount_expected: "0.2",
          status: "credited",
          chain_tx_id:
            `token-standard:${depositUpdateId}:0`,
          created_at: "2026-07-06T09:00:00Z",
        },
      ],
      withdrawals: [
        {
          withdrawal_id: "withdrawal-server-1",
          asset: "USDC",
          amount: "0.1",
          status: "settled",
          requested_at: "2026-07-06T09:01:00Z",
          canton_update_id: "019f36c038877bc28f4701bbeb1fe955",
        },
      ],
    });

    render(<CantonFundsModal open onClose={vi.fn()} />);

    await waitFor(() => expect(mocks.fetchCantonFundsHistory).toHaveBeenCalledTimes(1));
    expect(document.querySelector('a[href*="token-standard"]')).toBeNull();
    expect(document.querySelector(`a[href="https://www.cantonscan.com/update/${depositUpdateId}"]`)).toBeTruthy();

    fireEvent.click(screen.getByText("Withdraw History"));

    expect(document.querySelector('a[href*="019f36c038877bc28f4701bbeb1fe955"]')).toBeNull();
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

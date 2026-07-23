import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { transferSpotBalance } from "@/shared/lib/canton-wallet/funds";

import { AccountsPanel } from "./AccountsPanel";
import { useAvailableBalanceAdapter } from "../../adapters/useAvailableBalanceAdapter";
import { useUnifiedAccountAdapter } from "../../adapters/useUnifiedAccountAdapter";

vi.mock("../../adapters/useAvailableBalanceAdapter", () => ({
  useAvailableBalanceAdapter: vi.fn(),
}));
vi.mock("../../adapters/useUnifiedAccountAdapter", () => ({
  useUnifiedAccountAdapter: vi.fn(),
}));
vi.mock("@/shared/lib/canton-wallet/funds", () => ({
  transferSpotBalance: vi.fn(),
}));

const mAccount = vi.mocked(useUnifiedAccountAdapter);
const mAvailable = vi.mocked(useAvailableBalanceAdapter);
const mTransfer = vi.mocked(transferSpotBalance);
const mSetAvailable = vi.fn();
const accountStyles = readFileSync(
  resolve("src/modules/lighter/components/AccountsPanel/AccountsPanel.module.scss"),
  "utf8"
);

i18n.load("en", {});
i18n.activate("en");

function renderPanel() {
  return render(
    <I18nProvider i18n={i18n}>
      <AccountsPanel />
    </I18nProvider>
  );
}

beforeEach(() => {
  mAvailable.mockReturnValue({
    available: 3.09,
    loading: false,
    setAvailable: mSetAvailable,
  });
  mAccount.mockReturnValue({
    perpetualsEquity: 3.09,
    spotEquity: 0,
    unrealizedPnl: 0,
    crossMarginUsage: 0,
    maintenanceMargin: 0,
    crossMarginRatio: 0,
    crossLeverage: null,
  });
  mTransfer.mockImplementation(async ({ amount, direction }) => ({
    asset: "USDA",
    direction,
    amount,
    fundingAvailable: direction === "toSpot" ? "2.09" : "3.59",
    spotFree: direction === "toSpot" ? "1" : "0.5",
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccountsPanel", () => {
  it("uses the Futures Account title and exposes USDA transfer controls", () => {
    const view = renderPanel();

    expect(view.getByText("Futures Account")).toBeTruthy();
    expect(view.queryByText("Accounts")).toBeNull();
    expect(view.getByText("Transfer")).toBeTruthy();
    expect(view.getByRole("textbox", { name: "Transfer amount" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Futures → Spot" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Spot → Futures" })).toBeTruthy();
  });

  it("keeps transfer input and button styles above the trade-page element resets", () => {
    const view = renderPanel();
    const toSpot = view.getByRole("button", { name: "Futures → Spot" });

    expect(accountStyles).toContain("input.transferInput");
    expect(toSpot.className).not.toBe("");
  });

  it("submits USDA transfers in both directions and updates the futures balance", async () => {
    const view = renderPanel();
    const amount = view.getByRole("textbox", { name: "Transfer amount" });

    fireEvent.change(amount, { target: { value: "1" } });
    fireEvent.click(view.getByRole("button", { name: "Futures → Spot" }));

    await waitFor(() => {
      expect(mTransfer).toHaveBeenLastCalledWith({
        asset: "USDA",
        amount: "1",
        direction: "toSpot",
      });
    });
    expect(mSetAvailable).toHaveBeenLastCalledWith(2.09);
    expect(view.getByText("2.09")).toBeTruthy();

    fireEvent.change(amount, { target: { value: "0.5" } });
    fireEvent.click(view.getByRole("button", { name: "Spot → Futures" }));

    await waitFor(() => {
      expect(mTransfer).toHaveBeenLastCalledWith({
        asset: "USDA",
        amount: "0.5",
        direction: "toFunding",
      });
    });
    expect(view.getByText("3.59")).toBeTruthy();
  });
});

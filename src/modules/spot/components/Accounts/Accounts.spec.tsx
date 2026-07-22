import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));
vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: vi.fn(),
}));
vi.mock("../../hooks/useSpotAccount", () => ({
  useSpotAccount: vi.fn(),
}));

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { SpotAccountsPanel } from "./Accounts";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { resolveSpotMarket } from "../../model/spotMarkets";

const mConnect = vi.mocked(openCantonConnect);
const mSession = vi.mocked(useCantonSession);
const mSpotAccount = vi.mocked(useSpotAccount);
const market = resolveSpotMarket("CBTC-USDA");

const account = (usdcx: string, locked = "0", cbtc = "0", ceth = "0") => ({
  accountType: "SPOT" as const,
  canTrade: true,
  canWithdraw: false,
  canDeposit: false,
  updateTime: 0,
  balances: [
    { asset: "USDCX", free: usdcx, locked },
    { asset: "CBTC", free: cbtc, locked: "0" },
    { asset: "CETH", free: ceth, locked: "0" },
  ],
  permissions: ["SPOT"],
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotAccountsPanel", () => {
  it("preserves the wallet connect path while account auth is unavailable", () => {
    mSpotAccount.mockReturnValue({ ready: false, account: null, err: null, refetch: vi.fn() });
    mSession.mockReturnValue({
      connected: false,
      token: "",
      party: "",
      username: "",
      avatar: "",
      provider: "",
    });

    const { getByRole } = render(<SpotAccountsPanel market={market} />);
    fireEvent.click(getByRole("button", { name: "Connect wallet" }));

    expect(mConnect).toHaveBeenCalledOnce();
  });

  it("renders the account total and backend balances with public USDA and configured asset casing", () => {
    mSpotAccount.mockReturnValue({
      ready: true,
      account: account("1234.5", "0.5", "0.1", "0.2"),
      err: null,
      refetch: vi.fn(),
    });
    mSession.mockReturnValue({
      connected: true,
      token: "t",
      party: "p1",
      username: "u",
      avatar: "",
      provider: "",
    });

    const { getByText, getAllByText, queryByText } = render(<SpotAccountsPanel market={market} />);

    expect(getByText("USDA (free + locked)")).toBeTruthy();
    expect(getByText("1,235")).toBeTruthy();
    expect(getAllByText("USDA")).toHaveLength(1);
    expect(getByText("CBTC")).toBeTruthy();
    expect(getByText("cETH")).toBeTruthy();
    expect(queryByText(/USDCx/i)).toBeNull();
    expect(queryByText(/Get test funds/)).toBeNull();
  });

  it("preserves loading and error states", () => {
    mSession.mockReturnValue({
      connected: true,
      token: "t",
      party: "p1",
      username: "u",
      avatar: "",
      provider: "",
    });
    mSpotAccount.mockReturnValue({ ready: true, account: null, err: null, refetch: vi.fn() });
    const loading = render(<SpotAccountsPanel market={market} />);
    expect(loading.getByText("Loading…")).toBeTruthy();
    loading.unmount();

    mSpotAccount.mockReturnValue({ ready: true, account: null, err: "account unavailable", refetch: vi.fn() });
    const failed = render(<SpotAccountsPanel market={market} />);
    expect(failed.getByText("account unavailable")).toBeTruthy();
  });

  it("preserves the dev faucet flow and refreshes the shared account state", async () => {
    const refetch = vi.fn();
    mSpotAccount.mockReturnValue({ ready: true, account: account("0"), err: null, refetch });
    mSession.mockReturnValue({
      connected: true,
      token: "t",
      party: "party-abc",
      username: "u",
      avatar: "",
      provider: "",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const { findByRole } = render(<SpotAccountsPanel market={market} />);
    fireEvent.click(await findByRole("button", { name: "Get test funds (dev)" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/v3/dev/faucet");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ party: "party-abc" });
    expect(refetch).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });
});

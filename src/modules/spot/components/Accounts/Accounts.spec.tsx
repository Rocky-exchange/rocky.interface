// Component-layer specs for SpotAccountsPanel — connect gate, balance
// display, and dev faucet flow (shows only on all-zero).
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));
vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: vi.fn(),
}));
vi.mock("../../api/spotSession", () => ({
  useSpotAuthReady: vi.fn(),
}));
vi.mock("../../api/spotClient", async () => {
  const actual = await vi.importActual<typeof import("../../api/spotClient")>("../../api/spotClient");
  return {
    ...actual,
    spotApi: {
      account: vi.fn(),
    },
  };
});

import { openCantonConnect } from "@/shared/lib/canton-wallet/cantonConnect";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useSpotAuthReady } from "../../api/spotSession";
import { spotApi } from "../../api/spotClient";
import { SpotAccountsPanel } from "./Accounts";

const mReady = vi.mocked(useSpotAuthReady);
const mAccount = vi.mocked(spotApi.account);
const mConnect = vi.mocked(openCantonConnect);
const mSession = vi.mocked(useCantonSession);

const acct = (usda: string, cbtc = "0", ceth = "0") => ({
  accountType: "SPOT" as const,
  canTrade: true,
  canWithdraw: false,
  canDeposit: false,
  updateTime: 0,
  balances: [
    { asset: "USDA", free: usda, locked: "0" },
    { asset: "CBTC", free: cbtc, locked: "0" },
    { asset: "cETH", free: ceth, locked: "0" },
  ],
  permissions: ["SPOT"],
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpotAccountsPanel", () => {
  it("shows Connect wallet when auth not ready and skips API", () => {
    mReady.mockReturnValue(false);
    mSession.mockReturnValue({
      connected: false,
      token: "",
      party: "",
      username: "",
      avatar: "",
      provider: "",
    });
    const { getByText } = render(<SpotAccountsPanel />);
    fireEvent.click(getByText("Connect wallet"));
    expect(mConnect).toHaveBeenCalledOnce();
    expect(mAccount).not.toHaveBeenCalled();
  });

  it("renders balances and hides the faucet button when non-zero", async () => {
    mReady.mockReturnValue(true);
    mSession.mockReturnValue({
      connected: true,
      token: "t",
      party: "p1",
      username: "u",
      avatar: "",
      provider: "",
    });
    mAccount.mockResolvedValue(acct("1234.5", "0.1"));
    const { findByText, queryByText } = render(<SpotAccountsPanel />);
    await findByText("1,234.5000");
    expect(queryByText(/Get test funds/)).toBeNull();
  });

  it("shows faucet CTA when all balances are zero and calls the endpoint on click", async () => {
    mReady.mockReturnValue(true);
    mSession.mockReturnValue({
      connected: true,
      token: "t",
      party: "party-abc",
      username: "u",
      avatar: "",
      provider: "",
    });
    mAccount.mockResolvedValue(acct("0"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { findByText } = render(<SpotAccountsPanel />);
    const faucetBtn = await findByText(/Get test funds/);
    fireEvent.click(faucetBtn);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/v3/dev/faucet");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ party: "party-abc" });
    fetchSpy.mockRestore();
  });
});

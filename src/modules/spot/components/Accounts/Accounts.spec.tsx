import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: vi.fn(),
}));
vi.mock("../../hooks/useSpotAccount", () => ({
  useSpotAccount: vi.fn(),
}));

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { SpotAccountsPanel } from "./Accounts";
import { useSpotAccount } from "../../hooks/useSpotAccount";
import { resolveSpotMarket } from "../../model/spotMarkets";

const mSession = vi.mocked(useCantonSession);
const mSpotAccount = vi.mocked(useSpotAccount);
const market = resolveSpotMarket("CBTC-USDA");
// eslint-disable-next-line no-restricted-globals
const accountStyles = readFileSync(resolve(process.cwd(), "src/modules/spot/components/Accounts/Accounts.module.scss"), "utf8");

const account = (usdcx: string, locked = "0", cbtc = "0", ceth = "0") => ({
  accountType: "SPOT" as const,
  canTrade: true,
  canWithdraw: false,
  canDeposit: false,
  updateTime: 0,
  balances: [
    { asset: "USDA", free: usdcx, locked },
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
  it("keeps the transfer input surface above the terminal-wide input reset", () => {
    expect(accountStyles).toMatch(/\.panel\s+\.transferInput\s*\{/);
    expect(accountStyles).toContain("border: 1px solid var(--rocky-input-border, #8b95a5);");
  });

  it("hides the panel-level wallet CTA while account auth is unavailable", () => {
    mSpotAccount.mockReturnValue({ ready: false, account: null, err: null, refetch: vi.fn() });
    mSession.mockReturnValue({
      connected: false,
      token: "",
      party: "",
      username: "",
      avatar: "",
      provider: "",
    });

    const { getByText, queryByRole } = render(<SpotAccountsPanel market={market} />);

    expect(getByText("Spot Account")).toBeTruthy();
    expect(queryByRole("button", { name: "Connect wallet" })).toBeNull();
  });

  it("renders a futures-style asset table instead of a duplicate account CTA in workspace mode", () => {
    mSpotAccount.mockReturnValue({ ready: false, account: null, err: null, refetch: vi.fn() });
    mSession.mockReturnValue({
      connected: false,
      token: "",
      party: "",
      username: "",
      avatar: "",
      provider: "",
    });

    const { getByRole, queryByRole } = render(<SpotAccountsPanel market={market} variant="workspace" />);
    const header = getByRole("row", { name: "Asset Free Locked" });

    expect(header).toBeTruthy();
    expect(queryByRole("button", { name: "Connect wallet" })).toBeNull();
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
    expect(queryByText(/Get test funds/)).toBeNull();
  });

  it("keeps small wrapped balances visible with the wallet history decimal notation", () => {
    mSpotAccount.mockReturnValue({
      ready: true,
      account: account("0.9", "0", "0.000031", "0.0001"),
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

    const { getByRole } = render(<SpotAccountsPanel market={market} />);
    const cbtcRow = getByRole("row", { name: /CBTC/ });
    const cethRow = getByRole("row", { name: /cETH/ });

    expect(within(cbtcRow).getByText("4", { selector: "sub" }).parentElement?.textContent).toContain("0.0431");
    expect(within(cethRow).getByText("3", { selector: "sub" }).parentElement?.textContent).toContain("0.031");
    expect(within(cbtcRow).queryByText("0.0000")).toBeNull();
    expect(within(cethRow).queryByText("0.0000")).toBeNull();
  });

  it("keeps the transfer amount editable and enables both directions after entering an amount", () => {
    mSpotAccount.mockReturnValue({
      ready: true,
      account: account("1"),
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

    const { getByRole } = render(<SpotAccountsPanel market={market} />);
    const input = getByRole("textbox", { name: "Transfer amount" }) as HTMLInputElement;
    const toSpot = getByRole("button", { name: "Futures → Spot" }) as HTMLButtonElement;
    const toFutures = getByRole("button", { name: "Spot → Futures" }) as HTMLButtonElement;

    expect(input.disabled).toBe(false);
    expect(toSpot.disabled).toBe(true);
    expect(toFutures.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "0.1" } });

    expect(toSpot.disabled).toBe(false);
    expect(toFutures.disabled).toBe(false);
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
    expect(loading.getByRole("status").textContent).toBe("Loading…");
    loading.unmount();

    mSpotAccount.mockReturnValue({ ready: true, account: null, err: "account unavailable", refetch: vi.fn() });
    const failed = render(<SpotAccountsPanel market={market} />);
    expect(failed.getByRole("alert").textContent).toBe("account unavailable");
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

  it("announces faucet request failures", async () => {
    mSpotAccount.mockReturnValue({ ready: true, account: account("0"), err: null, refetch: vi.fn() });
    mSession.mockReturnValue({
      connected: true,
      token: "t",
      party: "party-abc",
      username: "u",
      avatar: "",
      provider: "",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 500 }));

    const { findByRole } = render(<SpotAccountsPanel market={market} />);
    fireEvent.click(await findByRole("button", { name: "Get test funds (dev)" }));

    expect((await findByRole("alert")).textContent).toBe("faucet HTTP 500");
    fetchSpy.mockRestore();
  });
});

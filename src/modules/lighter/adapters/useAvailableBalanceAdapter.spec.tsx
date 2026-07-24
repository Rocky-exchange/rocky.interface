import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchFundingAccountBalance } from "@/shared/lib/canton-wallet/funds";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { useAvailableBalanceAdapter } from "./useAvailableBalanceAdapter";

vi.mock("@/shared/lib/canton-wallet/funds", () => ({
  fetchFundingAccountBalance: vi.fn(),
}));
vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: vi.fn(),
}));

const mFundingBalance = vi.mocked(fetchFundingAccountBalance);
const mSession = vi.mocked(useCantonSession);

function BalanceHarness() {
  const { available } = useAvailableBalanceAdapter();
  return <span data-testid="available">{available == null ? "missing" : String(available)}</span>;
}

beforeEach(() => {
  mSession.mockReturnValue({
    connected: true,
    locked: false,
    party: "party-1",
    token: "token",
    username: "user",
    avatar: "",
    provider: "rocky",
  });
  mFundingBalance.mockResolvedValue(0.1);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useAvailableBalanceAdapter", () => {
  it("reads the futures CUSD available balance used by the Futures Account panel", async () => {
    const view = render(<BalanceHarness />);

    await waitFor(() => expect(view.getByTestId("available").textContent).toBe("0.1"));
    expect(mFundingBalance).toHaveBeenCalledTimes(1);
  });
});

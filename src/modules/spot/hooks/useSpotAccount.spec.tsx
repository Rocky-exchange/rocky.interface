import { cleanup, render, waitFor } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSpotAccount } from "./useSpotAccount";
import { spotApi } from "../api/spotClient";

vi.mock("../api/spotSession", () => ({
  useSpotAuthReady: () => true,
}));

vi.mock("../api/spotClient", () => ({
  getSpotCredentials: () => ({ key: "test-key", secret: "test-secret" }),
  spotApi: {
    account: vi.fn(),
  },
}));

const account = {
  accountType: "SPOT" as const,
  balances: [],
  canDeposit: false,
  canTrade: true,
  canWithdraw: false,
  permissions: ["SPOT"],
  updateTime: 1,
};

const swrConfig = { provider: () => new Map() };

function Consumer() {
  const { account: value } = useSpotAccount();
  return <span>{value?.updateTime ?? "loading"}</span>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useSpotAccount", () => {
  it("shares one account request across all consumers", async () => {
    vi.mocked(spotApi.account).mockResolvedValue(account);

    render(
      <SWRConfig value={swrConfig}>
        <Consumer />
        <Consumer />
        <Consumer />
      </SWRConfig>
    );

    await waitFor(() => expect(spotApi.account).toHaveBeenCalledTimes(1));
  });

  it("runs only one shared account refresh per interval", async () => {
    vi.useFakeTimers();
    vi.mocked(spotApi.account).mockResolvedValue(account);

    render(
      <SWRConfig value={swrConfig}>
        <Consumer />
        <Consumer />
        <Consumer />
      </SWRConfig>
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(spotApi.account).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(spotApi.account).toHaveBeenCalledTimes(2);
  });
});

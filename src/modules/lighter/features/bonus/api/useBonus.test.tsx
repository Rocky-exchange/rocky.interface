// @testing-library/react v11 has no renderHook, so exercise the hooks through harness components.
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig, type Cache } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import { fetchBonusBalanceInfo, fetchBonusHistory, fetchBonusStatus } from "./bonus.api";
import type { BonusBalanceInfoResponse, BonusHistoryResponse, BonusStatusResponse } from "./bonus.types";
import {
  BONUS_DATA_CHANGED_EVENT,
  invalidateBonusData,
  useBonusBalance,
  useBonusHistory,
  useBonusStatus,
} from "./useBonus";

vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: vi.fn(),
}));

vi.mock("./bonus.api", async () => {
  const actual = await vi.importActual<typeof import("./bonus.api")>("./bonus.api");
  return {
    ...actual,
    fetchBonusStatus: vi.fn(),
    fetchBonusBalanceInfo: vi.fn(),
    fetchBonusHistory: vi.fn(),
  };
});

const STATUS: BonusStatusResponse = {
  has_bonus: true,
  bonus_account_id: "bonus-1",
  status: "active",
  grant_tier: "trial",
  bonus_initial: "100",
  bonus_balance: "90",
  bonus_locked_in_margin: "10",
  bonus_consumed_total: "0",
  bonus_recalled_total: "0",
  max_leverage: 10,
  granted_at: "2026-07-01T00:00:00Z",
  expires_at: "2026-07-08T00:00:00Z",
};

const BALANCE: BonusBalanceInfoResponse = {
  total_available: "150",
  available: "140",
  locked: "10",
  principal_free: "50",
  principal_locked: "0",
  bonus_free: "90",
  bonus_locked: "10",
  effective_withdrawable: "50",
  status: "active",
};

const FIRST_HISTORY_PAGE: BonusHistoryResponse = {
  rows: [
    {
      id: "history-1",
      event_type: "trade_fee",
      total_cost: "2",
      bonus_share: "1",
      principal_share: "1",
      attribution_rule: "half",
      source_trade_id: "trade-1",
      source_funding_id: "",
      occurred_at: "2026-07-02T00:00:00Z",
    },
  ],
  next_cursor: "cursor-1",
};

const LAST_HISTORY_PAGE: BonusHistoryResponse = {
  rows: [
    {
      id: "history-2",
      event_type: "funding",
      total_cost: "4",
      bonus_share: "2",
      principal_share: "2",
      attribution_rule: "half",
      source_trade_id: "",
      source_funding_id: "funding-1",
      occurred_at: "2026-07-03T00:00:00Z",
    },
  ],
  next_cursor: "",
};

const mSession = vi.mocked(useCantonSession);
const mStatus = vi.mocked(fetchBonusStatus);
const mBalance = vi.mocked(fetchBonusBalanceInfo);
const mHistory = vi.mocked(fetchBonusHistory);

let session: ReturnType<typeof useCantonSession>;
let cache: Cache;
const TEST_SWR_CONFIG = {
  provider: () => cache,
  dedupingInterval: 0,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  refreshWhenHidden: true,
};

function TestSWRProvider({ children }: { children?: ReactNode }) {
  return <SWRConfig value={TEST_SWR_CONFIG}>{children}</SWRConfig>;
}

function StatusHarness() {
  useBonusStatus();
  return null;
}

function PollingHarness() {
  useBonusStatus();
  useBonusBalance();
  return null;
}

type AllHooks = {
  status: ReturnType<typeof useBonusStatus>;
  balance: ReturnType<typeof useBonusBalance>;
  history: ReturnType<typeof useBonusHistory>;
};

function AllHooksHarness({ onRender }: { onRender?: (hooks: AllHooks) => void }) {
  const hooks = {
    status: useBonusStatus(),
    balance: useBonusBalance(),
    history: useBonusHistory(20),
  };
  onRender?.(hooks);
  return null;
}

beforeEach(() => {
  cache = new Map();
  session = {
    connected: true,
    token: "session-1",
    party: "party-a",
    username: "alice",
    avatar: "",
    provider: "rocky",
  };
  mSession.mockImplementation(() => session);
  mStatus.mockResolvedValue(STATUS);
  mBalance.mockResolvedValue(BALANCE);
  mHistory.mockResolvedValue({ rows: [], next_cursor: "" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("Canton-scoped bonus hooks", () => {
  it("does not fetch while the Canton session is disconnected", async () => {
    session = { ...session, connected: false, token: "", party: "" };

    render(<AllHooksHarness />, { wrapper: TestSWRProvider });
    await act(async () => undefined);

    expect(mStatus).not.toHaveBeenCalled();
    expect(mBalance).not.toHaveBeenCalled();
    expect(mHistory).not.toHaveBeenCalled();
  });

  it("includes the Canton party in every mounted cache key", async () => {
    render(<AllHooksHarness />, { wrapper: TestSWRProvider });

    await waitFor(() => {
      expect(mStatus).toHaveBeenCalled();
      expect(mBalance).toHaveBeenCalled();
      expect(mHistory).toHaveBeenCalled();
    });

    const keys = [...cache.keys()].map(String);
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys.every((key) => key.includes("party-a"))).toBe(true);
  });

  it("fetches fresh status data when the Canton party changes", async () => {
    const rendered = render(<StatusHarness />, { wrapper: TestSWRProvider });
    await waitFor(() => expect(mStatus).toHaveBeenCalledTimes(1));
    expect(mStatus).toHaveBeenLastCalledWith(["bonus-status", "party-a"]);

    session = { ...session, party: "party-b", username: "bob" };
    rendered.rerender(<StatusHarness />);

    await waitFor(() => expect(mStatus).toHaveBeenCalledTimes(2));
    expect(mStatus).toHaveBeenLastCalledWith(["bonus-status", "party-b"]);
  });

  it("polls status every 30 seconds and balance every 10 seconds", async () => {
    vi.useFakeTimers();
    render(<PollingHarness />, { wrapper: TestSWRProvider });
    await act(async () => undefined);

    expect(mStatus).toHaveBeenCalledTimes(1);
    expect(mBalance).toHaveBeenCalledTimes(1);

    await advanceTimers(10_000);
    expect(mStatus).toHaveBeenCalledTimes(1);
    expect(mBalance).toHaveBeenCalledTimes(2);

    await advanceTimers(10_000);
    expect(mStatus).toHaveBeenCalledTimes(1);
    expect(mBalance).toHaveBeenCalledTimes(3);

    await advanceTimers(10_000);
    expect(mStatus).toHaveBeenCalledTimes(2);
    expect(mBalance).toHaveBeenCalledTimes(4);
  });

  it("invalidateBonusData revalidates mounted status, balance, and history hooks", async () => {
    render(<AllHooksHarness />, { wrapper: TestSWRProvider });
    await waitFor(() => {
      expect(mStatus).toHaveBeenCalledTimes(1);
      expect(mBalance).toHaveBeenCalledTimes(1);
      expect(mHistory).toHaveBeenCalledTimes(1);
    });

    act(() => invalidateBonusData());

    await waitFor(() => {
      expect(mStatus).toHaveBeenCalledTimes(2);
      expect(mBalance).toHaveBeenCalledTimes(2);
      expect(mHistory).toHaveBeenCalledTimes(2);
    });
  });

  it("revalidates mounted hooks when the bonus-data-changed window event fires", async () => {
    render(<AllHooksHarness />, { wrapper: TestSWRProvider });
    await waitFor(() => {
      expect(mStatus).toHaveBeenCalledTimes(1);
      expect(mBalance).toHaveBeenCalledTimes(1);
      expect(mHistory).toHaveBeenCalledTimes(1);
    });

    act(() => window.dispatchEvent(new Event(BONUS_DATA_CHANGED_EVENT)));

    await waitFor(() => {
      expect(mStatus).toHaveBeenCalledTimes(2);
      expect(mBalance).toHaveBeenCalledTimes(2);
      expect(mHistory).toHaveBeenCalledTimes(2);
    });
  });

  it("loads history by cursor, flattens rows, and stops after the last page", async () => {
    mHistory.mockResolvedValueOnce(FIRST_HISTORY_PAGE).mockResolvedValueOnce(LAST_HISTORY_PAGE);
    let latest: AllHooks | undefined;
    render(<AllHooksHarness onRender={(hooks) => (latest = hooks)} />, { wrapper: TestSWRProvider });

    await waitFor(() => {
      expect(latest?.history.rows).toEqual(FIRST_HISTORY_PAGE.rows);
      expect(latest?.history.hasMore).toBe(true);
    });

    act(() => latest?.history.loadMore());

    await waitFor(() => {
      expect(mHistory).toHaveBeenLastCalledWith({ limit: 20, before: "cursor-1" });
      expect(latest?.history.rows).toEqual([...FIRST_HISTORY_PAGE.rows, ...LAST_HISTORY_PAGE.rows]);
      expect(latest?.history.hasMore).toBe(false);
    });

    act(() => latest?.history.loadMore());
    await act(async () => undefined);
    expect(mHistory).toHaveBeenCalledTimes(2);
  });
});

async function advanceTimers(milliseconds: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

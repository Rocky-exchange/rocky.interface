import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCampaign,
  getLeaderboard,
  getMissions,
  startWalletBoundXOAuth,
  startXOAuth,
} from "./campaign.api";

describe("campaign activity API", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the exchange session for authenticated campaign reads", async () => {
    localStorage.setItem("rocky_exchange_session", "exchange-token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            missions: [{ key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" }],
            progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
          },
          meta: { requestId: "request-1", serverTime: "2026-07-28T00:00:00.000Z" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const missions = await getMissions();

    expect(missions.missions[0]).toMatchObject({ key: "BIND_X", state: "claimed" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/external-active/v1/me/missions",
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer exchange-token");
  });

  it("returns the real X authorization URL without exposing credentials to the browser", async () => {
    localStorage.setItem("rocky_exchange_session", "exchange-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { authorizationUrl: "https://x.com/i/oauth2/authorize?state=opaque" },
            meta: { requestId: "request-2", serverTime: "2026-07-28T00:00:00.000Z" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(startXOAuth()).resolves.toBe("https://x.com/i/oauth2/authorize?state=opaque");
  });

  it("synchronizes the signed wallet identity before starting X authorization", async () => {
    localStorage.setItem("rocky_exchange_session", "exchange-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              userId: "user-1",
              role: "NORMAL",
              activatedAt: "2026-07-28T00:00:00.000Z",
              activationDay: 1,
              phase: "active",
            },
            meta: { requestId: "sync-request", serverTime: "2026-07-28T00:00:00.000Z" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { authorizationUrl: "https://x.com/i/oauth2/authorize?state=wallet-bound" },
            meta: { requestId: "oauth-request", serverTime: "2026-07-28T00:00:01.000Z" },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(startWalletBoundXOAuth()).resolves.toContain("state=wallet-bound");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/external-active/v1/me/campaign",
      "/external-active/v1/social/x/oauth/start",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Headers).get("authorization")).toBe("Bearer exchange-token");
    }
  });

  it("keeps the public leaderboard unauthenticated and pinned to its requested page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            status: "live",
            stale: false,
            page: 2,
            pageSize: 10,
            snapshotId: null,
            snapshotAt: null,
            checksum: null,
            total: 0,
            entries: [],
          },
          meta: { requestId: "request-3", serverTime: "2026-07-28T00:00:00.000Z" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getLeaderboard(2)).resolves.toMatchObject({ page: 2, entries: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/external-active/v1/campaigns/season-0/leaderboard?page=2",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.has("authorization")).toBe(false);
  });

  it("loads the public campaign schedule without an exchange session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            campaignId: "season-0",
            phase: "active",
            serverTime: "2026-07-28T00:00:00.000Z",
            startsAt: "2026-07-28T00:00:00.000Z",
            endsAt: "2026-07-29T00:00:00.000Z",
          },
          meta: { requestId: "request-4", serverTime: "2026-07-28T00:00:00.000Z" },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCampaign()).resolves.toMatchObject({
      campaignId: "season-0",
      endsAt: "2026-07-29T00:00:00.000Z",
    });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.has("authorization")).toBe(false);
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

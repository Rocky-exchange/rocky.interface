import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMissions,
  startMission,
  type MissionList,
} from "@/modules/campaigns/api/campaign.api";
import { helperToast } from "@/shared/lib/helperToast";
import SeasonZeroLeaderboardPage from "./SeasonZeroLeaderboardPage";

vi.mock("@/modules/campaigns/api/campaign.api", () => ({
  claimMission: vi.fn(),
  getCampaign: vi.fn().mockResolvedValue({
    campaignId: "season-0",
    phase: "active",
    serverTime: "2026-07-28T00:00:00.000Z",
    startsAt: "2026-07-28T00:00:00.000Z",
    endsAt: "2026-08-11T00:00:00.000Z",
  }),
  getLeaderboard: vi.fn(),
  getMissions: vi.fn(),
  getRewards: vi.fn(),
  startMission: vi.fn(),
  startWalletBoundXOAuth: vi.fn(),
  verifyMission: vi.fn(),
}));

vi.mock("@/modules/lighter/components/TopNav/TopNav", () => ({
  TopNav: () => <div>Top navigation</div>,
}));

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));

vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: () => ({
    connected: true,
    locked: false,
    token: "session",
    party: "party::user",
    username: "user",
    avatar: "",
    provider: "rocky",
  }),
}));

vi.mock("@/shared/lib/canton-wallet/useCantonWallet", () => ({
  useCantonWallet: () => ({ unlock: vi.fn() }),
}));

vi.mock("@/shared/lib/helperToast", () => ({
  helperToast: {
    error: vi.fn(),
  },
}));

describe("SeasonZeroLeaderboardPage X binding", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    i18n.load("en", {});
    i18n.activate("en");
  });

  it("keeps X authorization disabled until the authoritative mission state is loaded", async () => {
    let resolveMissions!: (value: MissionList) => void;
    vi.mocked(getMissions).mockReturnValue(
      new Promise((resolve) => {
        resolveMissions = resolve;
      }) as ReturnType<typeof getMissions>,
    );

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    expect((screen.getByRole("button", { name: "Loading..." }) as HTMLButtonElement).disabled).toBe(true);

    resolveMissions({
      missions: [{ key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" }],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });

    expect((await screen.findByRole("button", { name: "X Connected" })).getAttribute("aria-pressed")).toBe("true");
  });

  it("explains an immutable X identity callback instead of leaving the user on an error response", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [{ key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" }],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter
          initialEntries={[
            "/campaigns/season-0?x=error&x_error=X_IDENTITY_IMMUTABLE",
          ]}
        >
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(helperToast.error).toHaveBeenCalledWith(
        "This wallet is already connected to another X account. Please authorize the previously connected X account.",
      );
    });
  });

  it("opens the configured Rocky launch post when the Like Launch Post mission starts", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "LIKE_LAUNCH", state: "not_started", title: "Like the launch post", reward: "50" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(startMission).mockResolvedValue({
      state: "verifying",
      actionUrls: ["https://x.com/Rocky_exchange/status/2081771534134530514"],
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    const title = await screen.findByText("Like Launch Post");
    const mission = title.closest("article");
    expect(mission).not.toBeNull();
    fireEvent.click(within(mission as HTMLElement).getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "https://x.com/Rocky_exchange/status/2081771534134530514",
        "_blank",
        "noopener,noreferrer",
      );
    });
    openSpy.mockRestore();
  });
});

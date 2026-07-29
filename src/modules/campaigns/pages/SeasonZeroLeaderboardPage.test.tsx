import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimMission,
  getMissions,
  startWalletBoundDiscordOAuth,
  startMission,
  submitMission,
  type MissionList,
  verifyMission,
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
  submitMission: vi.fn(),
  startWalletBoundDiscordOAuth: vi.fn(),
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
    info: vi.fn(),
    success: vi.fn(),
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

  it("refreshes the authoritative Discord mission state after OAuth returns", async () => {
    vi.mocked(getMissions)
      .mockResolvedValueOnce({
        missions: [
          { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
          { key: "JOIN_DISCORD", state: "retry", title: "Join Discord", reward: "100" },
        ],
        progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
      })
      .mockResolvedValue({
        missions: [
          { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
          { key: "JOIN_DISCORD", state: "claimable", title: "Join Discord", reward: "100" },
        ],
        progress: { completedCount: 1, claimableCount: 1, totalCount: 7 },
      });

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0?discord=connected"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    const title = await screen.findByText("Join Community");
    const mission = title.closest("article");
    expect(
      await within(mission as HTMLElement).findByRole("button", { name: "Claim" }),
    ).not.toBeNull();
    expect(helperToast.success).toHaveBeenCalledWith(
      "Discord connected. Join the Rocky community, then verify the mission.",
    );
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

  it("renders the first perpetual trade as mission 06 and opens trading when it starts", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        {
          key: "FIRST_TRADE",
          state: "not_started",
          title: "Complete Your First Perpetual Trade",
          reward: "100",
        },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 8 },
    });
    vi.mocked(startMission).mockResolvedValue({ state: "verifying" });

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
          <Route path="/trade">
            <div>Trading screen</div>
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    const title = await screen.findByText("Complete Your First Perpetual Trade");
    const mission = title.closest("article");
    expect(mission).not.toBeNull();
    expect(within(mission as HTMLElement).getByText("06")).toBeTruthy();
    expect(screen.getByRole("img", { name: "0 of 6 missions completed" })).toBeTruthy();

    fireEvent.click(within(mission as HTMLElement).getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(startMission).toHaveBeenCalledWith("FIRST_TRADE");
      expect(screen.getByText("Trading screen")).toBeTruthy();
    });
  });

  it("submits a Quote Launch Post URL instead of calling the automatic verifier", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "QUOTE_LAUNCH", state: "retry", title: "Quote the launch post", reward: "150" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(submitMission).mockResolvedValue({ state: "pending" });

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    const title = await screen.findByText("Quote Launch Post");
    const mission = title.closest("article");
    fireEvent.click(within(mission as HTMLElement).getByRole("button", { name: "Retry" }));

    fireEvent.change(await screen.findByRole("textbox", { name: "Your X URL" }), {
      target: { value: "https://x.com/rocky_user/status/2222222222222222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(submitMission).toHaveBeenCalledWith(
        "QUOTE_LAUNCH",
        "https://x.com/rocky_user/status/2222222222222222222",
      );
    });
    expect(verifyMission).not.toHaveBeenCalled();
  });

  it("submits an Original Post URL to the manual review API instead of granting a local claim", async () => {
    vi.mocked(getMissions)
      .mockResolvedValueOnce({
        missions: [
          { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
          { key: "ORIGINAL_TWEET", state: "not_started", title: "Original post", reward: "200" },
        ],
        progress: {
          completedCount: 1,
          claimableCount: 0,
          totalCount: 7,
          originalTweet: { activityDay: 1, approvedToday: 0, pendingToday: 0, limit: 2 },
        },
      })
      .mockResolvedValue({
        missions: [
          { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
          { key: "ORIGINAL_TWEET", state: "pending", title: "Original post", reward: "200" },
        ],
        progress: {
          completedCount: 1,
          claimableCount: 0,
          totalCount: 7,
          originalTweet: { activityDay: 1, approvedToday: 0, pendingToday: 1, limit: 2 },
        },
      });
    vi.mocked(startMission).mockResolvedValue({ state: "verifying" });
    vi.mocked(submitMission).mockResolvedValue({ state: "pending" });

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Submit Post" }));
    fireEvent.change(screen.getByPlaceholderText("https://x.com/username/status/1234567890"), {
      target: { value: "https://x.com/leo/status/3333333333333333333" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(startMission).toHaveBeenCalledWith("ORIGINAL_TWEET");
      expect(submitMission).toHaveBeenCalledWith(
        "ORIGINAL_TWEET",
        "https://x.com/leo/status/3333333333333333333",
      );
    });
    expect((await screen.findByRole("button", { name: "Pending" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
  });

  it("explains when an Original Post was published outside the campaign period", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "ORIGINAL_TWEET", state: "not_started", title: "Original post", reward: "200" },
      ],
      progress: {
        completedCount: 1,
        claimableCount: 0,
        totalCount: 7,
        originalTweet: { activityDay: 1, approvedToday: 0, pendingToday: 0, limit: 2 },
      },
    });
    vi.mocked(startMission).mockResolvedValue({ state: "verifying" });
    vi.mocked(submitMission).mockRejectedValue(
      Object.assign(new Error("outside campaign"), { code: "SOCIAL_POST_OUTSIDE_CAMPAIGN" }),
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

    fireEvent.click(await screen.findByRole("button", { name: "Submit Post" }));
    fireEvent.change(screen.getByPlaceholderText("https://x.com/username/status/1234567890"), {
      target: { value: "https://x.com/Le0_Simons/status/1881227213087068296" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Only posts published during this campaign can be submitted.",
    );
  });

  it("claims an approved Original Post reward through the backend", async () => {
    vi.mocked(getMissions)
      .mockResolvedValueOnce({
        missions: [
          { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
          { key: "ORIGINAL_TWEET", state: "claimable", title: "Original post", reward: "200" },
        ],
        progress: {
          completedCount: 1,
          claimableCount: 0,
          totalCount: 7,
          originalTweet: { activityDay: 1, approvedToday: 1, pendingToday: 0, limit: 2 },
        },
      })
      .mockResolvedValue({
        missions: [
          { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
          { key: "ORIGINAL_TWEET", state: "claimed", title: "Original post", reward: "200" },
        ],
        progress: {
          completedCount: 1,
          claimableCount: 0,
          totalCount: 7,
          originalTweet: { activityDay: 1, approvedToday: 1, pendingToday: 0, limit: 2 },
        },
      });
    vi.mocked(claimMission).mockResolvedValue({});

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Claim" }));

    await waitFor(() => {
      expect(claimMission).toHaveBeenCalledWith("ORIGINAL_TWEET");
    });
    expect(await screen.findByText("Reward Claimed!")).not.toBeNull();
  });

  it("single-flights rapid repeated verification clicks", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "LIKE_LAUNCH", state: "retry", title: "Like the launch post", reward: "50" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(verifyMission).mockReturnValue(new Promise(() => undefined));

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
    const retryButton = within(mission as HTMLElement).getByRole("button", { name: "Retry" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    expect(verifyMission).toHaveBeenCalledTimes(1);
  });

  it("verifies a retrying Discord mission before considering OAuth", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "JOIN_DISCORD", state: "retry", title: "Join Discord", reward: "100" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(verifyMission).mockResolvedValue({ state: "claimable" });

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    const title = await screen.findByText("Join Community");
    const mission = title.closest("article");
    fireEvent.click(within(mission as HTMLElement).getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(verifyMission).toHaveBeenCalledWith("JOIN_DISCORD");
    });
    expect(startMission).not.toHaveBeenCalled();
    expect(startWalletBoundDiscordOAuth).not.toHaveBeenCalled();
    expect(helperToast.success).toHaveBeenCalledWith(
      "Mission verified. Reward is ready to claim.",
    );
  });

  it("restarts Discord OAuth only when verification requires a bound identity", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "JOIN_DISCORD", state: "retry", title: "Join Discord", reward: "100" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(verifyMission).mockRejectedValue({
      code: "DISCORD_IDENTITY_REQUIRED",
      message: "Discord identity must be connected first",
    });
    vi.mocked(startWalletBoundDiscordOAuth).mockResolvedValue(
      "https://discord.com/oauth2/authorize?client_id=test",
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

    const title = await screen.findByText("Join Community");
    const mission = title.closest("article");
    fireEvent.click(within(mission as HTMLElement).getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(verifyMission).toHaveBeenCalledWith("JOIN_DISCORD");
      expect(startWalletBoundDiscordOAuth).toHaveBeenCalledTimes(1);
    });
    expect(startMission).not.toHaveBeenCalled();
  });

  it("shows immediate progress feedback while a Retry verification is running", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "LIKE_LAUNCH", state: "retry", title: "Like the launch post", reward: "50" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(verifyMission).mockReturnValue(new Promise(() => undefined));

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
    const retryButton = within(mission as HTMLElement).getByRole("button", { name: "Retry" });
    fireEvent.click(retryButton);

    const checkingButton = within(mission as HTMLElement).getByRole("button", { name: "Checking..." });
    expect((checkingButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows immediate progress feedback while a Quote URL submission is running", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "QUOTE_LAUNCH", state: "retry", title: "Quote the launch post", reward: "150" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(submitMission).mockReturnValue(new Promise(() => undefined));

    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/campaigns/season-0"]}>
          <Route path="/campaigns/season-0">
            <SeasonZeroLeaderboardPage />
          </Route>
        </MemoryRouter>
      </I18nProvider>,
    );

    const title = await screen.findByText("Quote Launch Post");
    const mission = title.closest("article");
    fireEvent.click(within(mission as HTMLElement).getByRole("button", { name: "Retry" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Your X URL" }), {
      target: { value: "https://x.com/rocky_user/status/2222222222222222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    const submittingButton = screen.getByRole("button", { name: "Submitting..." });
    expect((submittingButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains a failed Retry and blocks immediate repeat requests", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "LIKE_LAUNCH", state: "retry", title: "Like the launch post", reward: "50" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(verifyMission).mockRejectedValue(
      Object.assign(new Error("dependency unavailable"), { code: "DEPENDENCY_UNAVAILABLE" }),
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

    const title = await screen.findByText("Like Launch Post");
    const mission = title.closest("article");
    fireEvent.click(within(mission as HTMLElement).getByRole("button", { name: "Retry" }));

    const cooldownButton = await within(mission as HTMLElement).findByRole("button", {
      name: "Retry shortly",
    });
    expect((cooldownButton as HTMLButtonElement).disabled).toBe(true);
    expect(helperToast.error).toHaveBeenCalledWith(
      "X verification is temporarily unavailable. Please try again shortly.",
    );

    fireEvent.click(cooldownButton);
    expect(verifyMission).toHaveBeenCalledTimes(1);
  });

  it("shows a Quote submission error inline and blocks repeated submissions during cooldown", async () => {
    vi.mocked(getMissions).mockResolvedValue({
      missions: [
        { key: "BIND_X", state: "claimed", title: "Bind X", reward: "0" },
        { key: "QUOTE_LAUNCH", state: "retry", title: "Quote the launch post", reward: "150" },
      ],
      progress: { completedCount: 1, claimableCount: 0, totalCount: 7 },
    });
    vi.mocked(submitMission).mockRejectedValue(
      Object.assign(new Error("invalid submission"), { code: "MISSION_SUBMISSION_INVALID" }),
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

    const title = await screen.findByText("Quote Launch Post");
    const mission = title.closest("article");
    fireEvent.click(within(mission as HTMLElement).getByRole("button", { name: "Retry" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Your X URL" }), {
      target: { value: "https://x.com/rocky_user/status/2222222222222222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This X post link is invalid. Check the URL and try again.",
    );
    const urlInput = screen.getByRole("textbox", { name: "Your X URL" });
    const submitPanel = urlInput.closest('[class*="missionSubmitPanel"]');
    expect(submitPanel).not.toBeNull();
    const cooldownButton = within(submitPanel as HTMLElement).getByRole("button", {
      name: "Retry shortly",
    });
    expect((cooldownButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(cooldownButton);
    expect(submitMission).toHaveBeenCalledTimes(1);
  });
});

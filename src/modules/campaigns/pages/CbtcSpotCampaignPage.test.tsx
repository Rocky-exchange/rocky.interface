import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({ i18n: { locale: "en" } }),
}));

vi.mock("@/modules/lighter/components/TopNav/TopNav", () => ({
  TopNav: () => <nav>Top Navigation</nav>,
}));

vi.mock("@/modules/campaigns/api/campaign.api", async () => {
  const actual = await vi.importActual<typeof import("@/modules/campaigns/api/campaign.api")>(
    "@/modules/campaigns/api/campaign.api"
  );
  return { ...actual, getCbtcLeaderboard: vi.fn() };
});

vi.mock("@/shared/lib/canton-wallet/profile", () => ({
  resolveUserProfiles: vi.fn(),
}));

import { getCbtcLeaderboard } from "@/modules/campaigns/api/campaign.api";
import { abbreviateWalletAddress } from "@/shared/lib/canton-wallet/addressFormat";
import { resolveUserProfiles } from "@/shared/lib/canton-wallet/profile";
import { getWalletProviderLogo } from "@/shared/lib/canton-wallet/walletLogos";

import CbtcSpotCampaignPage from "./CbtcSpotCampaignPage";

describe("CbtcSpotCampaignPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    document.documentElement.className = "";
    document.body.className = "";
    vi.mocked(getCbtcLeaderboard).mockRejectedValue(new Error("offline"));
    vi.mocked(resolveUserProfiles).mockResolvedValue({});
  });

  it("renders the proposal reward structure and independent CC ledger", () => {
    render(
      <MemoryRouter>
        <CbtcSpotCampaignPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Rocky and BitSafe")).toBeDefined();
    expect(screen.getByAltText("BitSafe")).toBeDefined();
    expect(screen.getByRole("heading", { name: "CBTC SPOT CAMPAIGN" })).toBeDefined();
    expect(screen.getByText("2026.08.12")).toBeDefined();
    expect(screen.getByText("$12,000 VOLUME POOL")).toBeDefined();
    expect(screen.getByText("$1.90")).toBeDefined();
    expect(screen.getByText("$1.14")).toBeDefined();
    expect(screen.getByText("PENDING SETTLEMENT")).toBeDefined();
    expect(screen.getByText("CBTC CAMPAIGN REWARDS DO NOT ENTER YOUR R DIAMONDS TOTAL")).toBeDefined();
  });

  it("keeps the final quote asset visibly unconfirmed while linking Trade CBTC to the current test market", () => {
    render(
      <MemoryRouter>
        <CbtcSpotCampaignPage />
      </MemoryRouter>
    );

    expect(screen.getAllByText("CBTC / [QUOTE ASSET]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /TRADE CBTC/ }).getAttribute("href")).toBe("/spot/CBTC-CUSD");
    expect(screen.getByRole("link", { name: /EXPLORE REWARDS/ }).getAttribute("href")).toBe("#tracks");
    expect(screen.getByRole("link", { name: /VIEW LEADERBOARD/ }).getAttribute("href")).toBe("#leaderboard");
    expect(screen.getByRole("button", { name: /SUBMIT CONTENT/ })).toBeDefined();
  });

  it("renders concrete CBTC volume standings before the reward tiers", () => {
    render(
      <MemoryRouter>
        <CbtcSpotCampaignPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("table", { name: "CBTC volume rankings" })).toBeDefined();
    expect(screen.getByText("SatoshiNova")).toBeDefined();
    expect(screen.getByText("$482,760.42")).toBeDefined();
    expect(screen.getAllByText("QUALIFIED")).toHaveLength(10);
  });

  it("renders the Profile name, avatar, and party address for live leaderboard users", async () => {
    const userId = "efa9d668-a6c0-4f16-bc49-3acb18e65ec1";
    const partyAddress = "rockywallet-leo::1220b203f8a6385f3eb7520fe8078972aa6830e3d676af1fed675e0f9e19b547f5fb";
    vi.mocked(getCbtcLeaderboard).mockResolvedValue({
      phase: "active",
      page: 1,
      pageSize: 10,
      total: 1,
      rankedPositions: 50,
      entries: [
        {
          rank: 1,
          profileKey: userId,
          wallet: "rockywallet-e...5EC1",
          qualifyingVolumeUsd: "11.69",
          activeDays: 1,
          eligible: true,
          estimatedRewardUsd: "1000.00",
        },
      ],
    });
    vi.mocked(resolveUserProfiles).mockResolvedValue({
      [userId]: {
        address: partyAddress,
        provider: "rocky",
        displayName: "Leo",
        avatar: "",
      },
    });

    render(
      <MemoryRouter>
        <CbtcSpotCampaignPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Leo")).toBeDefined();
    expect(screen.getByText(abbreviateWalletAddress(partyAddress, 30))).toBeDefined();
    expect(
      Array.from(document.querySelectorAll("img")).some(
        (image) => image.getAttribute("src") === getWalletProviderLogo("rocky").src
      )
    ).toBe(true);
    expect(resolveUserProfiles).toHaveBeenCalledWith([userId]);
  });

  it("smoothly scrolls the campaign action links to their sections", () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(
        <MemoryRouter>
          <CbtcSpotCampaignPage />
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole("link", { name: /EXPLORE REWARDS/ }));
      fireEvent.click(screen.getByRole("link", { name: /VIEW LEADERBOARD/ }));
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenNthCalledWith(1, { behavior: "smooth", block: "start" });
      expect(scrollIntoView).toHaveBeenNthCalledWith(2, { behavior: "smooth", block: "start" });
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
      } else {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      }
    }
  });

  it("opens a public media URL submission modal from the content track", () => {
    render(
      <MemoryRouter>
        <CbtcSpotCampaignPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /SUBMIT CONTENT/ }));

    expect(screen.getByRole("heading", { name: "SUBMIT YOUR CBTC CONTENT" })).toBeDefined();
    expect(screen.getByLabelText("CONTENT URL")).toBeDefined();
    expect(screen.getByText("Original content that remains public")).toBeDefined();
    expect(screen.getByRole("button", { name: /SUBMIT LINK/ }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("CONTENT URL"), {
      target: { value: "https://medium.com/@rocky/cbtc-campaign" },
    });

    expect(screen.getByRole("button", { name: /SUBMIT LINK/ }).hasAttribute("disabled")).toBe(false);
  });
});

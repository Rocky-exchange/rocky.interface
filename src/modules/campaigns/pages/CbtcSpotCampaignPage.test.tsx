import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingui/react", () => ({
  useLingui: () => ({ i18n: { locale: "en" } }),
}));

vi.mock("@/modules/lighter/components/TopNav/TopNav", () => ({
  TopNav: () => <nav>Top Navigation</nav>,
}));

import CbtcSpotCampaignPage from "./CbtcSpotCampaignPage";

describe("CbtcSpotCampaignPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    document.documentElement.className = "";
    document.body.className = "";
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

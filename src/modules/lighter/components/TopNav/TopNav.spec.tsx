import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TopNav } from "./TopNav";

const cantonSession = vi.hoisted(() => ({
  connected: false,
  locked: false,
  username: "",
  party: "",
  avatar: "",
  provider: "",
}));

vi.mock("@lingui/react", () => ({
  Trans: ({ children, id, message }: { children?: ReactNode; id?: string; message?: string }) => (
    <>{children ?? message ?? id}</>
  ),
  useLingui: () => ({ i18n: { locale: "en" } }),
}));

vi.mock("@/modules/lighter/features/bonus/components/BonusBadge", () => ({
  BonusBadge: () => <span data-testid="bonus-badge" />,
}));

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));

vi.mock("@/shared/lib/canton-wallet/CantonFundsModal", () => ({
  CantonFundsModal: () => null,
}));

vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: () => cantonSession,
}));

vi.mock("@/shared/lib/i18n", () => ({
  dynamicActivate: vi.fn(),
}));

afterEach(() => {
  cleanup();
  Object.assign(cantonSession, {
    connected: false,
    locked: false,
    username: "",
    party: "",
    avatar: "",
    provider: "",
  });
});

describe("TopNav", () => {
  it("links Spot to the canonical public market route", () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Spot" }).getAttribute("href")).toBe("/spot/CBTC-CUSD");
  });

  it("opens the Campaigns menu on hover with Season 0 and CBTC activity links", () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Campaigns" }));

    expect(screen.getByRole("menuitem", { name: /Season 0/ }).getAttribute("href")).toBe("/campaigns/season-0");
    expect(screen.getByRole("menuitem", { name: /Rocky × CBTC Spot Campaign/ }).getAttribute("href")).toBe(
      "/campaigns/cbtc-spot"
    );
  });

  it("labels an existing Send session as sendwallet", () => {
    Object.assign(cantonSession, {
      connected: true,
      username: "cantonwallet-etouyang",
      party: "cantonwallet-etouyang::1220send",
      provider: "send",
    });

    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "sendwallet" })).toBeDefined();
  });
});

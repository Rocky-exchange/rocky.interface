import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TopNav } from "./TopNav";

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
  useCantonSession: () => ({ connected: false, username: "", party: "", avatar: "" }),
}));

vi.mock("@/shared/lib/i18n", () => ({
  dynamicActivate: vi.fn(),
}));

afterEach(cleanup);

describe("TopNav", () => {
  it("links Spot to the canonical public market route", () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Spot" }).getAttribute("href")).toBe("/spot/CBTC-USDA");
  });
});

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileSlideMenu } from "./MobileSlideMenu";

vi.mock("./BottomSheet", () => ({
  BottomSheet: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

afterEach(cleanup);

i18n.load("en", {});
i18n.activate("en");

describe("MobileSlideMenu", () => {
  it("links Spot to the public USDA route", () => {
    render(
      <I18nProvider i18n={i18n}>
        <MemoryRouter>
          <MobileSlideMenu open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </I18nProvider>
    );

    expect(screen.getByRole("link", { name: "Spot" }).getAttribute("href")).toBe("/spot/CBTC-USDA");
  });
});

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryHistory } from "history";
import type { PropsWithChildren } from "react";
import { Router } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MainRoutes } from "./MainRoutes";

vi.mock("@/modules/lighter/features/bonus/pages/BonusPage", () => ({
  BonusPage: () => <h1>Bonus route</h1>,
}));

vi.mock("@/modules/lighter/features/bonus/pages/RedeemCodePage", () => ({
  RedeemCodePage: () => <h1>Redeem route</h1>,
}));

vi.mock("@/modules/lighter/pages/LighterPortfolioPage", () => ({
  default: () => <h1>Portfolio route</h1>,
}));

vi.mock("@/modules/lighter/pages/LighterTradePage", () => ({
  default: () => <h1>Trade route</h1>,
}));

vi.mock("@/modules/lighter/components/TopNav/TopNav", () => ({
  TopNav: () => <nav data-testid="terminal-top-nav" />,
}));

vi.mock("@/modules/spot/pages/SpotTradePage", () => ({
  default: () => <h1>Spot route</h1>,
}));

vi.mock("@/modules/lighter/providers/LighterTradeRuntimeProviders", () => ({
  LighterTradeRuntimeProviders: ({ children }: PropsWithChildren) => (
    <section data-testid="lighter-runtime">{children}</section>
  ),
}));

vi.mock("@/modules/lighter/store/TradeStateContext/TradeStateContext", () => ({
  TradeStateProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/shared/components/RedirectWithQuery/RedirectWithQuery", async () => {
  const { Redirect } = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { RedirectWithQuery: ({ to }: { to: string }) => <Redirect to={to} /> };
});

function renderRoute(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const result = render(
    <Router history={history}>
      <MainRoutes openSettings={vi.fn()} />
    </Router>
  );

  return { ...result, history };
}

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MainRoutes bonus routes", () => {
  it.each([
    ["/bonus", "Bonus route"],
    ["/bonus/redeem", "Redeem route"],
  ])("recognizes the exact %s path inside Rocky runtime providers", async (path, heading) => {
    renderRoute(path);

    const runtime = await screen.findByTestId("lighter-runtime");
    expect(within(runtime).getByRole("heading", { name: heading })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Trade route" })).toBeNull();
  });

  it.each(["/bonus/unknown", "/bonus/redeem/extra"])("does not partially match %s", async (path) => {
    renderRoute(path);

    expect(await screen.findByRole("heading", { name: "Trade route" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: /Bonus route|Redeem route/ })).toBeNull();
  });
});

describe("MainRoutes trading terminal shell", () => {
  it("keeps the same header DOM node mounted between futures and spot routes", async () => {
    const { history } = renderRoute("/trade");
    const header = await screen.findByTestId("terminal-top-nav");

    act(() => history.push("/spot/CBTC-USDA"));

    expect(await screen.findByRole("heading", { name: "Spot route" })).not.toBeNull();
    expect(screen.getByTestId("terminal-top-nav")).toBe(header);
  });
});

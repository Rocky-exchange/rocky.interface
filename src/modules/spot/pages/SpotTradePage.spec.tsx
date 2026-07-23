import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { createMemoryHistory } from "history";
import { Router, Route } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import SpotTradePage from "./SpotTradePage";
import type { SpotMarket } from "../model/spotMarkets";
import { renderWithI18n as render } from "../test/renderWithI18n";

type MarketProps = { market?: SpotMarket };

function MarketProbe({ market, name }: MarketProps & { name: string }) {
  return (
    <div
      data-testid={`${name}-probe`}
      data-route-symbol={market?.routeSymbol ?? "missing"}
      data-api-symbol={market?.apiSymbol ?? "missing"}
    />
  );
}

vi.mock("@/modules/lighter/components/TopNav/TopNav", () => ({
  TopNav: () => <nav data-testid="top-nav" />,
}));

vi.mock("../api/spotSession", () => ({
  useSpotSession: vi.fn(),
}));

vi.mock("../components/SymbolBar/SymbolBar", () => ({
  SpotSymbolBar: (props: MarketProps) => <MarketProbe {...props} name="symbol-bar" />,
}));

vi.mock("../components/Chart/SpotChart", () => ({
  SpotChart: (props: MarketProps) => <MarketProbe {...props} name="chart" />,
}));

vi.mock("../components/BottomTabs/BottomTabs", () => ({
  SpotBottomTabs: (props: MarketProps) => <MarketProbe {...props} name="bottom-tabs" />,
}));

vi.mock("../components/OrderBook/OrderBook", () => ({
  SpotOrderBookPanel: (props: MarketProps) => <MarketProbe {...props} name="orderbook" />,
}));

vi.mock("../components/OrderForm/OrderForm", () => ({
  SpotOrderForm: (props: MarketProps) => <MarketProbe {...props} name="orderform" />,
}));

vi.mock("../components/Accounts/Accounts", () => ({
  SpotAccountsPanel: () => <section data-testid="spot-standalone-account" />,
}));

afterEach(cleanup);

function renderSpotRoute(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const replace = vi.spyOn(history, "replace");

  render(
    <Router history={history}>
      <Route path="/spot/:symbol?">
        <SpotTradePage />
      </Route>
    </Router>
  );

  return { history, replace };
}

describe("SpotTradePage", () => {
  it("uses the same primary and bottom panel skeleton as the futures terminal", () => {
    renderSpotRoute("/spot/CBTC-USDA");

    const primary = screen.getByTestId("spot-primary-workspace");
    const bottom = screen.getByTestId("spot-bottom-workspace");

    expect(within(primary).getByTestId("symbol-bar-probe")).not.toBeNull();
    expect(within(primary).getByTestId("chart-probe")).not.toBeNull();
    expect(within(primary).getByTestId("spot-orderbook-region")).not.toBeNull();
    expect(within(primary).getByTestId("spot-orderform-region")).not.toBeNull();
    expect(within(bottom).getByTestId("bottom-tabs-probe")).not.toBeNull();
    expect(within(bottom).getByTestId("spot-standalone-account")).not.toBeNull();
  });

  it("uses the futures market-header, favorites, and chart row order", () => {
    renderSpotRoute("/spot/CBTC-USDA");

    const workspace = screen.getByTestId("spot-market-workspace");
    const marketHeader = screen.getByTestId("symbol-bar-probe");
    const favorites = screen.getByTestId("spot-favorites-bar");
    const chartPanel = screen.getByTestId("spot-chart-workspace");

    expect(workspace.children).toHaveLength(3);
    expect(workspace.children[0]).toBe(marketHeader);
    expect(workspace.children[1]).toBe(favorites);
    expect(workspace.children[2]).toBe(chartPanel);
  });

  it("coordinates the routed market across the ZTDX trading workspace", () => {
    const history = createMemoryHistory({ initialEntries: ["/spot/CBTC-USDA"] });

    render(
      <Router history={history}>
        <Route path="/spot/:symbol?">
          <SpotTradePage />
        </Route>
      </Router>
    );

    const marketWorkspace = screen.getByTestId("spot-market-workspace");
    const orderbookRegion = screen.getByTestId("spot-orderbook-region");
    const orderformRegion = screen.getByTestId("spot-orderform-region");

    expect(marketWorkspace.compareDocumentPosition(orderbookRegion) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(orderbookRegion.compareDocumentPosition(orderformRegion) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    for (const child of ["symbol-bar", "chart", "bottom-tabs", "orderbook", "orderform"]) {
      const probe = screen.getByTestId(`${child}-probe`);
      expect(probe.getAttribute("data-route-symbol")).toBe("CBTC-USDA");
      expect(probe.getAttribute("data-api-symbol")).toBe("CBTC-USDA");
    }

    expect(screen.getByTestId("spot-standalone-account")).not.toBeNull();
  });

  it("links the selected Price tab to its labelled tabpanel", () => {
    renderSpotRoute("/spot/CBTC-USDA");

    const chartTab = screen.getByRole("tab", { name: "Price" });
    const chartPanel = screen.getByRole("tabpanel", { name: "Price" });

    expect(chartTab.getAttribute("id")).toBe("spot-chart-tab");
    expect(chartTab.getAttribute("aria-selected")).toBe("true");
    expect(chartTab.getAttribute("aria-controls")).toBe("spot-chart-panel");
    expect(chartPanel.getAttribute("id")).toBe("spot-chart-panel");
    expect(chartPanel.getAttribute("aria-labelledby")).toBe("spot-chart-tab");
  });

  it("keeps explicit local styles on every market-view tab", () => {
    renderSpotRoute("/spot/CBTC-USDA");

    const tablist = screen.getByRole("tablist", { name: "Market view" });
    const tabs = within(tablist).getAllByRole("tab");

    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      expect(tab.className).toContain("chartTab");
    }
  });

  it.each([
    ["case-insensitive CETH symbol", "/spot/ceth-usda", "/spot/CETH-USDA"],
    ["trimmed symbol", "/spot/%20CBTC-USDA%20", "/spot/CBTC-USDA"],
    ["missing symbol", "/spot", "/spot/CBTC-USDA"],
    ["lowercase public symbol", "/spot/cbtc-usda", "/spot/CBTC-USDA"],
    ["unknown symbol", "/spot/not-a-market", "/spot/CBTC-USDA"],
  ])("replaces the %s URL with its public canonical route", async (_name, path, canonicalPath) => {
    const { history, replace } = renderSpotRoute(path);

    await waitFor(() => expect(history.location.pathname).toBe(canonicalPath));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(canonicalPath);
  });

  it("leaves an already-canonical USDA URL unchanged without a redirect loop", async () => {
    const { history, replace } = renderSpotRoute("/spot/CBTC-USDA");

    await waitFor(() => expect(screen.getByTestId("symbol-bar-probe")).not.toBeNull());
    expect(history.location.pathname).toBe("/spot/CBTC-USDA");
    expect(replace).not.toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

vi.mock("../components/Chart/SpotDepthChart", () => ({
  SpotDepthChart: (props: MarketProps) => <MarketProbe {...props} name="depth-chart" />,
}));

vi.mock("../components/Chart/SpotMarketDetails", () => ({
  SpotMarketDetails: (props: MarketProps) => <MarketProbe {...props} name="market-details" />,
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
    renderSpotRoute("/spot/CBTC-CUSD");

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
    renderSpotRoute("/spot/CBTC-CUSD");

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
    const history = createMemoryHistory({ initialEntries: ["/spot/CBTC-CUSD"] });

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
      expect(probe.getAttribute("data-route-symbol")).toBe("CBTC-CUSD");
      expect(probe.getAttribute("data-api-symbol")).toBe("CBTC-CUSD");
    }

    expect(screen.getByTestId("spot-standalone-account")).not.toBeNull();
  });

  it("links the selected Price tab to its labelled tabpanel", () => {
    renderSpotRoute("/spot/CBTC-CUSD");

    const chartTab = screen.getByRole("tab", { name: "Price" });
    const chartPanel = screen.getByRole("tabpanel", { name: "Price" });

    expect(chartTab.getAttribute("id")).toBe("spot-chart-tab");
    expect(chartTab.getAttribute("aria-selected")).toBe("true");
    expect(chartTab.getAttribute("aria-controls")).toBe("spot-chart-panel");
    expect(chartPanel.getAttribute("id")).toBe("spot-chart-panel");
    expect(chartPanel.getAttribute("aria-labelledby")).toBe("spot-chart-tab");
  });

  it("removes Funding and switches between Price and Details", () => {
    renderSpotRoute("/spot/CBTC-CUSD");

    expect(screen.queryByRole("tab", { name: "Funding" })).toBeNull();

    const detailsTab = screen.getByRole("tab", { name: "Details" });
    fireEvent.click(detailsTab);

    expect(detailsTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Details" })).not.toBeNull();
    expect(screen.getByTestId("market-details-probe").getAttribute("data-api-symbol")).toBe("CBTC-CUSD");
    expect(screen.queryByRole("button", { name: "Depth" })).toBeNull();
  });

  it("switches the Price view between TradingView and spot depth", () => {
    renderSpotRoute("/spot/CBTC-CUSD");

    const tradingView = screen.getByRole("button", { name: "TradingView" });
    const depth = screen.getByRole("button", { name: "Depth" });

    expect(tradingView.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("chart-probe")).not.toBeNull();

    fireEvent.click(depth);

    expect(depth.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("chart-probe")).toBeNull();
    expect(screen.getByTestId("depth-chart-probe").getAttribute("data-route-symbol")).toBe("CBTC-CUSD");
  });

  it("opens the chart layout menu and renders the selected split layout", () => {
    renderSpotRoute("/spot/CBTC-CUSD");

    const layoutButton = screen.getByRole("button", { name: "Chart layout" });
    expect(layoutButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(layoutButton);

    expect(layoutButton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "2H" }));

    expect(layoutButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByTestId("chart-probe")).toHaveLength(2);
    expect(screen.getByTestId("spot-chart-grid").getAttribute("data-layout")).toBe("2H");
  });

  it("uses the chart workspace for the fullscreen action", () => {
    renderSpotRoute("/spot/CBTC-CUSD");

    const workspace = screen.getByTestId("spot-chart-workspace");
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(workspace, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("keeps explicit local styles on every market-view tab", () => {
    renderSpotRoute("/spot/CBTC-CUSD");

    const tablist = screen.getByRole("tablist", { name: "Market view" });
    const tabs = within(tablist).getAllByRole("tab");

    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      expect(tab.className).toContain("chartTab");
    }
  });

  it.each([
    ["case-insensitive CETH symbol", "/spot/ceth-cusd", "/spot/CETH-CUSD"],
    ["trimmed symbol", "/spot/%20CBTC-CUSD%20", "/spot/CBTC-CUSD"],
    ["missing symbol", "/spot", "/spot/CBTC-CUSD"],
    ["lowercase public symbol", "/spot/cbtc-cusd", "/spot/CBTC-CUSD"],
    ["unknown symbol", "/spot/not-a-market", "/spot/CBTC-CUSD"],
  ])("replaces the %s URL with its public canonical route", async (_name, path, canonicalPath) => {
    const { history, replace } = renderSpotRoute(path);

    await waitFor(() => expect(history.location.pathname).toBe(canonicalPath));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(canonicalPath);
  });

  it("leaves an already-canonical CUSD URL unchanged without a redirect loop", async () => {
    const { history, replace } = renderSpotRoute("/spot/CBTC-CUSD");

    await waitFor(() => expect(screen.getByTestId("symbol-bar-probe")).not.toBeNull());
    expect(history.location.pathname).toBe("/spot/CBTC-CUSD");
    expect(replace).not.toHaveBeenCalled();
  });
});

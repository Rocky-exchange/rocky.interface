import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryHistory } from "history";
import { Router, Route } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import SpotTradePage from "./SpotTradePage";
import type { SpotMarket } from "../model/spotMarkets";

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
      expect(probe.getAttribute("data-api-symbol")).toBe("CBTC-USDCX");
    }

    expect(screen.queryByTestId("spot-standalone-account")).toBeNull();
  });

  it.each([
    ["legacy CBTC API symbol", "/spot/CBTC-USDCX", "/spot/CBTC-USDA"],
    ["case-insensitive CETH API symbol", "/spot/ceth-usdcx", "/spot/CETH-USDA"],
    ["trimmed API symbol", "/spot/%20CBTC-USDCX%20", "/spot/CBTC-USDA"],
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

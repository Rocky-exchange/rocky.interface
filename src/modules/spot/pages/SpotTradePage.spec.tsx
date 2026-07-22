import { cleanup, render, screen } from "@testing-library/react";
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

    expect(screen.getByTestId("spot-market-workspace")).not.toBeNull();
    expect(screen.getByTestId("spot-orderbook-region")).not.toBeNull();
    expect(screen.getByTestId("spot-orderform-region")).not.toBeNull();

    for (const child of ["symbol-bar", "chart", "bottom-tabs", "orderbook", "orderform"]) {
      const probe = screen.getByTestId(`${child}-probe`);
      expect(probe.getAttribute("data-route-symbol")).toBe("CBTC-USDA");
      expect(probe.getAttribute("data-api-symbol")).toBe("CBTC-USDCX");
    }

    expect(screen.queryByTestId("spot-standalone-account")).toBeNull();
  });
});

import { useEffect } from "react";
import { Route, Switch, useLocation } from "react-router-dom";

import LighterPortfolioPage from "@/modules/lighter/pages/LighterPortfolioPage";
import LighterTradePage from "@/modules/lighter/pages/LighterTradePage";
import { LighterTradeRuntimeProviders } from "@/modules/lighter/providers/LighterTradeRuntimeProviders";
import { TradeStateProvider } from "@/modules/lighter/store/TradeStateContext/TradeStateContext";
import SpotTradePage from "@/modules/spot/pages/SpotTradePage";
import { RedirectWithQuery } from "@/shared/components/RedirectWithQuery/RedirectWithQuery";

export function MainRoutes({ openSettings: _openSettings }: { openSettings: () => void }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Switch>
      <Route exact path="/">
        <LighterTradeRuntimeProviders>
          <LighterPortfolioPage />
        </LighterTradeRuntimeProviders>
      </Route>

      <Route exact path="/trade/:tradeType?">
        <LighterTradeRuntimeProviders>
          <TradeStateProvider>
            <LighterTradePage />
          </TradeStateProvider>
        </LighterTradeRuntimeProviders>
      </Route>

      <Route exact path="/portfolio">
        <LighterTradeRuntimeProviders>
          <LighterPortfolioPage />
        </LighterTradeRuntimeProviders>
      </Route>

      {/* Spot trading — CBTC-USDA / CETH-USDA via rocky-backend /api/v3 */}
      <Route exact path="/spot/:symbol?">
        <SpotTradePage />
      </Route>

      <Route>
        <RedirectWithQuery to="/trade" />
      </Route>
    </Switch>
  );
}

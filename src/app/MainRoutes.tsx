import { useEffect } from "react";
import { Route, Switch, useLocation } from "react-router-dom";

import LighterExplorerPage from "@/modules/lighter/pages/LighterExplorerPage";
import LighterMiningPage from "@/modules/lighter/pages/LighterMiningPage";
import LighterPortfolioPage from "@/modules/lighter/pages/LighterPortfolioPage";
import LighterTradePage from "@/modules/lighter/pages/LighterTradePage";
import LighterVipPage from "@/modules/lighter/pages/LighterVipPage";
import { LighterTradeRuntimeProviders } from "@/modules/lighter/providers/LighterTradeRuntimeProviders";
import { TradeStateProvider } from "@/modules/lighter/store/TradeStateContext/TradeStateContext";
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

      <Route exact path="/mining">
        <LighterTradeRuntimeProviders>
          <LighterMiningPage />
        </LighterTradeRuntimeProviders>
      </Route>

      <Route exact path="/vip">
        <LighterTradeRuntimeProviders>
          <LighterVipPage />
        </LighterTradeRuntimeProviders>
      </Route>

      <Route exact path="/explorer">
        <LighterTradeRuntimeProviders>
          <LighterExplorerPage />
        </LighterTradeRuntimeProviders>
      </Route>

      <Route>
        <RedirectWithQuery to="/trade" />
      </Route>
    </Switch>
  );
}

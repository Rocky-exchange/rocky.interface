import { useEffect } from "react";
import { Route, Switch, useLocation } from "react-router-dom";

import LighterTradePage from "@/modules/lighter/pages/LighterTradePage";
import RockyInfoPage from "@/modules/lighter/pages/RockyInfoPage";
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
        <RedirectWithQuery to="/trade" />
      </Route>

      <Route exact path="/trade/:tradeType?">
        <LighterTradeRuntimeProviders>
          <TradeStateProvider>
            <LighterTradePage />
          </TradeStateProvider>
        </LighterTradeRuntimeProviders>
      </Route>

      <Route exact path={["/portfolio", "/mining", "/vip", "/explorer"]}>
        <LighterTradeRuntimeProviders>
          <RockyInfoPage />
        </LighterTradeRuntimeProviders>
      </Route>

      <Route>
        <RedirectWithQuery to="/trade" />
      </Route>
    </Switch>
  );
}

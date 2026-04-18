import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "react-router-dom";

import { SyntheticsStateContextProvider } from "context/SyntheticsStateContext/SyntheticsStateContextProvider";
import { X10000StateProvider } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import LighterExplorerPage from "@/modules/lighter/pages/LighterExplorerPage";
import LighterMiningPage from "@/modules/lighter/pages/LighterMiningPage";
import LighterPortfolioPage from "@/modules/lighter/pages/LighterPortfolioPage";
import LighterTradePage from "@/modules/lighter/pages/LighterTradePage";
import LighterVipPage from "@/modules/lighter/pages/LighterVipPage";

export function MainRoutes(_props: { openSettings: () => void }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Switch>
      <Route exact path="/">
        <X10000StateProvider>
          <SyntheticsStateContextProvider skipLocalReferralCode={false} pageType="x10000trade">
            <LighterTradePage />
          </SyntheticsStateContextProvider>
        </X10000StateProvider>
      </Route>
      <Route exact path="/trade/:tradeType?">
        <X10000StateProvider>
          <SyntheticsStateContextProvider skipLocalReferralCode={false} pageType="x10000trade">
            <LighterTradePage />
          </SyntheticsStateContextProvider>
        </X10000StateProvider>
      </Route>
      <Route exact path="/portfolio">
        <LighterPortfolioPage />
      </Route>
      <Route exact path="/mining">
        <LighterMiningPage />
      </Route>
      <Route exact path="/vip">
        <LighterVipPage />
      </Route>
      <Route exact path="/explorer">
        <LighterExplorerPage />
      </Route>
      <Route path="*">
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

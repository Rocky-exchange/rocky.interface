import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "react-router-dom";

import { SyntheticsStateContextProvider } from "context/SyntheticsStateContext/SyntheticsStateContextProvider";
import { X10000StateProvider } from "@/modules/cex/store/X10000StateContext/X10000StateContext";
import LighterTradePage from "@/modules/lighter/pages/LighterTradePage";

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
      <Route path="*">
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

import { useCallback } from "react";
import { useHistory, useLocation } from "react-router-dom";

import { useTradingAccountModalOpen } from "@/modules/lighter/context/TradingAccountContext";
import { useSettings } from "@/modules/lighter/context/SettingsContext";
import { notifyCantonSessionChange } from "@/shared/lib/canton-wallet/useCantonSession";
import { userAnalytics } from "lib/userAnalytics";
import { DisconnectWalletEvent } from "lib/userAnalytics/types";
import { logout as apiLogout } from "modules/lighter/api/custom/client";
import { disconnectAllWebSockets } from "modules/lighter/api/custom/websocket";

export function useDisconnectAndClose() {
  const { setIsSettingsVisible } = useSettings();
  const [, setIsVisible] = useTradingAccountModalOpen();
  const history = useHistory();
  const location = useLocation();

  const handleDisconnect = useCallback(async () => {
    // Clean up WebSocket connections first to prevent "CLOSING or CLOSED" errors
    disconnectAllWebSockets();

    // Clear API auth tokens
    apiLogout();
    [
      "rocky_exchange_session",
      "rocky_user_id",
      "rocky_binding_id",
      "mtc_token",
      "mtc_party",
      "mtc_username",
      "mtc_avatar",
      "mtc_email",
      "mtc_login_method",
    ].forEach((key) => localStorage.removeItem(key));
    notifyCantonSessionChange();

    userAnalytics.pushEvent<DisconnectWalletEvent>({
      event: "ConnectWalletAction",
      data: {
        action: "Disconnect",
      },
    });
    setIsVisible(false);
    setIsSettingsVisible(false);

    // If on accounts page, redirect to /accounts to show connect wallet prompt
    if (location.pathname.startsWith("/accounts")) {
      setTimeout(() => {
        history.push("/accounts");
      }, 1000);
    }
  }, [setIsVisible, setIsSettingsVisible, history, location]);

  return handleDisconnect;
}

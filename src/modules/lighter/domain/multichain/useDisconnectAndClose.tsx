import { useCallback } from "react";
import { useHistory, useLocation } from "react-router-dom";

import { useSettings } from "@/modules/lighter/context/SettingsContext";
import { useTradingAccountModalOpen } from "@/modules/lighter/context/TradingAccountContext";
import { disconnectCantonWalletSession } from "@/shared/lib/canton-wallet/sessionLogout";
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

    await disconnectCantonWalletSession();
    apiLogout();

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

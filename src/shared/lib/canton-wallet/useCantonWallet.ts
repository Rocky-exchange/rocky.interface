import { useCallback, useState } from "react";

import {
  connectLoopWallet,
  connectConsoleWallet,
  connectRockyWallet,
  createExchangeSession,
  type ConnectedWallet,
} from "./index";
import { hydrateOwnProfile } from "./profile";
import { notifyCantonSessionChange } from "./useCantonSession";

export function useCantonWallet() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (provider: "rocky" | "loop" | "console") => {
    setConnecting(true);
    setError(null);
    try {
      let w: ConnectedWallet;
      if (provider === "rocky") {
        w = await connectRockyWallet();
      } else if (provider === "loop") {
        w = await connectLoopWallet();
      } else {
        w = await connectConsoleWallet();
      }
      await createExchangeSession(w.connection, w.signMessage);
      notifyCantonSessionChange();
      await hydrateOwnProfile();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "connect failed");
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    [
      "rocky_exchange_session",
      "rocky_user_id",
      "rocky_binding_id",
      "rocky_perp_user_id",
      "rocky_perp_user_id_for",
      "mtc_token",
      "mtc_party",
      "mtc_username",
      "mtc_avatar",
      "mtc_email",
      "mtc_login_method",
    ].forEach((k) => localStorage.removeItem(k));
    notifyCantonSessionChange();
  }, []);

  return { connect, disconnect, connecting, error };
}

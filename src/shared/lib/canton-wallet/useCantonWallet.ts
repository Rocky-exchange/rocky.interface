import { useCallback, useState } from "react";

import {
  connectLoopWallet,
  connectConsoleWallet,
  connectRockyWallet,
  createExchangeSession,
  type ConnectedWallet,
} from "./index";
import { hydrateOwnProfile } from "./profile";
import { disconnectCantonWalletSession } from "./sessionLogout";
import { setCantonWalletLocked } from "./sessionStore";
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

  const disconnect = useCallback(() => disconnectCantonWalletSession(), []);

  const unlock = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const currentParty = typeof window !== "undefined" ? localStorage.getItem("mtc_party") || "" : "";
      const wallet = await connectRockyWallet();
      if (!currentParty || wallet.connection.partyId !== currentParty) {
        await disconnectCantonWalletSession();
        throw new Error("Rocky Wallet active account does not match the logged-in party");
      }
      setCantonWalletLocked(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "unlock failed");
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  return { connect, disconnect, unlock, connecting, error };
}

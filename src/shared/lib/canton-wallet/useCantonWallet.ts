import { useCallback, useState } from "react";
import { connectLoopWallet, connectConsoleWallet, createExchangeSession } from "./index";
import { notifyCantonSessionChange } from "./useCantonSession";

export function useCantonWallet() {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (provider: "loop" | "console") => {
    setConnecting(true);
    setError(null);
    try {
      const w = provider === "loop" ? await connectLoopWallet() : await connectConsoleWallet();
      await createExchangeSession(w.connection, w.signMessage);
      notifyCantonSessionChange();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "connect failed");
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    ["rocky_exchange_session", "rocky_user_id", "rocky_binding_id", "mtc_party", "mtc_username", "mtc_email", "mtc_login_method"].forEach(
      (k) => localStorage.removeItem(k),
    );
    notifyCantonSessionChange();
  }, []);

  return { connect, disconnect, connecting, error };
}

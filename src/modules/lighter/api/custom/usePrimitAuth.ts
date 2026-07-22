import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";

import { getMtcAuthToken } from "@/shared/lib/canton-wallet/session";
import { disconnectCantonWalletSession } from "@/shared/lib/canton-wallet/sessionLogout";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

import type { LoginResponse } from "../types";

export interface PrimitAuthState {
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  error: string | null;
  token: string | null;
}

export interface UsePrimitAuthReturn extends PrimitAuthState {
  authenticate: () => Promise<LoginResponse | null>;
  logout: () => void;
  clearError: () => void;
}

export function usePrimitAuth(): UsePrimitAuthReturn {
  const { mutate } = useSWRConfig();
  const cantonSession = useCantonSession();
  const token = cantonSession.token || getMtcAuthToken() || null;
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = useCallback(async (): Promise<LoginResponse | null> => {
    setIsAuthenticating(true);
    setError(null);

    const currentToken = getMtcAuthToken();
    setIsAuthenticating(false);

    if (!currentToken) {
      setError("Canton wallet session required");
      return null;
    }

    return {
      token: currentToken,
      expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    };
  }, []);

  const logout = useCallback(() => {
    void disconnectCantonWalletSession();
    mutate(() => true, undefined, { revalidate: false });
  }, [mutate]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isAuthenticated: Boolean(token),
    isAuthenticating,
    error,
    token,
    authenticate,
    logout,
    clearError,
  };
}

export default usePrimitAuth;

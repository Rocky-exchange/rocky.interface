import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";

import { getMtcAuthToken } from "@/shared/lib/canton-wallet/session";
import { notifyCantonSessionChange, useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";

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

function clearCantonSession() {
  if (typeof window === "undefined") return;
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
    clearCantonSession();
    notifyCantonSessionChange();
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

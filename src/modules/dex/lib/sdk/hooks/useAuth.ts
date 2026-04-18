/**
 * Authentication Hook
 */

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { loginWithWallet, logout as apiLogout, restoreSession } from '../api/rest/auth';

export interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
}

export function useAuth(): UseAuthReturn {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    const restored = restoreSession();
    setIsAuthenticated(restored);
  }, []);

  // Login with wallet
  const login = useCallback(async () => {
    if (!address || !isConnected) {
      setError('Wallet not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await loginWithWallet(address, async (message) => {
        return signMessageAsync({ message });
      });
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected, signMessageAsync]);

  // Logout
  const logout = useCallback(() => {
    apiLogout();
    setIsAuthenticated(false);
  }, []);

  // Auto-logout on wallet disconnect
  useEffect(() => {
    if (!isConnected && isAuthenticated) {
      logout();
    }
  }, [isConnected, isAuthenticated, logout]);

  return {
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
  };
}

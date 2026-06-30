import { t } from "@lingui/macro";
import { useCallback, useState } from "react";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";

import {
  bindReferralCode,
  claimReferralReward,
  createReferralCode,
  getClaimableReferralAmount,
  getOnChainReferralDashboard,
  isAuthenticated,
} from "./client";
import type {
  BindReferralCodeResponse,
  ClaimableResponse,
  ClaimReferralResponse,
  CreateReferralCodeResponse,
  OnChainDashboardResponse,
} from "../types";

function useCantonAccountKey() {
  const { connected, party, username } = useCantonSession();
  return connected ? party || username || "canton-session" : undefined;
}

function normalizeBindReferralErrorMessage(err: unknown): string {
  const rawMessage = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const normalizedMessage = rawMessage.toLowerCase();

  if (
    rawMessage.includes("不能使用自己的推荐码") ||
    rawMessage.includes("不能使用自己的邀请码") ||
    normalizedMessage.includes("your own referral code") ||
    normalizedMessage.includes("your own invite code")
  ) {
    return t`You cannot use your own referral code.`;
  }

  if (
    rawMessage.includes("已绑定推荐码") ||
    rawMessage.includes("已经绑定推荐码") ||
    normalizedMessage.includes("already bound a referral code")
  ) {
    return t`You have already bound a referral code.`;
  }

  return rawMessage || t`Failed to bind referral code`;
}

export function useCreateReferralCode() {
  const { chainId } = useChainId();
  const accountKey = useCantonAccountKey();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (): Promise<CreateReferralCodeResponse | null> => {
    if (!accountKey || !chainId) {
      setError("Canton wallet not connected");
      return null;
    }

    if (!isAuthenticated(accountKey, chainId)) {
      setError("Please sign in first to create a referral code");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await createReferralCode(chainId, {
        signature: "canton-session",
        timestamp: Math.floor(Date.now() / 1000),
      });

      helperToast.success(t`Referral code created successfully!`);
      return response;
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to create referral code";
      setError(errorMessage);
      helperToast.error(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [accountKey, chainId]);

  return { create, loading, error };
}

export function useBindReferralCode() {
  const { chainId } = useChainId();
  const accountKey = useCantonAccountKey();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bind = useCallback(
    async (code: string): Promise<BindReferralCodeResponse | null> => {
      if (!accountKey || !chainId) {
        setError("Canton wallet not connected");
        return null;
      }

      if (!code || code.trim().length === 0) {
        setError("Referral code is required");
        return null;
      }

      if (!isAuthenticated(accountKey, chainId)) {
        setError("Please sign in first to bind a referral code");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await bindReferralCode(chainId, {
          code: code.toUpperCase().trim(),
          signature: "canton-session",
          timestamp: Math.floor(Date.now() / 1000),
        });

        helperToast.success(t`Referral code bound successfully!`);
        return response;
      } catch (err: any) {
        const errorMessage = normalizeBindReferralErrorMessage(err);
        setError(errorMessage);
        helperToast.error(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [accountKey, chainId]
  );

  return { bind, loading, error };
}

export function useClaimReferralReward() {
  const { chainId } = useChainId();
  const accountKey = useCantonAccountKey();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claim = useCallback(async (): Promise<ClaimReferralResponse | null> => {
    if (!chainId) {
      setError("Chain ID not available");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await claimReferralReward(chainId, { address: accountKey });
      helperToast.success(`Successfully claimed ${response.amount} USDT!`);
      return response;
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to claim referral reward";
      setError(errorMessage);
      helperToast.error(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [chainId, accountKey]);

  return { claim, loading, error };
}

export function useOnChainReferralDashboard(address?: string) {
  const { chainId } = useChainId();
  const accountKey = useCantonAccountKey();
  const requestedAddress = address ?? accountKey;
  const [data, setData] = useState<OnChainDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!chainId || !requestedAddress) {
      setError("Chain ID or account not available");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getOnChainReferralDashboard(chainId, requestedAddress);
      setData(response);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch on-chain referral dashboard");
    } finally {
      setLoading(false);
    }
  }, [chainId, requestedAddress]);

  return { data, loading, error, fetch };
}

export function useClaimableReferralAmount(address?: string) {
  const { chainId } = useChainId();
  const accountKey = useCantonAccountKey();
  const requestedAddress = address ?? accountKey;
  const [data, setData] = useState<ClaimableResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!chainId || !requestedAddress) {
      setError("Chain ID or account not available");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getClaimableReferralAmount(chainId, requestedAddress);
      setData(response);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch claimable amount");
    } finally {
      setLoading(false);
    }
  }, [chainId, requestedAddress]);

  return { data, loading, error, fetch };
}

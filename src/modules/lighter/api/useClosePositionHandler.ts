import { t } from "@lingui/macro";
import { useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";

import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
import { useChainId } from "lib/chains";
import { helperToast } from "lib/helperToast";

import { closePosition, type CreateOrderResponse } from "./custom/client";
import { shouldUseApiOrderSubmit } from "./custom/usePrimitOrderSubmit";
import type { ClosePositionRequest } from "./types";

export interface UseClosePositionHandlerResult {
  closePositionViaApi: (positionId: string, request?: ClosePositionRequest) => Promise<CreateOrderResponse>;
  isApiEnabled: boolean;
  isReady: boolean;
}

export function useClosePositionHandler(): UseClosePositionHandlerResult {
  const { chainId } = useChainId();
  const cantonSession = useCantonSession();
  const accountKey = useMemo(
    () => (cantonSession.connected ? cantonSession.party || cantonSession.username || "canton-session" : undefined),
    [cantonSession.connected, cantonSession.party, cantonSession.username]
  );
  const { mutate } = useSWRConfig();
  const isApiEnabled = shouldUseApiOrderSubmit();
  const isReady = isApiEnabled && cantonSession.connected;

  const closePositionViaApi = useCallback(
    async (positionId: string, request?: ClosePositionRequest): Promise<CreateOrderResponse> => {
      if (!accountKey) {
        helperToast.error(t`Please connect your wallet and sign in first`);
        throw new Error("Canton wallet session required");
      }

      try {
        const response = await closePosition(chainId, positionId, request, accountKey);
        helperToast.success(t`Position close order submitted`);
        mutate(["api-positions", chainId, accountKey]);
        return response;
      } catch (error: any) {
        if (error?.status === 409 && error?.errorData?.code === "POSITION_NOT_OPEN") {
          mutate(["api-positions", chainId, accountKey]);
          const hint = error.errorData?.reason_hint;
          const msg =
            hint === "tp_sl"
              ? t`Position was already closed by your take-profit / stop-loss order`
              : hint === "liquidated"
                ? t`Position was liquidated`
                : t`Position has already been closed`;
          helperToast.error(msg);
        } else {
          helperToast.error(error?.message || "Failed to close position");
        }
        throw error;
      }
    },
    [accountKey, chainId, mutate]
  );

  return {
    closePositionViaApi,
    isApiEnabled,
    isReady,
  };
}

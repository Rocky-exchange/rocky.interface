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
  closePositionViaApi: (positionId: string, request: ClosePositionRequest) => Promise<CreateOrderResponse>;
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
    // request is now required: closing a position means submitting a real
    // opposing order (see custom/client.ts::closePosition), which needs the
    // position's symbol/side/qty/markPrice -- there's no backend "close by
    // id" endpoint to fall back on partial info.
    async (positionId: string, request: ClosePositionRequest): Promise<CreateOrderResponse> => {
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
        // NOTE: the previous 409/POSITION_NOT_OPEN handling here assumed the
        // fake close-by-id endpoint's error contract. Closing is now a
        // regular order submission via POST /v1/orders, so its error shape
        // is whatever createOrder/apiFetch already surfaces (e.g. insufficient
        // balance) -- no position-close-specific error code to special-case.
        helperToast.error(error?.message || "Failed to close position");
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

import { useCallback, useRef, useState } from "react";

import { BonusOrderRejectedError } from "../../bonus/api/useBonusOrderGate";

type OrderGateParams = {
  symbol: string;
  side: "buy" | "sell";
  isOpening: boolean;
  marginMode: string;
};

export function useOrderGate(_params: OrderGateParams) {
  const [checking, setChecking] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const clearRejection = useCallback(() => setRejection(null), []);
  const runGated = useCallback(async <T>(submit: () => T | Promise<T>): Promise<T | undefined> => {
    if (inFlightRef.current) return undefined;

    inFlightRef.current = true;
    setRejection(null);
    setChecking(true);
    try {
      return await submit();
    } catch (error) {
      if (error instanceof BonusOrderRejectedError) {
        setRejection(error.message);
        return undefined;
      }
      throw error;
    } finally {
      inFlightRef.current = false;
      setChecking(false);
    }
  }, []);

  return {
    checking,
    rejection,
    clearRejection,
    runGated,
  };
}

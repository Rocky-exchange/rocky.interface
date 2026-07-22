import { useCallback } from "react";

import { checkBonusOrder } from "./bonus.api";
import type { CheckBonusOrderInput } from "./bonus.types";

export class BonusOrderRejectedError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BonusOrderRejectedError";
  }
}

export function useBonusOrderGate() {
  const checkOpeningOrder = useCallback(async (input: CheckBonusOrderInput) => {
    try {
      const result = await checkBonusOrder(input);
      if (result.decision === "reject") {
        throw new BonusOrderRejectedError(
          result.reason_code || "bonus_order_rejected",
          result.message || "Order is not allowed for trial funds"
        );
      }
    } catch (error) {
      if (error instanceof BonusOrderRejectedError) throw error;
      // eslint-disable-next-line no-console
      console.warn("Bonus order precheck unavailable; ledger will enforce policy");
    }
  }, []);

  return { checkOpeningOrder };
}

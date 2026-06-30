import { describe, expect, it } from "vitest";

import { parseError } from "lib/errors";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function makeError(message: string, code: string, extra: Record<string, unknown>) {
  return Object.assign(new Error(message), {
    code,
    ...extra,
  });
}

describe("wallet transaction errors", () => {
  it("should handle user rejected transaction", () => {
    const error = makeError("User denied transaction signature", "ACTION_REJECTED", {
      action: "sendTransaction",
      reason: "rejected",
    });

    const result = parseError(error);

    expect(result).toEqual(
      expect.objectContaining({
        errorMessage: expect.stringContaining("User denied transaction"),
        isUserRejectedError: true,
        isUserError: true,
        errorDepth: 0,
      })
    );
  });

  it("should handle insufficient funds", () => {
    const error = makeError("insufficient funds for gas", "INSUFFICIENT_FUNDS", {
      transaction: {
        to: ZERO_ADDRESS,
        data: "0x",
        value: 100n,
      },
    });

    const result = parseError(error);

    expect(result).toEqual(
      expect.objectContaining({
        errorMessage: expect.stringContaining("insufficient funds"),
        isUserError: true,
        errorGroup: "Txn Error: NOT_ENOUGH_FUNDS",
        isUserRejectedError: false,
        errorDepth: 0,
      })
    );
  });

  it("should handle contract execution errors", () => {
    const txErrorData =
      "0x5dac504d0000000000000000000000000000000000000000000000000096d37eb9edae200000000000000000000000000000000000000000000000000096c6d0c2c84380";
    const error = makeError("execution reverted (unknown custom error)", "CALL_EXCEPTION", {
      transaction: {
        to: ZERO_ADDRESS,
        data: "0x",
      },
      data: txErrorData,
      action: "call",
      reason: null,
      invocation: null,
      revert: null,
    });

    const result = parseError(error);

    expect(result).toEqual(
      expect.objectContaining({
        errorMessage: expect.stringContaining("execution reverted"),
        contractError: undefined,
        contractErrorArgs: undefined,
        txErrorData,
        isUserError: false,
        errorDepth: 0,
      })
    );
  });
});

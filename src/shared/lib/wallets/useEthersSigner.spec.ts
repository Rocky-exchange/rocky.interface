import { describe, expect, it } from "vitest";

import { clientToSigner, useEthersSigner } from "./useEthersSigner";

describe("clientToSigner", () => {
  it("rejects EVM signer conversion in the Canton runtime", () => {
    expect(() => clientToSigner({} as any, "0x0000000000000000000000000000000000000000")).toThrow(
      "EVM signer conversion is disabled"
    );
  });
});

describe("useEthersSigner", () => {
  it("does not expose an EVM signer", () => {
    expect(useEthersSigner()).toBeUndefined();
  });
});

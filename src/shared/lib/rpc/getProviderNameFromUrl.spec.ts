import { describe, expect, it } from "vitest";

import { getProviderNameFromUrl } from "./getProviderNameFromUrl";

describe("getProviderNameFromUrl", () => {
  it("should return the provider name from the URL", () => {
    const inputsAndOutputs: { input: string; output: string }[] = [
      { input: "https://rpc.canton.example/v1", output: "rpc.canton.example" },
      { input: "https://node-a.canton.example", output: "node-a.canton.example" },
      { input: "https://provider.example/rpc", output: "provider.example/rpc" },
      { input: "https://network.g.alchemy.com/v2/SECRET_CODE", output: "network.g.alchemy.com" },
    ];

    for (const { input, output } of inputsAndOutputs) {
      const providerName = getProviderNameFromUrl(input);
      expect(providerName).toBe(output);
    }
  });
});

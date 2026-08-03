import { afterEach, describe, expect, it, vi } from "vitest";

import { swapApi, SwapApiError } from "./swapClient";

describe("swapApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves Binance-compatible msg errors returned by a misrouted upstream", async () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue("") });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: -2014, msg: "API-key format invalid." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(swapApi.capacity("CC-CUSD", "BUY", 50)).rejects.toEqual(
      new SwapApiError(400, "-2014", "API-key format invalid.")
    );
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ connected: true, party: "party-alice" }));

vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: () => session,
}));

vi.mock("@/shared/lib/canton-wallet/session", () => ({
  exchangeSessionHeaders: () => ({ Authorization: "Bearer exchange-token" }),
}));

import { useSpotSession } from "./spotSession";

function SessionProbe() {
  const state = useSpotSession();
  return <div>{state.ready ? "ready" : state.err || "loading"}</div>;
}

describe("useSpotSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("authenticates session-key minting with the exchange session bearer", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ userId: "user-1", key: "spot-key", secret: "spot-secret" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SessionProbe />);
    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v3/session-key",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer exchange-token" }),
      })
    );
  });
});

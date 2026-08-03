import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveUserProfiles } from "./profile";

describe("resolveUserProfiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves a leaderboard page in one batch and maps the public profile contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          profiles: {
            "user-1": {
              address: "rockywallet-joe::party",
              provider: "rocky",
              display_name: "Joe",
              avatar: null,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(resolveUserProfiles(["user-1", "user-1"])).resolves.toEqual({
      "user-1": {
        address: "rockywallet-joe::party",
        provider: "rocky",
        displayName: "Joe",
        avatar: "",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/profile/users",
      expect.objectContaining({ body: JSON.stringify({ user_ids: ["user-1"] }) }),
    );
  });

  it("fails open when profile resolution is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(resolveUserProfiles(["user-1"])).resolves.toEqual({});
  });
});

import { describe, expect, it } from "vitest";

import { TOAST_AUTO_CLOSE_TIME } from "./ui";

describe("global toast lifetime", () => {
  it("automatically closes bottom-right notifications after five seconds", () => {
    expect(TOAST_AUTO_CLOSE_TIME).toBe(5_000);
  });
});

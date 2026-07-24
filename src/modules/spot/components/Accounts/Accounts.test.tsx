import { describe, expect, it } from "vitest";

import { TRANSFER_ASSETS } from "./Accounts";

describe("spot/contract account transfer", () => {
  it("allows only CUSD to move between isolated accounts", () => {
    expect(TRANSFER_ASSETS).toEqual(["CUSD"]);
  });
});

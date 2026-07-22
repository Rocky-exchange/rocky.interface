import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CantonFundsModal source", () => {
  it("does not render the USDA controls panel", () => {
    const source = readFileSync(join(process.cwd(), "src/shared/lib/canton-wallet/CantonFundsModal.tsx"), "utf8");

    expect(source).not.toContain("USDA Controls");
    expect(source).not.toContain("Authorize USDA");
    expect(source).not.toContain("Accept USDA offers");
  });

  it("loads persisted funds history when refreshing the wallet dashboard", () => {
    const source = readFileSync(join(process.cwd(), "src/shared/lib/canton-wallet/CantonFundsModal.tsx"), "utf8");

    expect(source).toContain("fetchCantonFundsHistory");
    expect(source).toContain("refreshFundsHistory");
    expect(source).toContain("setLocalHistory");
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const THEME_DIVIDER =
  "border-bottom: 1px solid color-mix(in srgb, var(--rocky-theme-accent, #f5a85f) 50%, transparent);";

const orderBookStyles = readFileSync("src/modules/spot/components/OrderBook/OrderBook.module.scss", "utf8");
const accountStyles = readFileSync("src/modules/spot/components/Accounts/Accounts.module.scss", "utf8");

describe("Spot panel divider styles", () => {
  it("matches the futures order-book column header without an accent divider", () => {
    expect(orderBookStyles).not.toContain(THEME_DIVIDER);
  });

  it("matches the futures Assets table neutral divider", () => {
    expect(accountStyles).not.toContain(THEME_DIVIDER);
    expect(accountStyles).toContain("border-bottom: 1px solid #20222a;");
  });
});

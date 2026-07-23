import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/modules/spot/pages/SpotTradePage.module.scss", "utf8");

describe("SpotTradePage chart mode styles", () => {
  it("declares the active mode after the base mode so the highlight wins the cascade", () => {
    const baseModeRule = styles.indexOf(".chartMode {");
    const activeModeRule = styles.indexOf(".chartModeActive");

    expect(baseModeRule).toBeGreaterThan(-1);
    expect(activeModeRule).toBeGreaterThan(baseModeRule);
  });
});

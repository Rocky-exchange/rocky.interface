import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetBadge } from "@/modules/spot/components/SymbolBar/MarketDropdown";

vi.mock("@/shared/components/TokenIcon/TokenIcon", () => ({
  default: ({ symbol, displaySize, imageUrl }: { symbol: string; displaySize: number; imageUrl?: string }) => (
    <img src={imageUrl ?? `${symbol}.svg`} alt={symbol} width={displaySize} height={displaySize} />
  ),
}));

const testDirectory = dirname(fileURLToPath(import.meta.url));
const topNavCss = readFileSync(resolve(testDirectory, "TopNav.module.scss"), "utf8");
const marketDropdownCss = readFileSync(
  resolve(testDirectory, "../../../spot/components/SymbolBar/MarketDropdown.module.scss"),
  "utf8"
);

afterEach(cleanup);

describe("shared Spot and Futures header visuals", () => {
  it("uses the same 20px market icon size as the Futures selector", () => {
    render(<AssetBadge symbol="CBTC" iconUrl="/v1/token-icons/CBTC" />);

    const icon = screen.getByRole("img", { name: "CBTC" });
    expect(icon.getAttribute("width")).toBe("20");
    expect(icon.getAttribute("height")).toBe("20");
  });

  it.each(["CBTC", "cETH", "CC"])("uses the backend artwork for the Spot %s market", (symbol) => {
    const iconUrl = `/v1/token-icons/${symbol.toUpperCase()}`;
    render(<AssetBadge symbol={symbol} iconUrl={iconUrl} />);

    expect(screen.getByRole("img", { name: symbol }).getAttribute("src")).toBe(iconUrl);
  });

  it("pins route-stable header typography to the shared Primit font", () => {
    expect(topNavCss).toContain("font-family: var(--primit-font-body, var(--ltr-font-family));");
    expect(marketDropdownCss).toMatch(
      /\.symbolHandle\s*\{[\s\S]*font-family:\s*var\(--primit-font-body,\s*var\(--ltr-font-family\)\)/
    );
    expect(marketDropdownCss).toMatch(/\.triggerName\s*\{[\s\S]*line-height:\s*16px/);
  });

  it("replaces the browser focus border with the terminal underline treatment", () => {
    expect(topNavCss).toMatch(/\.link\s*\{[\s\S]*&:focus-visible\s*\{[\s\S]*outline:\s*none/);
    expect(topNavCss).toMatch(/\.link\s*\{[\s\S]*&:focus-visible\s*\{[\s\S]*box-shadow:\s*inset 0 -1px/);
  });
});

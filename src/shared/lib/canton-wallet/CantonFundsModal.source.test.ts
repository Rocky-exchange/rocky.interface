import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));

describe("CantonFundsModal source", () => {
  it("uses the CUSD asset icon instead of the legacy USDCx icon", () => {
    const source = readFileSync(join(fixtureDirectory, "CantonFundsModal.tsx"), "utf8");

    expect(source).toContain('import cusdIconSrc from "./token-icons/CUSD.png";');
    expect(source).not.toContain('./token-icons/USDCx.webp');
  });

  it("does not render the CUSD controls panel", () => {
    const source = readFileSync(join(fixtureDirectory, "CantonFundsModal.tsx"), "utf8");

    expect(source).not.toContain("CUSD Controls");
    expect(source).not.toContain("Authorize CUSD");
    expect(source).not.toContain("Accept CUSD offers");
  });

  it("loads persisted funds history when refreshing the wallet dashboard", () => {
    const source = readFileSync(join(fixtureDirectory, "CantonFundsModal.tsx"), "utf8");

    expect(source).toContain("fetchCantonFundsHistory");
    expect(source).toContain("refreshFundsHistory");
    expect(source).toContain("setLocalHistory");
  });

  it("keeps assets and operation pages in one stable modal shell", () => {
    const styles = readFileSync(join(fixtureDirectory, "CantonFundsModal.module.scss"), "utf8");
    const operationModalBlock = styles.match(/\.modal\.operationModal\s*\{([\s\S]*?)\}/)?.[1] || "";

    expect(styles).toContain("width: min(480px, calc(100vw - 32px));");
    expect(styles).toContain("height: min(680px, calc(100vh - 32px));");
    expect(operationModalBlock).not.toMatch(/(?:^|\n)\s*height:\s*auto;/);
  });
});

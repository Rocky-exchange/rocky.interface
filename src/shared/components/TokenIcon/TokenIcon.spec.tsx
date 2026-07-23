import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("config/icons", () => ({
  CHAIN_ID_TO_NETWORK_ICON: {},
}));
vi.mock("lib/legacy", () => ({
  tryImportImage: (name: string) => (name === "ic_btc.svg" || name === "ic_eth.svg" ? `/assets/${name}` : undefined),
}));

import TokenIcon from "./TokenIcon";

afterEach(cleanup);

describe("TokenIcon", () => {
  it.each(["BTC", "ETH"])("renders a real generic market icon for %s", (symbol) => {
    const { container, getByRole } = render(<TokenIcon symbol={symbol} displaySize={16} />);

    expect(getByRole("img", { name: symbol })).toBeTruthy();
    expect(container.querySelector('[data-qa="token-icon-fallback"]')).toBeNull();
  });

  it("prefers the icon URL returned by the backend", () => {
    const { getByRole } = render(
      <TokenIcon symbol="CBTC" imageUrl="/v1/token-icons/CBTC" displaySize={20} />
    );

    expect(getByRole("img", { name: "CBTC" }).getAttribute("src")).toBe("/v1/token-icons/CBTC");
  });
});

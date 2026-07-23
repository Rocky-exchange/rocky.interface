import { cleanup, fireEvent, render } from "@testing-library/react";
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

  it("reserves icon space without rendering a letter while the URL is loading", () => {
    const { container } = render(<TokenIcon symbol="CBTC" displaySize={20} loading />);

    expect(container.querySelector('[data-qa="token-icon-placeholder"]')).not.toBeNull();
    expect(container.querySelector('[data-qa="token-icon-fallback"]')).toBeNull();
  });

  it("keeps backend image text hidden until the image has loaded", () => {
    const { getByRole } = render(
      <TokenIcon symbol="CBTC" imageUrl="/v1/token-icons/CBTC" displaySize={20} />
    );
    const image = getByRole("img", { name: "CBTC" });

    expect(image.classList.contains("opacity-0")).toBe(true);
    fireEvent.load(image);
    expect(image.classList.contains("opacity-0")).toBe(false);
  });

  it("shows an already loaded image immediately after a route remount", () => {
    const firstRender = render(
      <TokenIcon symbol="CETH" imageUrl="/v1/token-icons/CETH" displaySize={20} />
    );
    fireEvent.load(firstRender.getByRole("img", { name: "CETH" }));
    firstRender.unmount();

    const secondRender = render(
      <TokenIcon symbol="CETH" imageUrl="/v1/token-icons/CETH" displaySize={20} />
    );

    expect(secondRender.getByRole("img", { name: "CETH" }).classList.contains("opacity-0")).toBe(false);
  });
});

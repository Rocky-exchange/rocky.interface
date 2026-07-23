import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("lib/chains", () => ({
  useChainId: () => ({ chainId: 1 }),
}));
vi.mock("modules/lighter/api", () => ({
  useTradesUpdates: () => ({ lastTrade: null }),
}));
vi.mock("modules/lighter/api/hooks", () => ({
  useApiOrderbook: () => ({ orderbook: null }),
  useApiTrades: () => ({ trades: null }),
  usePrimitMarkets: () => ({
    data: {
      markets: [
        {
          symbol: "PEPE-USD",
          base_asset: "PEPE",
          tick_size: "0.00000001",
        },
      ],
    },
  }),
}));
vi.mock("modules/lighter/store/TradeStateContext", () => ({
  useTradeState: () => ({ selectedSymbol: "PEPE-USD" }),
}));
vi.mock("../../adapters/useOrderBookAdapter", () => ({
  useOrderBookAdapter: vi.fn(() => ({
    asks: [],
    bids: [],
    spread: 0,
    spreadPct: 0,
    tickSize: 0.01,
  })),
}));

import { OrderBookPanel } from "./OrderBookPanel";
import { useOrderBookAdapter } from "../../adapters/useOrderBookAdapter";

const mOrderBook = vi.mocked(useOrderBookAdapter);

i18n.load("en", {});
i18n.activate("en");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OrderBookPanel", () => {
  it("uses the current low-priced market tick as the smallest level on the first render", () => {
    mOrderBook.mockReturnValue({
      asks: [{ price: 0.00000289, size: 1_000_000, total: 1_000_000, quoteSize: 2.89, quoteTotal: 2.89 }],
      bids: [{ price: 0.00000288, size: 1_000_000, total: 1_000_000, quoteSize: 2.88, quoteTotal: 2.88 }],
      spread: 0.00000001,
      spreadPct: 0.346,
      tickSize: 0.00000001,
    });
    render(
      <I18nProvider i18n={i18n}>
        <OrderBookPanel layout="Tab" onLayoutChange={vi.fn()} />
      </I18nProvider>,
    );

    expect(document.body.textContent).toContain("0.00000289");
    expect(document.body.textContent).toContain("0.00000288");
    expect(mOrderBook.mock.calls[0]?.[0]).toBe("0.00000001");
  });
});

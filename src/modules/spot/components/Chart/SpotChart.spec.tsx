import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Loader/Loader", () => ({
  default: ({ variant }: { variant?: number }) => (
    <div data-testid="trade-chart-loader" data-variant={variant} role="status" aria-label="Loading" />
  ),
}));

import { SpotChart } from "./SpotChart";
import { SPOT_MARKETS } from "../../model/spotMarkets";
import { renderWithI18n as render } from "../../test/renderWithI18n";

type ReadyCallback = () => void;

describe("SpotChart loading state", () => {
  let chartReady: ReadyCallback | undefined;
  let dataReady: ReadyCallback | undefined;
  let widgetOptions: Record<string, unknown> | undefined;
  const setResolution = vi.fn();

  beforeEach(() => {
    chartReady = undefined;
    dataReady = undefined;
    widgetOptions = undefined;
    setResolution.mockReset();

    class Widget {
      constructor(options: Record<string, unknown>) {
        widgetOptions = options;
      }

      onChartReady(callback: ReadyCallback) {
        chartReady = callback;
      }

      activeChart() {
        return {
          dataReady(callback: ReadyCallback) {
            dataReady = callback;
          },
          setResolution,
        };
      }

      remove = vi.fn();
    }

    Object.assign(window, { TradingView: { widget: Widget } });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "TradingView");
  });

  it("uses the deterministic trade chart loader until TradingView data is ready", async () => {
    const { getByTestId, queryByTestId } = render(<SpotChart market={SPOT_MARKETS[0]} />);

    await waitFor(() => expect(chartReady).toBeTypeOf("function"));
    expect(getByTestId("trade-chart-loader")).toBeTruthy();
    expect(getByTestId("trade-chart-loader").dataset.variant).toBe("1");
    expect(getByTestId("spot-chart-container").style.visibility).toBe("hidden");

    act(() => chartReady?.());
    expect(getByTestId("trade-chart-loader")).toBeTruthy();

    act(() => dataReady?.());
    expect(queryByTestId("trade-chart-loader")).toBeNull();
    expect(getByTestId("spot-chart-container").style.visibility).toBe("visible");
  });

  it("uses the shared trade timeframe toolbar and drives TradingView resolution", async () => {
    render(<SpotChart market={SPOT_MARKETS[0]} />);

    await waitFor(() => expect(chartReady).toBeTypeOf("function"));
    expect(widgetOptions?.interval).toBe("15");
    expect(widgetOptions?.disabled_features).toEqual(expect.arrayContaining(["header_widget", "timeframes_toolbar"]));
    expect(screen.getByRole("button", { name: "5m" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "15m" }).className).toContain("tfActive");
    expect(screen.getByRole("button", { name: "1h" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "4h" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /More/ })).toBeTruthy();

    act(() => chartReady?.());
    fireEvent.click(screen.getByRole("button", { name: "1h" }));
    expect(setResolution).toHaveBeenCalledWith("60");
  });
});

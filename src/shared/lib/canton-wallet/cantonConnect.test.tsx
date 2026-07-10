import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CantonConnectModal,
  ROCKY_WALLET_CHROME_WEB_STORE_URL,
  closeCantonConnect,
  openCantonConnect,
} from "./cantonConnect";

const mocks = vi.hoisted(() => ({
  connectRockyWallet: vi.fn(),
  connectLoopWallet: vi.fn(),
  connectConsoleWallet: vi.fn(),
  createExchangeSession: vi.fn(),
  notifyCantonSessionChange: vi.fn(),
}));

vi.mock("@lingui/react", () => ({
  Trans: ({ children, message }: { children?: ReactNode; message?: string }) => <>{message || children}</>,
}));

vi.mock("./index", () => ({
  connectRockyWallet: mocks.connectRockyWallet,
  connectLoopWallet: mocks.connectLoopWallet,
  connectConsoleWallet: mocks.connectConsoleWallet,
  createExchangeSession: mocks.createExchangeSession,
}));

vi.mock("./useCantonSession", () => ({
  notifyCantonSessionChange: mocks.notifyCantonSessionChange,
}));

describe("CantonConnectModal", () => {
  afterEach(() => {
    closeCantonConnect();
    cleanup();
    vi.clearAllMocks();
    Reflect.deleteProperty(window, "rockyWallet");
  });

  it("opens the Rocky Wallet Chrome Web Store in a new tab when the extension is missing", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    openCantonConnect();
    render(<CantonConnectModal />);

    fireEvent.click(screen.getByRole("button", { name: "Rocky Wallet" }));

    expect(open).toHaveBeenCalledWith(
      ROCKY_WALLET_CHROME_WEB_STORE_URL,
      "_blank",
      "noopener,noreferrer"
    );
    expect(mocks.connectRockyWallet).not.toHaveBeenCalled();
  });

  it("shows a spinner prompt on the selected wallet while connecting", async () => {
    Object.defineProperty(window, "rockyWallet", {
      configurable: true,
      value: { isRockyWallet: true },
    });
    mocks.connectRockyWallet.mockReturnValue(new Promise(() => undefined));

    openCantonConnect();
    render(<CantonConnectModal />);

    fireEvent.click(screen.getByRole("button", { name: "Rocky Wallet" }));

    await waitFor(() => expect(screen.getByText("Connecting...")).toBeTruthy());
    expect((screen.getByRole("button", { name: "Rocky Wallet Connecting..." }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.queryByText("Connecting...", { selector: "span" })).toBeTruthy();
  });
});

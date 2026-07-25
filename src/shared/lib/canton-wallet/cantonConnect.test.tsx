import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CantonConnectModal, closeCantonConnect, openCantonConnect } from "./cantonConnect";

const mocks = vi.hoisted(() => ({
  connectRockyWallet: vi.fn(),
  connectLoopWallet: vi.fn(),
  connectConsoleWallet: vi.fn(),
  connectSendWallet: vi.fn(),
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
  connectSendWallet: mocks.connectSendWallet,
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
  });

  it("shows a spinner prompt on the selected wallet while connecting", async () => {
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

  it("connects Send Wallet and creates an exchange session", async () => {
    const connectedWallet = {
      connection: {
        provider: "send" as const,
        partyId: "send-user::1220send",
        metadata: { publicKey: "base64-spki", namespace: "1220send" },
      },
      signMessage: vi.fn(async () => "3044deadbeef"),
    };
    mocks.connectSendWallet.mockResolvedValue(connectedWallet);
    mocks.createExchangeSession.mockResolvedValue({});

    openCantonConnect();
    render(<CantonConnectModal />);
    fireEvent.click(screen.getByRole("button", { name: "Send Wallet" }));

    await waitFor(() => expect(mocks.connectSendWallet).toHaveBeenCalledTimes(1));
    expect(mocks.createExchangeSession).toHaveBeenCalledWith(
      connectedWallet.connection,
      connectedWallet.signMessage
    );
  });
});

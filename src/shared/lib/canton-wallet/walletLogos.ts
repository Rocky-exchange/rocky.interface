import consoleWalletLogo from "img/wallets/console-wallet-icon.svg";
import loopWalletLogo from "img/wallets/loop-wallet.svg";
import rockyWalletLogo from "img/wallets/rocky-wallet.png";
import sendWalletLogo from "img/wallets/send-wallet.svg";

import type { WalletProviderId } from "./types";

export type WalletLogoFit = "cover" | "contain";

export type WalletProviderLogo = {
  src: string;
  alt: string;
  fit: WalletLogoFit;
};

const WALLET_PROVIDER_LOGOS: Record<Exclude<WalletProviderId, "other">, WalletProviderLogo> = {
  rocky: {
    src: rockyWalletLogo,
    alt: "Rocky Wallet",
    fit: "cover",
  },
  loop: {
    src: loopWalletLogo,
    alt: "Loop Wallet",
    fit: "contain",
  },
  console: {
    src: consoleWalletLogo,
    alt: "Console Wallet",
    fit: "cover",
  },
  send: {
    src: sendWalletLogo,
    alt: "Send Wallet",
    fit: "cover",
  },
};

export function getWalletProviderLogo(provider: WalletProviderId | "" | undefined): WalletProviderLogo {
  if (provider === "rocky" || provider === "loop" || provider === "console" || provider === "send") {
    return WALLET_PROVIDER_LOGOS[provider];
  }

  return {
    src: rockyWalletLogo,
    alt: "Wallet",
    fit: "cover",
  };
}

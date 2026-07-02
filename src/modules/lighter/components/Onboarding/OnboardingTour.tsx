// First-visit guided walkthrough for the trade page (Binance/Hyperliquid-style).
// Uses driver.js to spotlight the key panels. Runs once on first visit
// (localStorage flag) and can be replayed via the floating "?" help button.
import { useCallback, useEffect } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./onboarding.css";

const SEEN_KEY = "rocky_onboarded_v1";

function buildTour(): Driver {
  return driver({
    showProgress: true,
    allowClose: true,
    overlayColor: "rgba(3, 5, 7, 0.75)",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Start trading",
    popoverClass: "rocky-tour",
    steps: [
      {
        popover: {
          title: "Welcome to Rocky 👋",
          description:
            "Trade BTC, ETH and CC perpetuals with up to 100x leverage, settled on the Canton Network. Here's a 30-second tour of the interface.",
        },
      },
      {
        element: '[data-tour="connect"]',
        popover: {
          title: "1 · Connect your wallet",
          description:
            "Connect your Canton wallet to deposit USDC and start trading. Your funds stay in your wallet — no custodial account.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: '[data-tour="market"]',
        popover: {
          title: "2 · Pick a market",
          description:
            "Switch between BTC, ETH and CC. Click the symbol to open the full market list with live price, 24h change and volume.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: '[data-tour="chart"]',
        popover: {
          title: "3 · Read the chart",
          description:
            "Live TradingView chart with full history. Switch timeframes (1m to 1w) and add indicators from the toolbar.",
          side: "right",
          align: "start",
        },
      },
      {
        element: '[data-tour="orderbook"]',
        popover: {
          title: "4 · Order book & trades",
          description: "Live bids and asks, plus the recent-trades tape, so you can see where liquidity sits.",
          side: "left",
          align: "start",
        },
      },
      {
        element: '[data-tour="orderform"]',
        popover: {
          title: "5 · Place an order",
          description:
            "Choose Buy / Long or Sell / Short, set your amount and leverage (up to 100x), then submit. Market or limit — your call.",
          side: "left",
          align: "start",
        },
      },
      {
        element: '[data-tour="positions"]',
        popover: {
          title: "6 · Manage positions",
          description:
            "Your open positions, orders and history live here. Close any position with one click — Rocky places the closing order for you.",
          side: "top",
          align: "start",
        },
      },
      {
        popover: {
          title: "You're all set 🚀",
          description:
            "That's it. Connect your wallet, pick a market and place your first order. You can replay this tour anytime from the “?” button.",
        },
      },
    ],
  });
}

export function startOnboardingTour() {
  // Small delay so target elements are laid out before spotlighting.
  window.setTimeout(() => buildTour().drive(), 150);
}

export function OnboardingTour() {
  const replay = useCallback(() => startOnboardingTour(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
    startOnboardingTour();
  }, []);

  return (
    <button type="button" className="rocky-tour-help" onClick={replay} aria-label="Show interface guide" title="Interface guide">
      ?
    </button>
  );
}

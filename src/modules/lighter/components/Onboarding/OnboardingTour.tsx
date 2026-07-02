// First-visit guided walkthrough for the trade page (Binance/Hyperliquid-style).
// Uses driver.js to spotlight the key panels. Runs once on first visit
// (localStorage flag) and can be replayed via the floating "?" help button.
//
// The app only ships en + zh (see shared/lib/i18n.ts `locales`), so the tour
// copy is a small bilingual map keyed by the active locale — reliable and free
// of the lingui-macro/catalog id resolution that doesn't survive into this
// module-scope, non-render code path.
import { useCallback, useEffect } from "react";
import { driver, type Driver } from "driver.js";
import { i18n } from "@lingui/core";
import "driver.js/dist/driver.css";
import "./onboarding.css";

const SEEN_KEY = "rocky_onboarded_v1";

type Copy = {
  next: string;
  back: string;
  done: string;
  steps: { title: string; description: string }[];
};

const EN: Copy = {
  next: "Next",
  back: "Back",
  done: "Start trading",
  steps: [
    {
      title: "Welcome to Rocky 👋",
      description:
        "Trade BTC, ETH and CC perpetuals with up to 100x leverage, settled on the Canton Network. Here's a 30-second tour of the interface.",
    },
    {
      title: "1 · Connect your wallet",
      description:
        "Connect your Canton wallet to deposit USDC and start trading. Your funds stay in your wallet — no custodial account.",
    },
    {
      title: "2 · Pick a market",
      description:
        "Switch between BTC, ETH and CC. Click the symbol to open the full market list with live price, 24h change and volume.",
    },
    {
      title: "3 · Read the chart",
      description:
        "Live TradingView chart with full history. Switch timeframes (1m to 1w) and add indicators from the toolbar.",
    },
    {
      title: "4 · Order book & trades",
      description: "Live bids and asks, plus the recent-trades tape, so you can see where liquidity sits.",
    },
    {
      title: "5 · Place an order",
      description:
        "Choose Buy / Long or Sell / Short, set your amount and leverage (up to 100x), then submit. Market or limit — your call.",
    },
    {
      title: "6 · Manage positions",
      description:
        "Your open positions, orders and history live here. Close any position with one click — Rocky places the closing order for you.",
    },
    {
      title: "You're all set 🚀",
      description:
        "That's it. Connect your wallet, pick a market and place your first order. You can replay this tour anytime from the “?” button.",
    },
  ],
};

const ZH: Copy = {
  next: "下一步",
  back: "上一步",
  done: "开始交易",
  steps: [
    {
      title: "欢迎来到 Rocky 👋",
      description:
        "交易 BTC、ETH、CC 永续合约，最高 100 倍杠杆，由 Canton 网络结算。下面是 30 秒的界面导览。",
    },
    {
      title: "1 · 连接钱包",
      description: "连接你的 Canton 钱包以充值 USDC 并开始交易。资金始终留在你的钱包中——无需托管账户。",
    },
    {
      title: "2 · 选择交易对",
      description:
        "在 BTC、ETH、CC 之间切换。点击交易对可打开完整市场列表，查看实时价格、24 小时涨跌与成交量。",
    },
    {
      title: "3 · 看懂图表",
      description: "实时 TradingView 图表，历史完整。可切换周期（1 分钟到 1 周）并从工具栏添加指标。",
    },
    {
      title: "4 · 订单簿与成交",
      description: "实时买卖盘口与最新成交记录，让你看清流动性所在。",
    },
    {
      title: "5 · 下单",
      description: "选择买入/做多或卖出/做空，设置数量与杠杆（最高 100 倍），然后提交。市价或限价，由你决定。",
    },
    {
      title: "6 · 管理持仓",
      description: "你的持仓、订单与历史都在这里。一键平仓——Rocky 会自动为你下平仓单。",
    },
    {
      title: "一切就绪 🚀",
      description: "就是这样。连接钱包、选择交易对、下第一单吧。你可以随时点击“?”按钮重看本导览。",
    },
  ],
};

function pickCopy(): Copy {
  const locale = (i18n.locale || "en").toLowerCase();
  return locale.startsWith("zh") ? ZH : EN;
}

function buildTour(): Driver {
  const c = pickCopy();
  const anchors = [
    undefined,
    '[data-tour="connect"]',
    '[data-tour="market"]',
    '[data-tour="chart"]',
    '[data-tour="orderbook"]',
    '[data-tour="orderform"]',
    '[data-tour="positions"]',
    undefined,
  ];
  const sides: Array<"top" | "bottom" | "left" | "right" | undefined> = [
    undefined,
    "bottom",
    "bottom",
    "right",
    "left",
    "left",
    "top",
    undefined,
  ];
  const aligns: Array<"start" | "center" | "end"> = [
    "center",
    "end",
    "start",
    "start",
    "start",
    "start",
    "start",
    "center",
  ];
  return driver({
    showProgress: true,
    allowClose: true,
    overlayColor: "rgba(3, 5, 7, 0.75)",
    nextBtnText: c.next,
    prevBtnText: c.back,
    doneBtnText: c.done,
    popoverClass: "rocky-tour",
    steps: c.steps.map((s, i) => ({
      element: anchors[i],
      popover: { title: s.title, description: s.description, side: sides[i], align: aligns[i] },
    })),
  });
}

export function startOnboardingTour() {
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
    <button
      type="button"
      className="rocky-tour-help"
      onClick={replay}
      aria-label="Show interface guide"
      title="Interface guide"
    >
      ?
    </button>
  );
}

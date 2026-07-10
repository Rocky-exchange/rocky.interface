// First-visit "getting started" checklist, shown before the spotlight tour.
// A static preview of the four steps from zero to a first trade — it does not
// track real progress. "Show me around" launches the driver.js tour; "Skip for
// now" just dismisses it.
//
// Copy is a small bilingual map keyed by the active locale, matching the
// approach in OnboardingTour.tsx (the app ships only en + zh).
import { i18n } from "@lingui/core";

import Button from "components/Button/Button";
import Modal from "components/Modal/Modal";

type Step = { num: string; title: string; desc: string };

type Copy = {
  title: string;
  intro: string;
  showMeAround: string;
  skip: string;
  steps: Step[];
};

const EN: Copy = {
  title: "Welcome to Rocky 👋",
  intro: "Four steps from zero to your first trade:",
  showMeAround: "Show me around",
  skip: "Skip for now",
  steps: [
    { num: "1", title: "Connect wallet", desc: "Use the button in the top-right corner." },
    { num: "2", title: "Establish connection", desc: "One gas-free signature to authenticate." },
    { num: "3", title: "Deposit funds", desc: "Top up your trading account with USDC." },
    { num: "4", title: "Place your first order", desc: "Pick a market, set size and leverage, go." },
  ],
};

const ZH: Copy = {
  title: "欢迎来到 Rocky 👋",
  intro: "四步，从零到你的第一笔交易：",
  showMeAround: "带我看看",
  skip: "暂时跳过",
  steps: [
    { num: "1", title: "连接钱包", desc: "点击右上角的按钮。" },
    { num: "2", title: "建立连接", desc: "一次免 Gas 签名完成身份验证。" },
    { num: "3", title: "充值资金", desc: "用 USDC 为你的交易账户充值。" },
    { num: "4", title: "下第一单", desc: "选择交易对，设置数量与杠杆，出发。" },
  ],
};

function pickCopy(): Copy {
  const locale = (i18n.locale || "en").toLowerCase();
  return locale.startsWith("zh") ? ZH : EN;
}

export function WelcomeModal({
  isVisible,
  onStartTour,
  onDismiss,
}: {
  isVisible: boolean;
  onStartTour: () => void;
  onDismiss: () => void;
}) {
  const c = pickCopy();

  return (
    <Modal
      isVisible={isVisible}
      setIsVisible={(visible: boolean) => {
        if (!visible) onDismiss();
      }}
      label={c.title}
      qa="onboarding-welcome"
    >
      <div className="rocky-welcome">
        <p className="rocky-welcome-intro">{c.intro}</p>
        <ol className="rocky-welcome-steps">
          {c.steps.map((step) => (
            <li key={step.num} className="rocky-welcome-step">
              <span className="rocky-welcome-step-num">{step.num}</span>
              <span className="rocky-welcome-step-text">
                <span className="rocky-welcome-step-title">{step.title}</span>
                <span className="rocky-welcome-step-desc">{step.desc}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="rocky-welcome-actions">
          <Button
            variant="primary"
            size="controlled"
            className="rocky-welcome-primary"
            onClick={onStartTour}
            qa="onboarding-start-tour"
          >
            {c.showMeAround}
          </Button>
          <Button variant="secondary" size="controlled" onClick={onDismiss} qa="onboarding-skip">
            {c.skip}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

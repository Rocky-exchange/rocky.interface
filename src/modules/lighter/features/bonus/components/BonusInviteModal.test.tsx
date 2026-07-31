import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOgBenefits } from "@/modules/campaigns/api/campaign.api";
import { useCantonSession } from "@/shared/lib/canton-wallet/useCantonSession";
// @ts-expect-error The Lingui Vite loader provides PO modules at runtime.
import { messages as zhMessages } from "@/shared/locales/zh/messages.po";

import { BonusInviteModal } from "./BonusInviteModal";
import { useBonusStatus } from "../api/useBonus";

vi.mock("@/modules/campaigns/api/campaign.api", () => ({
  claimOgTrialFund: vi.fn(),
  getOgBenefits: vi.fn(),
}));

vi.mock("@/shared/lib/canton-wallet/cantonConnect", () => ({
  openCantonConnect: vi.fn(),
}));

vi.mock("@/shared/lib/canton-wallet/useCantonSession", () => ({
  useCantonSession: vi.fn(),
}));

vi.mock("@/shared/ui", () => ({
  ModalWithPortal: ({
    children,
    isVisible,
  }: PropsWithChildren<{ isVisible: boolean }>) =>
    isVisible ? <div role="dialog">{children}</div> : null,
}));

vi.mock("../api/useBonus", () => ({
  notifyBonusDataChanged: vi.fn(),
  useBonusBalance: vi.fn(),
  useBonusHistory: vi.fn(),
  useBonusStatus: vi.fn(),
}));

const mGetOgBenefits = vi.mocked(getOgBenefits);
const mUseCantonSession = vi.mocked(useCantonSession);
const mUseBonusStatus = vi.mocked(useBonusStatus);

describe("BonusInviteModal localization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    i18n.load("en", {});
    i18n.activate("en");
    mUseCantonSession.mockReturnValue({
      connected: true,
      locked: false,
      token: "session",
      party: "party::user",
      username: "user",
      avatar: "",
      provider: "console",
    });
    mUseBonusStatus.mockReturnValue({
      data: {
        has_bonus: false,
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBonusStatus>);
    mGetOgBenefits.mockResolvedValue({
      role: "NORMAL",
      eligible: false,
      invitationCodes: [],
      invitationBinding: null,
      trialFund: {
        status: "NOT_ELIGIBLE",
        amount: "20",
        bonusAccountId: null,
        claimedAt: null,
      },
    });
  });

  afterEach(cleanup);

  it("does not leak Chinese eligibility text into the English claim view", async () => {
    render(
      <I18nProvider i18n={i18n}>
        <BonusInviteModal open onClose={vi.fn()} />
      </I18nProvider>
    );

    await waitFor(() => expect(mGetOgBenefits).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText("Not eligible")).toHaveLength(2);
    expect(screen.queryByText("暂无资格")).toBeNull();
  });

  it("renders the complete claim view in Traditional Chinese", async () => {
    i18n.load("zh", zhMessages);
    i18n.activate("zh");

    render(
      <I18nProvider i18n={i18n}>
        <BonusInviteModal open onClose={vi.fn()} />
      </I18nProvider>
    );

    await waitFor(() => expect(mGetOgBenefits).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "領取體驗金" })).not.toBeNull();
    expect(screen.getByText("符合資格的 OG 用戶可主動領取 20U 體驗金。")).not.toBeNull();
    expect(screen.getAllByText("暫無資格")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /查看規則/ })).not.toBeNull();
    expect(
      screen.getByText("每位符合資格的 OG 用戶可領取一次體驗金。體驗金有效期為七天。")
    ).not.toBeNull();
  });
});

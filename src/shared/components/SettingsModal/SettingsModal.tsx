import { msg } from "@lingui/macro";
import cx from "classnames";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { useSettings } from "@/modules/lighter/context/SettingsContext";
import { useLocalizedMap } from "lib/i18n";

import { SlideModal } from "components/Modal/SlideModal";
import Tabs from "components/Tabs/Tabs";

import { TradingSettings } from "./TradingSettings";

const SETTINGS_TABS = ["trading"] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number];

const TAB_LABELS = {
  trading: msg`Trading`,
};

export function SettingsModal({
  isSettingsVisible,
  setIsSettingsVisible,
}: {
  isSettingsVisible: boolean;
  setIsSettingsVisible: (value: boolean) => void;
}) {
  const settings = useSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>("trading");

  useEffect(() => {
    if (!isSettingsVisible) return;

    if (settings.settingsWarningDotVisible) {
      settings.setSettingsWarningDotVisible(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsVisible]);

  const onClose = useCallback(() => {
    setIsSettingsVisible(false);
  }, [setIsSettingsVisible]);

  const tabLabels = useLocalizedMap(TAB_LABELS);

  const tabOptions = useMemo(
    () =>
      SETTINGS_TABS.map((tab) => ({
        value: tab,
        label: tabLabels[tab],
      })),
    [tabLabels]
  );

  return (
    <SlideModal
      isVisible={isSettingsVisible}
      setIsVisible={setIsSettingsVisible}
      label={tabLabels.trading}
      qa="settings-modal"
      className="text-body-medium text-typography-secondary"
    >
      <div className="flex flex-col gap-8">
        <Tabs options={tabOptions} selectedValue={activeTab} onChange={setActiveTab} type="block" qa="settings-tabs" />
        <div className="flex max-w-[380px] flex-row items-start overflow-x-hidden max-md:max-w-none">
          <TabWrapper tab="trading" activeTab={activeTab}>
            <TradingSettings onClose={onClose} />
          </TabWrapper>
        </div>
      </div>
    </SlideModal>
  );
}

function TabWrapper({ tab, activeTab, children }: { tab: SettingsTab; activeTab: SettingsTab; children: ReactNode }) {
  return (
    <div
      className={cx("w-[380px] shrink-0 max-md:w-full", {
        "max-md:hidden md:invisible": activeTab !== tab,
        "order-first": activeTab === tab,
      })}
    >
      {children}
    </div>
  );
}

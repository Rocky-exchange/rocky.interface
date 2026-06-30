import { Trans } from "@lingui/macro";
import { useHistory } from "react-router-dom";

import ApiKeyIcon from "img/ic_lock.svg?react";
import HourGlassIcon from "img/ic_hourglass.svg?react";

import { SettingButton, SettingsSection } from "./shared";

interface TradingSettingsProps {
  onClose: () => void;
}

export function TradingSettings({ onClose }: TradingSettingsProps) {
  const history = useHistory();

  return (
    <div>
      <SettingsSection>
        <div className="text-14 font-medium text-typography-primary">
          <Trans>Trading Mode</Trans>
        </div>
        <SettingButton
          title={<Trans>Canton</Trans>}
          description={<Trans>Orders are routed through Rocky exchange session APIs.</Trans>}
          icon={<HourGlassIcon className="size-28" />}
          active
          onClick={() => undefined}
        />
        <div className="opacity-0">
          version:
          {(import.meta.env.VITE_GIT_COMMIT_HASH || import.meta.env.VITE_APP_VERSION || "unknown").substring(0, 8)}
        </div>
      </SettingsSection>

      <SettingsSection className="mt-2">
        <SettingButton
          title={<Trans>API Keys</Trans>}
          icon={<ApiKeyIcon className="size-24" />}
          description={<Trans>Manage API keys for programmatic trading access.</Trans>}
          onClick={() => {
            onClose();
            history.push("/keys");
          }}
        />
      </SettingsSection>
    </div>
  );
}

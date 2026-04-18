import Button from "components/Button/Button";

// import OneClickIcon from "img/ic_one_click.svg?react";
import SettingsIcon from "img/ic_settings.svg?react";


export function OneClickButton({ openSettings }: { openSettings: () => void }) {
  return (
    <Button variant="secondary" size="controlled" onClick={openSettings} className="size-32 !p-0 md:size-40">
      <SettingsIcon className="size-20 p-0" />
    </Button>
  );
}

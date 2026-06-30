// Shared advanced order-type list + localized labels, mirroring the desktop
// OrderFormPanel so the mobile sheet stays in lockstep with Web.
import type { AdvancedMode } from "./types";

export const ADVANCED_MODES: AdvancedMode[] = [
  "Stop Market",
  "Stop Limit",
  "Take Profit Market",
  "Take Profit Limit",
];

const ADVANCED_MODE_LABELS: Record<AdvancedMode, { en: string; zh: string }> = {
  "Stop Market": { en: "S/L Market", zh: "止損市價單" },
  "Stop Limit": { en: "S/L Limit", zh: "止損限價單" },
  "Take Profit Market": { en: "T/P Market", zh: "止盈市價單" },
  "Take Profit Limit": { en: "T/P Limit", zh: "止盈限價單" },
};

export function isAdvancedMode(mode: string): mode is AdvancedMode {
  return (ADVANCED_MODES as string[]).includes(mode);
}

export function pickAdvancedLabel(mode: AdvancedMode, locale: string): string {
  const entry = ADVANCED_MODE_LABELS[mode];
  return locale.startsWith("zh") ? entry.zh : entry.en;
}

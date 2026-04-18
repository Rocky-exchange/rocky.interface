import { useMemo } from "react";

import { useZtdxUserUnifiedAccount } from "modules/cex/lib/api/hooks";

import { mapUnifiedAccountToPanelModel, type LighterUnifiedAccountPanelModel } from "./unifiedAccountMapping";

export function useUnifiedAccountAdapter(): LighterUnifiedAccountPanelModel {
  const { data } = useZtdxUserUnifiedAccount();

  return useMemo(() => mapUnifiedAccountToPanelModel(data), [data]);
}

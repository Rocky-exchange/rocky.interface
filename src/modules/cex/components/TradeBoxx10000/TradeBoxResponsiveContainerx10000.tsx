import { useBreakpoints } from "lib/useBreakpoints";

import { Curtainx10000 } from "./Curtainx10000";
import { TradeBoxx10000 } from "./TradeBoxx10000";
import { TradeBoxHeaderTabsx10000 } from "./TradeBoxHeaderTabsx10000";

export function TradeBoxResponsiveContainerx10000() {
  const { isTablet } = useBreakpoints();

  if (!isTablet) {
    return (
      <div className="text-body-medium flex flex-col rounded-8" data-qa="tradeboxx10000">
        <TradeBoxHeaderTabsx10000 />
        <TradeBoxx10000 isMobile={isTablet} />
      </div>
    );
  }

  return (
    <Curtainx10000 header={<TradeBoxHeaderTabsx10000 isInCurtain />} dataQa="tradeboxx10000">
      <TradeBoxx10000 isMobile={isTablet} />
    </Curtainx10000>
  );
}

import type { GlobalExpressParams } from "domain/synthetics/express/types";
import type { FindSwapPath } from "sdk/types/trade";

import { createSelector } from "../utils";

export const selectGasPaymentToken = createSelector(() => undefined);

export const selectRelayerFeeToken = createSelector(() => undefined);

export const selectIsExpressTransactionAvailable = createSelector(() => false);

export const selectExpressGlobalParams = createSelector((): GlobalExpressParams | undefined => undefined);

export const selectExpressFindSwapPath = createSelector((): FindSwapPath => () => undefined);

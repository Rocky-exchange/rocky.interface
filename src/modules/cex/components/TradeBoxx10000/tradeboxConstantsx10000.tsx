import { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";

import { TradeMode, TradeType } from "domain/synthetics/trade";

import LongIcon from "img/long.svg?react";
import ShortIcon from "img/short.svg?react";
import SwapIcon from "img/swap.svg?react";

export const tradeTypeIconsx10000 = {
  [TradeType.Long]: <LongIcon />,
  [TradeType.Short]: <ShortIcon />,
  [TradeType.Swap]: <SwapIcon />,
};

export const tradeModeLabelsx10000: Record<TradeMode, MessageDescriptor> = {
  [TradeMode.Market]: msg`Market Order`,
  [TradeMode.Limit]: msg`Limit Order`,
  [TradeMode.Trigger]: msg`TP/SL`,
  [TradeMode.StopMarket]: msg`Stop Market`,
  [TradeMode.Twap]: msg`TWAP`,
};

export const tradeTypeLabelsx10000 = {
  [TradeType.Long]: msg`Long`,
  [TradeType.Short]: msg`Short`,
  [TradeType.Swap]: msg`Swap`,
};

/**
 * Colors are exceptions from palette
 * @see https://www.figma.com/design/U973bt4fbRrn9jTg2GfVTd/%F0%9F%93%8A-Trade-Page?node-id=896-87735&t=gJBQW6iIUmrYfMaP-0
 */
export const tradeTypeClassNamesx10000 = {
  [TradeType.Long]: {
    // trade-direction-tab--active 会自动添加，这里只保留额外的样式
    active: "pb-9",
  },
  [TradeType.Short]: {
    active: "pb-9",
  },
  [TradeType.Swap]: {
    active: "pb-9",
  },
};

export const mobileTradeTypeClassNamesx10000 = {
  [TradeType.Long]: "!bg-green-500/20 border-b-2 border-b-green-500",
  [TradeType.Short]: "!bg-red-500/20 border-b-2 border-b-red-500",
  [TradeType.Swap]: "!bg-blue-300/20 border-b-2 border-b-blue-300",
};

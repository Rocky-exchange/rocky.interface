import type { MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { useMemo } from "react";

import { OrderTypeFilterValue } from "domain/synthetics/orders/ordersFilters";
import { shouldUseApiOrders } from "@/modules/cex/lib/api";

import { TableOptionsFilter } from "components/TableOptionsFilter/TableOptionsFilter";

type Item = {
  data: OrderTypeFilterValue;
  hidden?: boolean;
  text: MessageDescriptor;
};

type Group = {
  groupName: MessageDescriptor;
  items: Item[];
};

type Groups = Group[];

const GROUPS: Groups = [
  {
    groupName: msg`Trigger Orders`,
    items: [
      {
        data: "trigger-limit",
        text: msg`Limit`,
      },
      {
        data: "trigger-take-profit",
        text: msg`Take Profit`,
      },
      {
        data: "trigger-stop-loss",
        text: msg`Stop Loss`,
      },
    ],
  },
  {
    groupName: msg`TWAP`,
    items: [
      {
        data: "twap",
        text: msg`TWAP`,
        hidden: true,
      },
    ],
  },
  {
    groupName: msg`Swaps`,
    items: [
      {
        data: "swaps-limit",
        text: msg`Limit`,
      },
      {
        data: "swaps-twap",
        text: msg`TWAP`,
      },
    ],
  },
];

// Simplified groups for x10000 mode: Market, Limit, Stop Loss, Take Profit
const X10000_GROUPS: Groups = [
  {
    groupName: msg`Order Type`,
    items: [
      {
        data: "market",
        text: msg`Market Order`,
      },
      {
        data: "limit",
        text: msg`Limit Order`,
      },
      {
        data: "stop-loss",
        text: msg`Stop Loss`,
      },
      {
        data: "take-profit",
        text: msg`Take Profit`,
      },
    ],
  },
];

type Props = {
  value: OrderTypeFilterValue[];
  onChange: (value: OrderTypeFilterValue[]) => void;
  asButton?: boolean;
};

export function OrderTypeFilter({ value, onChange, asButton }: Props) {
  const { i18n } = useLingui();
  const isX10000Mode = shouldUseApiOrders();
  
  const localizedGroups = useMemo(() => {
    const groupsToUse = isX10000Mode ? X10000_GROUPS : GROUPS;
    return groupsToUse.map((group) => {
      return {
        groupName: i18n._(group.groupName),
        items: group.items.map((item) => {
          return {
            data: item.data,
            text: i18n._(item.text),
            hidden: item.hidden,
          };
        }),
      };
    });
  }, [i18n, isX10000Mode]);

  return (
    <TableOptionsFilter<OrderTypeFilterValue>
      multiple
      label={t`Type`}
      placeholder={t`Search Type`}
      value={value}
      options={localizedGroups}
      onChange={onChange}
      popupPlacement="bottom-start"
      asButton={asButton}
    />
  );
}

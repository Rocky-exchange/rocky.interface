import type { MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { useMemo } from "react";

import { TableOptionsFilter } from "components/TableOptionsFilter/TableOptionsFilter";

// Order status values from API
export type OrderStatusFilterValue =
  | "pending"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected"
  | "expired";

type Item = {
  data: OrderStatusFilterValue;
  text: MessageDescriptor;
};

type Group = {
  groupName: MessageDescriptor;
  items: Item[];
};

type Groups = Group[];

const STATUS_GROUPS: Groups = [
  {
    groupName: msg`Active`,
    items: [
      {
        data: "open",
        text: msg`Open`,
      },
      {
        data: "pending",
        text: msg`Pending`,
      },
      {
        data: "partially_filled",
        text: msg`Partially Filled`,
      },
    ],
  },
  {
    groupName: msg`Completed`,
    items: [
      {
        data: "filled",
        text: msg`Filled`,
      },
      {
        data: "cancelled",
        text: msg`Cancelled`,
      },
      {
        data: "rejected",
        text: msg`Rejected`,
      },
      {
        data: "expired",
        text: msg`Expired`,
      },
    ],
  },
];

type Props = {
  value: OrderStatusFilterValue[];
  onChange: (value: OrderStatusFilterValue[]) => void;
  asButton?: boolean;
};

export function OrderStatusFilter({ value, onChange, asButton }: Props) {
  const { i18n } = useLingui();

  const localizedGroups = useMemo(() => {
    return STATUS_GROUPS.map((group) => {
      return {
        groupName: i18n._(group.groupName),
        items: group.items.map((item) => {
          return {
            data: item.data,
            text: i18n._(item.text),
          };
        }),
      };
    });
  }, [i18n]);

  return (
    <TableOptionsFilter<OrderStatusFilterValue>
      multiple
      label={t`Status`}
      placeholder={t`Search Status`}
      value={value}
      options={localizedGroups}
      onChange={onChange}
      popupPlacement="bottom-start"
      asButton={asButton}
    />
  );
}

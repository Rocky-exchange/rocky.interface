import { AVALANCHE, getChainName } from "config/chains";
import { getChainIcon } from "config/icons";

export type NetworkOption = {
  label: string;
  value: number;
  icon: string;
  color: string;
};

export const NETWORK_OPTIONS: NetworkOption[] = [
  {
    label: getChainName(AVALANCHE),
    value: AVALANCHE,
    icon: getChainIcon(AVALANCHE),
    color: "#e84142",
  },
];

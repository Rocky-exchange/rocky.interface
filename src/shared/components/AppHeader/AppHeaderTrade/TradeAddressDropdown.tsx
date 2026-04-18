import { AddressDropdown as BaseAddressDropdown } from "components/AddressDropdown/AddressDropdown";

type Props = React.ComponentProps<typeof BaseAddressDropdown>;

export function TradeAddressDropdown(props: Props) {
  // Per-route address dropdown customization for /trade can be added here later.
  return <BaseAddressDropdown {...props} />;
}



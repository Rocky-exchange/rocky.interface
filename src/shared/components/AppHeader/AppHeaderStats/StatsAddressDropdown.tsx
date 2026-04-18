import { AddressDropdown as BaseAddressDropdown } from "components/AddressDropdown/AddressDropdown";

type Props = React.ComponentProps<typeof BaseAddressDropdown>;

export function StatsAddressDropdown(props: Props) {
  return <BaseAddressDropdown {...props} />;
}



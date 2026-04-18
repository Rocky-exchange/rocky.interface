import { AddressDropdown as BaseAddressDropdown } from "components/AddressDropdown/AddressDropdown";

type Props = React.ComponentProps<typeof BaseAddressDropdown>;

export function EarnAddressDropdown(props: Props) {
  return <BaseAddressDropdown {...props} />;
}


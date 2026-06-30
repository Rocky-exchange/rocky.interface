import { AddressDropdownWithoutMultichain } from "./AddressDropdownWithoutMultichain";

type Props = {
  account: string;
};

export function AddressDropdownWithMultichain({ account }: Props) {
  return <AddressDropdownWithoutMultichain account={account} />;
}
